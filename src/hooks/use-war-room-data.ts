'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '@/lib/websocket';
import type { EnhancedFlowStats, EnhancedOptionTrade } from '@/types/flow';

// ============================================
// MARKET SESSION DETECTION
// ============================================
type MarketSession = 'pre-market' | 'open' | 'after-hours' | 'closed';

function getMarketSession(): MarketSession {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  
  if (day === 0 || day === 6) return 'closed';
  
  const timeInMinutes = hour * 60 + minute;
  
  if (timeInMinutes >= 240 && timeInMinutes < 570) return 'pre-market';
  if (timeInMinutes >= 570 && timeInMinutes < 960) return 'open';
  if (timeInMinutes >= 960 && timeInMinutes < 1200) return 'after-hours';
  return 'closed';
}

// ============================================
// TYPES
// ============================================
interface PreMarketData {
  gap: number;
  gapDirection: 'UP' | 'DOWN' | 'FLAT';
  spyGap: number;
  relativeStrength: number;
  preMarketVolume: number;
  avgPreMarketVolume: number;
  volumeRatio: number;
  catalyst: string | null;
}

interface RSSummary {
  tickerChange: number;
  spyChange: number;
  qqqChange: number;
  rsVsSpy: number;
  rsVsQqq: number;
  corrSpy: number;
  corrQqq: number;
  regime: string;
  session?: string;
}

interface WarRoomData {
  price: number;
  change: number;
  changePercent: number;
  
  flow: {
    stats: EnhancedFlowStats | null;
    trades: EnhancedOptionTrade[];
    loading: boolean;
    error: string | null;
  };
  
  darkpool: {
    prints: any[];
    stats: any;
    loading: boolean;
    error: string | null;
    meta?: any;
  };
  
  news: {
    items: any[];
    loading: boolean;
  };
  
  levels: {
    callWall: number | null;
    putWall: number | null;
    maxGamma: number | null;
    gexFlip: number | null;
    maxPain: number | null;
    vwap: number | null;
  };
  
  verdict: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number;
    summary: string;
    signals: {
      flow: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      darkpool: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
      newsAlignment: boolean;
    };
  };
  
  // Session awareness
  marketSession: MarketSession;
  preMarketData: PreMarketData | null;
  
  // Relative Strength
  relativeStrength: RSSummary | null;
  
  refresh: () => void;
  isLoading: boolean;
  lastUpdate: Date | null;
}

export function useWarRoomData(
  ticker: string, 
  timeframeParams?: { timestampGte: number; timestampLte: number; timeFilter: string }
): WarRoomData {
  const { getQuote, subscribe } = useWebSocket();
  const [data, setData] = useState<Partial<WarRoomData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const fetchInProgress = useRef(false);
  const [priceData, setPriceData] = useState({ price: 0, change: 0, changePercent: 0 });
  const [preMarketData, setPreMarketData] = useState<PreMarketData | null>(null);
  const [relativeStrength, setRelativeStrength] = useState<RSSummary | null>(null);
  
  // Detect market session (updates every 30s)
  const [marketSession, setMarketSession] = useState<MarketSession>(getMarketSession());
  
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketSession(getMarketSession());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Subscribe to WebSocket for real-time price
  useEffect(() => {
    if (!ticker) return;
    subscribe([ticker]);
  }, [ticker, subscribe]);

  // ============================================
  // PRE-MARKET: Fetch gap data vs SPY
  // ============================================
  useEffect(() => {
    // Ensure ticker is not empty to prevent API errors
    if (!ticker || ticker.trim() === '' || marketSession !== 'pre-market') {
      setPreMarketData(null);
      return;
    }
    
    const fetchPreMarketData = async () => {
      try {
        const [tickerRes, spyRes] = await Promise.all([
          fetch(`/api/market/prices?tickers=${ticker}`),
          fetch(`/api/market/prices?tickers=SPY`),
        ]);
        const [tickerJson, spyJson] = await Promise.all([tickerRes.json(), spyRes.json()]);
        
        const tickerPriceData = Array.isArray(tickerJson.data)
          ? tickerJson.data.find((p: any) => p.ticker === ticker) : tickerJson.data;
        const spyPriceData = Array.isArray(spyJson.data)
          ? spyJson.data.find((p: any) => p.ticker === 'SPY') : spyJson.data;
        
        if (!tickerPriceData) return;
        
        const tickerGap = tickerPriceData.changePercent || 0;
        const spyGap = spyPriceData?.changePercent || 0;
        const preMarketVolume = tickerPriceData.volume || 0;
        const avgPreMarketVolume = (tickerPriceData.avgVolume || 0) * 0.05;
        
        let catalyst: string | null = null;
        try {
          const newsRes = await fetch(`/api/news?tickers=${ticker}&limit=1`);
          const newsJson = await newsRes.json();
          const items = newsJson.data?.articles || newsJson.data?.news || newsJson.data || [];
          if (items.length > 0) {
            const headline = items[0].title || items[0].headline || '';
            const publishedAt = items[0].publishedAt || items[0].published_utc || '';
            if (publishedAt) {
              const publishedTime = new Date(publishedAt).getTime();
              if (publishedTime > Date.now() - 12 * 60 * 60 * 1000 && headline.length > 10) {
                catalyst = headline.length > 80 ? headline.substring(0, 77) + '...' : headline;
              }
            }
          }
        } catch {}
        
        setPreMarketData({
          gap: tickerGap,
          gapDirection: tickerGap > 0.15 ? 'UP' : tickerGap < -0.15 ? 'DOWN' : 'FLAT',
          spyGap,
          relativeStrength: tickerGap - spyGap,
          preMarketVolume,
          avgPreMarketVolume,
          volumeRatio: avgPreMarketVolume > 0 ? preMarketVolume / avgPreMarketVolume : 0,
          catalyst,
        });
      } catch (err) {
        console.error('[WarRoom] Pre-market data fetch error:', err);
      }
    };
    
    fetchPreMarketData();
    const interval = setInterval(fetchPreMarketData, 60000);
    return () => clearInterval(interval);
  }, [ticker, marketSession]);

  // ============================================
  // RELATIVE STRENGTH: Fetch RS vs SPY/QQQ
  // (now works for all sessions including pre-market)
  // ============================================
  useEffect(() => {
    if (!ticker) return;
    
    const fetchRS = async () => {
      try {
        const res = await fetch(`/api/market/relative-strength?ticker=${ticker}`);
        const json = await res.json();
        if (json.success && json.data?.summary) {
          setRelativeStrength(json.data.summary);
          
          // During pre-market, also update preMarketData with RS-derived info
          // so the ML feature assembler gets the gap data
          if (json.data.summary.session === 'pre-market' && json.data.snapshot) {
            const snap = json.data.snapshot;
            const tickerSnap = snap[ticker];
            const spySnap = snap['SPY'];
            if (tickerSnap && !preMarketData) {
              setPreMarketData(prev => prev || {
                gap: tickerSnap.changePct || 0,
                gapDirection: (tickerSnap.changePct || 0) > 0.15 ? 'UP' : (tickerSnap.changePct || 0) < -0.15 ? 'DOWN' : 'FLAT',
                spyGap: spySnap?.changePct || 0,
                relativeStrength: (tickerSnap.changePct || 0) - (spySnap?.changePct || 0),
                preMarketVolume: 0,
                avgPreMarketVolume: 0,
                volumeRatio: 0,
                catalyst: null,
              });
            }
          }
        }
      } catch (err) {
        console.error('[WarRoom] RS fetch error:', err);
      }
    };
    
    fetchRS();
    // Poll faster during pre-market (every 30s) to catch moves
    const pollInterval = marketSession === 'open' ? 60000 : marketSession === 'pre-market' ? 30000 : 300000;
    const interval = setInterval(fetchRS, pollInterval);
    return () => clearInterval(interval);
  }, [ticker, marketSession]);

  // ============================================
  // MAIN DATA FETCH
  // ============================================
  const fetchAllData = useCallback(async () => {
    if (!ticker || fetchInProgress.current) return;
    
    fetchInProgress.current = true;
    setIsLoading(true);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Cache-bust during market hours to ensure fresh data
      const isLive = marketSession === 'open' || marketSession === 'pre-market';
      const cacheBust = isLive ? `&_t=${Date.now()}` : '';
      const cacheBustFirst = isLive ? `?_t=${Date.now()}` : '';

      const flowParams = new URLSearchParams({ tickers: ticker, limit: '200' });
      const dpParams = new URLSearchParams({ tickers: ticker, limit: '100' });
      
      if (timeframeParams) {
        flowParams.set('from', new Date(timeframeParams.timestampGte).toISOString());
        flowParams.set('to', new Date(timeframeParams.timestampLte).toISOString());
        dpParams.set('timestampGte', timeframeParams.timestampGte.toString());
        dpParams.set('timestampLte', timeframeParams.timestampLte.toString());
      }
      
      const fetchOpts = { signal: controller.signal, cache: isLive ? 'no-store' as RequestCache : 'default' as RequestCache };

      const [flowRes, dpRes, newsRes, levelsRes, priceRes] = await Promise.all([
        fetch(`/api/flow/options?${flowParams}${cacheBust}`, fetchOpts),
        fetch(`/api/darkpool?${dpParams}${cacheBust}`, fetchOpts),
        fetch(`/api/news?tickers=${ticker}&limit=10${cacheBust}`, fetchOpts),
        fetch(`/api/market/levels/${ticker}${cacheBustFirst}`, fetchOpts),
        fetch(`/api/market/prices?tickers=${ticker}${cacheBust}`, fetchOpts),
      ]);

      clearTimeout(timeout);

      const [flowJson, dpJson, newsJson, levelsJson, priceJson] = await Promise.all([
        flowRes.json(), dpRes.json(), newsRes.json(), levelsRes.json(), priceRes.json(),
      ]);

      const flowStats = flowJson.data?.stats as EnhancedFlowStats | null;
      const flowTrades = flowJson.data?.flow || [];
      const dpStats = dpJson.data?.stats;
      const dpPrints = dpJson.data?.prints || [];
      const dpMeta = dpJson.data?.meta;
      
      const newsItems = newsJson.data?.articles || newsJson.data?.news || newsJson.data || newsJson.articles || newsJson.results || [];
      const levelsData = levelsJson.data || {};
      
      const priceArr = priceJson.data || [];
      const tickerPrice = Array.isArray(priceArr) 
        ? priceArr.find((p: any) => p.ticker === ticker)
        : priceArr.prices?.find((p: any) => p.ticker === ticker) || priceArr;
      
      if (tickerPrice && (tickerPrice.price || tickerPrice.price === 0)) {
        setPriceData({
          price: tickerPrice.price || 0,
          change: tickerPrice.change || 0,
          changePercent: tickerPrice.changePercent || 0,
        });
      }

      const currentSession = getMarketSession();
      const verdict = computeVerdict(flowStats, dpStats, newsItems, currentSession);
      const computedLevels = computeKeyLevels(flowStats, levelsData);

      setData({
        flow: { stats: flowStats, trades: flowTrades, loading: false, error: flowJson.success ? null : flowJson.error },
        darkpool: { prints: dpPrints, stats: dpStats, loading: false, error: dpJson.success ? null : dpJson.error, meta: dpMeta },
        news: { items: newsItems, loading: false },
        levels: computedLevels,
        verdict,
      });
      
      setLastUpdate(new Date());
    } catch (err: any) {
      console.error('[WarRoom] Fetch error:', err);
      setData({
        flow: { stats: null, trades: [], loading: false, error: err.message },
        darkpool: { prints: [], stats: null, loading: false, error: err.message, meta: undefined },
        news: { items: [], loading: false },
        levels: { callWall: null, putWall: null, maxGamma: null, gexFlip: null, maxPain: null, vwap: null },
        verdict: { bias: 'NEUTRAL', confidence: 0, summary: 'Error loading data', signals: { flow: 'NEUTRAL', darkpool: 'NEUTRAL', newsAlignment: false } },
      });
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [ticker, timeframeParams, marketSession]);

  // Initial fetch + polling (slower when market closed)
  useEffect(() => {
    if (!ticker) return;
    fetchAllData();
    const pollInterval = marketSession === 'open' ? 30000 : marketSession === 'pre-market' ? 60000 : 120000;
    const interval = setInterval(fetchAllData, pollInterval);
    return () => clearInterval(interval);
  }, [fetchAllData, ticker, marketSession]);

  const quote = getQuote(ticker);

  return {
    price: quote?.price || priceData.price,
    change: quote?.change || priceData.change,
    changePercent: quote?.changePercent || priceData.changePercent,
    flow: data.flow || { stats: null, trades: [], loading: true, error: null },
    darkpool: data.darkpool || { prints: [], stats: null, loading: true, error: null, meta: undefined },
    news: data.news || { items: [], loading: true },
    levels: data.levels || { callWall: null, putWall: null, maxGamma: null, gexFlip: null, maxPain: null, vwap: null },
    verdict: data.verdict || { bias: 'NEUTRAL', confidence: 0, summary: '', signals: { flow: 'NEUTRAL', darkpool: 'NEUTRAL', newsAlignment: false } },
    marketSession,
    preMarketData,
    relativeStrength,
    refresh: fetchAllData,
    isLoading,
    lastUpdate,
  };
}

// ============================================
// SESSION-AWARE VERDICT
// ============================================
function computeVerdict(
  flow: EnhancedFlowStats | null, dpStats: any, news: any[], session: MarketSession
): WarRoomData['verdict'] {
  if (session === 'after-hours' || session === 'closed') {
    return {
      bias: 'NEUTRAL', confidence: 0,
      summary: session === 'after-hours' ? 'Market closed. Showing last session data.' : 'Market closed. Data from last trading session.',
      signals: { flow: 'NEUTRAL', darkpool: 'NEUTRAL', newsAlignment: news?.length > 0 },
    };
  }
  
  if (session === 'pre-market') {
    // During pre-market, we can still provide some signal from news
    // RS data is handled separately and will feed into the unified thesis
    return {
      bias: 'NEUTRAL', confidence: 0,
      summary: 'Pre-market session. Relative strength active — options flow and dark pool data start at open.',
      signals: { flow: 'NEUTRAL', darkpool: 'NEUTRAL', newsAlignment: news?.length > 0 },
    };
  }
  
  // MARKET OPEN: Full analysis
  let bullishPoints = 0, bearishPoints = 0;
  let reasons: string[] = [];
  let hasAnyMeaningfulData = false;
  
  if (flow && flow.tradeCount > 0) {
    const netFlow = flow.netDeltaAdjustedFlow || 0;
    const totalPremium = (flow.callPremium || 0) + (flow.putPremium || 0);
    const isSignificantFlow = totalPremium > 10000 || flow.tradeCount >= 5;
    
    if (isSignificantFlow) {
      hasAnyMeaningfulData = true;
      if (netFlow > 50000) { bullishPoints += 2; reasons.push('Bullish delta flow'); }
      else if (netFlow > 5000) { bullishPoints += 1; reasons.push('Slight bullish flow'); }
      else if (netFlow < -50000) { bearishPoints += 2; reasons.push('Bearish delta flow'); }
      else if (netFlow < -5000) { bearishPoints += 1; reasons.push('Slight bearish flow'); }
      
      if (flow.putRatio >= 70) { bearishPoints += 3; reasons.push(`Heavy put bias (${flow.putRatio.toFixed(0)}% puts)`); }
      else if (flow.putRatio >= 60) { bearishPoints += 2; reasons.push(`Put heavy (${flow.putRatio.toFixed(0)}% puts)`); }
      else if (flow.callRatio >= 70) { bullishPoints += 3; reasons.push(`Heavy call bias (${flow.callRatio.toFixed(0)}% calls)`); }
      else if (flow.callRatio >= 60) { bullishPoints += 2; reasons.push(`Call heavy (${flow.callRatio.toFixed(0)}% calls)`); }
      
      if (flow.sweepRatio > 0.01) {
        if (flow.callRatio > flow.putRatio) bullishPoints += 0.5; else bearishPoints += 0.5;
      }
      if (flow.unusualCount > 0) { bullishPoints += 0.5; reasons.push(`${flow.unusualCount} unusual`); }
    } else {
      reasons.push('Low flow volume');
    }
  }
  
  if (dpStats && dpStats.printCount > 0) {
    hasAnyMeaningfulData = true;
    if (dpStats.bullishPct > (dpStats.bearishPct || 0) + 5) { bullishPoints += 1; reasons.push('DP accumulation'); }
    else if ((dpStats.bearishPct || 0) > dpStats.bullishPct + 5) { bearishPoints += 1; reasons.push('DP distribution'); }
  }
  
  if (news?.length > 0) reasons.push(`${news.length} news items`);
  
  if (!hasAnyMeaningfulData) {
    return {
      bias: 'NEUTRAL', confidence: 0,
      summary: reasons.length > 0 ? `Insufficient data: ${reasons.join(', ')}` : 'Waiting for data...',
      signals: { flow: 'NEUTRAL', darkpool: 'NEUTRAL', newsAlignment: news?.length > 0 },
    };
  }
  
  const netPoints = bullishPoints - bearishPoints;
  const totalPoints = bullishPoints + bearishPoints;
  let confidence = totalPoints > 0 ? Math.round((Math.abs(netPoints) / Math.max(totalPoints, 1)) * 60) : 0;
  if (reasons.length >= 2) confidence += 10;
  if (reasons.length >= 3) confidence += 10;
  if (reasons.length >= 4) confidence += 10;
  if ((flow?.tradeCount && flow.tradeCount > 0) || (dpStats?.printCount && dpStats.printCount > 0)) confidence = Math.max(confidence, 25);
  confidence = Math.min(confidence, 90);
  
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (netPoints >= 1.5) bias = 'BULLISH';
  else if (netPoints <= -1.5) bias = 'BEARISH';
  
  let summary = 'Analyzing...';
  if (reasons.length > 0) {
    const putMsg = reasons.find(r => r.includes('put bias') || r.includes('Put heavy'));
    const callMsg = reasons.find(r => r.includes('call bias') || r.includes('Call heavy'));
    if (putMsg && flow && flow.putRatio >= 70) summary = `Heavy put pressure (${flow.putRatio.toFixed(0)}% puts), bearish flow`;
    else if (callMsg && flow && flow.callRatio >= 70) summary = `Heavy call pressure (${flow.callRatio.toFixed(0)}% calls), bullish flow`;
    else if (putMsg) summary = `Put heavy flow (${flow?.putRatio.toFixed(0) || 0}% puts)`;
    else if (callMsg) summary = `Call heavy flow (${flow?.callRatio.toFixed(0) || 0}% calls)`;
    else summary = reasons.slice(0, 2).join(' + ');
  }
  
  return {
    bias, confidence, summary,
    signals: {
      flow: (flow?.regime === 'RISK_ON' ? 'BULLISH' : flow?.regime === 'RISK_OFF' ? 'BEARISH' : 'NEUTRAL') as any,
      darkpool: dpStats?.regime || 'NEUTRAL',
      newsAlignment: news?.length > 0,
    },
  };
}

// ============================================
// COMPUTE KEY LEVELS
// ============================================
function computeKeyLevels(flow: EnhancedFlowStats | null, levelsData: any): WarRoomData['levels'] {
  if (levelsData && (levelsData.callWall || levelsData.putWall)) {
    return {
      callWall: levelsData.callWall || null, putWall: levelsData.putWall || null,
      maxGamma: levelsData.maxGamma || null, gexFlip: levelsData.gexFlip || null,
      maxPain: levelsData.maxPain || null, vwap: levelsData.vwap || levelsData.currentPrice || null,
    };
  }

  let callWall: number | null = null, putWall: number | null = null;
  let maxGamma: number | null = null, gexFlip: number | null = null;

  if (flow?.gexByStrike?.length) {
    callWall = [...flow.gexByStrike].sort((a, b) => (b.callPremium || 0) - (a.callPremium || 0))[0]?.strike || null;
    putWall = [...flow.gexByStrike].sort((a, b) => (b.putPremium || 0) - (a.putPremium || 0))[0]?.strike || null;
    maxGamma = [...flow.gexByStrike].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0))[0]?.strike || null;
    
    const sorted = [...flow.gexByStrike].sort((a, b) => a.strike - b.strike);
    for (let i = 0; i < sorted.length - 1; i++) {
      if ((sorted[i].netGex || 0) * (sorted[i+1].netGex || 0) < 0) { gexFlip = sorted[i].strike; break; }
    }
  }

  return { callWall, putWall, maxGamma, gexFlip, maxPain: levelsData?.maxPain || null, vwap: levelsData?.vwap || null };
}
