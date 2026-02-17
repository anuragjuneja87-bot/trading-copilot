'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from '@/lib/websocket';
import type { EnhancedFlowStats, EnhancedOptionTrade } from '@/types/flow';

interface WarRoomData {
  // Price (from WebSocket)
  price: number;
  change: number;
  changePercent: number;
  
  // Flow Stats (from REST)
  flow: {
    stats: EnhancedFlowStats | null;
    trades: EnhancedOptionTrade[];
    loading: boolean;
    error: string | null;
  };
  
  // Dark Pool (from REST)
  darkpool: {
    prints: any[];
    stats: any;
    loading: boolean;
    error: string | null;
    meta?: any;
  };
  
  // News (from REST)
  news: {
    items: any[];
    loading: boolean;
  };
  
  // Levels (computed)
  levels: {
    callWall: number | null;
    putWall: number | null;
    maxGamma: number | null;
    gexFlip: number | null; // NEW - critical level
    maxPain: number | null;
    vwap: number | null;
  };
  
  // Computed Verdicts
  verdict: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    confidence: number; // 0-100
    summary: string; // "Smart money buying calls aggressively"
    signals: {
      flow: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      darkpool: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
      newsAlignment: boolean;
    };
  };
  
  // Actions
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
  const [priceData, setPriceData] = useState({
    price: 0,
    change: 0,
    changePercent: 0,
  });

  // Subscribe to WebSocket for real-time price
  useEffect(() => {
    if (ticker) {
      subscribe([ticker]);
    }
  }, [ticker, subscribe]);

  // Fetch all REST data in parallel
  const fetchAllData = useCallback(async () => {
    if (!ticker || fetchInProgress.current) return;
    
    fetchInProgress.current = true;
    setIsLoading(true);

    try {
      // Parallel fetch with AbortController for timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      // Build API URLs with timeframe params
      const flowParams = new URLSearchParams({ tickers: ticker, limit: '200' });
      const dpParams = new URLSearchParams({ tickers: ticker, limit: '100', minSize: '100000' }); // 100K shares minimum
      
      if (timeframeParams) {
        // Use ISO strings for flow API
        flowParams.set('from', new Date(timeframeParams.timestampGte).toISOString());
        flowParams.set('to', new Date(timeframeParams.timestampLte).toISOString());
        // Use milliseconds for dark pool API (will be converted to nanoseconds)
        dpParams.set('timestampGte', timeframeParams.timestampGte.toString());
        dpParams.set('timestampLte', timeframeParams.timestampLte.toString());
      }
      
      const [flowRes, dpRes, newsRes, levelsRes, priceRes] = await Promise.all([
        fetch(`/api/flow/options?${flowParams}`, { signal: controller.signal }),
        fetch(`/api/darkpool?${dpParams}`, { signal: controller.signal }),
        fetch(`/api/news?tickers=${ticker}&limit=10`, { signal: controller.signal }),
        fetch(`/api/market/levels/${ticker}`, { signal: controller.signal }),
        fetch(`/api/market/prices?tickers=${ticker}`, { signal: controller.signal }),
      ]);

      clearTimeout(timeout);

      const [flowJson, dpJson, newsJson, levelsJson, priceJson] = await Promise.all([
        flowRes.json(),
        dpRes.json(),
        newsRes.json(),
        levelsRes.json(),
        priceRes.json(),
      ]);

      // Extract flow stats
      const flowStats = flowJson.data?.stats as EnhancedFlowStats | null;
      const flowTrades = flowJson.data?.flow || [];
      
      // Extract dark pool stats
      const dpStats = dpJson.data?.stats;
      const dpPrints = dpJson.data?.prints || [];
      const dpMeta = dpJson.data?.meta;
      
      // Extract news - handle multiple response formats
      const newsItems = 
        newsJson.data?.articles ||  // Benzinga format
        newsJson.data?.news ||      // Alternative format
        newsJson.data ||            // Direct array
        newsJson.articles ||        // Root level
        newsJson.results ||         // Polygon format
        [];
      
      // Extract levels
      const levelsData = levelsJson.data || {};
      
      // Extract price from REST (fallback when WebSocket not ready)
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

      // Compute verdict
      const verdict = computeVerdict(flowStats, dpStats, newsItems);

      // Compute key levels from flow data
      const computedLevels = computeKeyLevels(flowStats, levelsData);

      setData({
        flow: {
          stats: flowStats,
          trades: flowTrades,
          loading: false,
          error: flowJson.success ? null : flowJson.error,
        },
        darkpool: {
          prints: dpPrints,
          stats: dpStats,
          loading: false,
          error: dpJson.success ? null : dpJson.error,
          meta: dpMeta,
        },
        news: {
          items: newsItems,
          loading: false,
        },
        levels: computedLevels,
        verdict,
      });
      
      setLastUpdate(new Date());
      
      // Debug logging
      console.log('[WarRoom] Data fetched:', {
        ticker,
        flowStats: flowStats ? {
          netDeltaAdjustedFlow: flowStats.netDeltaAdjustedFlow,
          sweepRatio: flowStats.sweepRatio,
          tradeCount: flowStats.tradeCount,
          timeSeriesLength: flowStats.flowTimeSeries?.length,
        } : null,
        darkPoolPrints: dpPrints.length,
        darkPoolStats: dpStats,
        newsItems: newsItems.length,
        price: tickerPrice,
      });
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
  }, [ticker, timeframeParams]);

  // Initial fetch
  useEffect(() => {
    if (!ticker) return;
    
    fetchAllData();
    
    // Set up polling intervals
    const flowInterval = setInterval(fetchAllData, 30000); // 30s for flow
    
    return () => {
      clearInterval(flowInterval);
    };
  }, [fetchAllData, ticker]);

  // Get real-time price from WebSocket (with REST fallback)
  const quote = getQuote(ticker);

  return {
    // Use WebSocket price if available, otherwise REST
    price: quote?.price || priceData.price,
    change: quote?.change || priceData.change,
    changePercent: quote?.changePercent || priceData.changePercent,
    flow: data.flow || { stats: null, trades: [], loading: true, error: null },
    darkpool: data.darkpool || { prints: [], stats: null, loading: true, error: null, meta: undefined },
    news: data.news || { items: [], loading: true },
    levels: data.levels || { callWall: null, putWall: null, maxGamma: null, gexFlip: null, maxPain: null, vwap: null },
    verdict: data.verdict || { bias: 'NEUTRAL', confidence: 0, summary: '', signals: { flow: 'NEUTRAL', darkpool: 'NEUTRAL', newsAlignment: false } },
    refresh: fetchAllData,
    isLoading,
    lastUpdate,
  };
}

// Compute the overall verdict
function computeVerdict(
  flow: EnhancedFlowStats | null,
  dpStats: any,
  news: any[]
): WarRoomData['verdict'] {
  let bullishPoints = 0;
  let bearishPoints = 0;
  let reasons: string[] = [];
  
  // 1. Flow Analysis
  if (flow && flow.tradeCount > 0) {
    const netFlow = flow.netDeltaAdjustedFlow || 0;
    
    // Lower thresholds for delta flow
    if (netFlow > 50000) {
      bullishPoints += 2;
      reasons.push('Bullish delta flow');
    } else if (netFlow > 5000) {
      bullishPoints += 1;
      reasons.push('Slight bullish flow');
    } else if (netFlow < -50000) {
      bearishPoints += 2;
      reasons.push('Bearish delta flow');
    } else if (netFlow < -5000) {
      bearishPoints += 1;
      reasons.push('Slight bearish flow');
    }
    
    // Call/Put Ratio - stronger weighting for extreme ratios
    if (flow.putRatio >= 70) {
      // 70%+ puts = BEARISH
      bearishPoints += 3;
      reasons.push(`Heavy put bias (${flow.putRatio.toFixed(0)}% puts)`);
    } else if (flow.putRatio >= 60) {
      // 60-70% puts = lean BEARISH
      bearishPoints += 2;
      reasons.push(`Put heavy (${flow.putRatio.toFixed(0)}% puts)`);
    } else if (flow.callRatio >= 70) {
      // 70%+ calls = BULLISH
      bullishPoints += 3;
      reasons.push(`Heavy call bias (${flow.callRatio.toFixed(0)}% calls)`);
    } else if (flow.callRatio >= 60) {
      // 60-70% calls = lean BULLISH
      bullishPoints += 2;
      reasons.push(`Call heavy (${flow.callRatio.toFixed(0)}% calls)`);
    }
    
    // Sweeps
    if (flow.sweepRatio > 0.01) { // Even 1% sweeps is notable
      if (flow.callRatio > flow.putRatio) {
        bullishPoints += 0.5;
      } else {
        bearishPoints += 0.5;
      }
    }
    
    // Any unusual trades
    if (flow.unusualCount > 0) {
      bullishPoints += 0.5;
      reasons.push(`${flow.unusualCount} unusual`);
    }
  }
  
  // 2. Dark Pool
  if (dpStats && dpStats.printCount > 0) {
    const bullPct = dpStats.bullishPct || 0;
    const bearPct = dpStats.bearishPct || 0;
    
    // Even small skew counts
    if (bullPct > bearPct + 5) {
      bullishPoints += 1;
      reasons.push('DP accumulation');
    } else if (bearPct > bullPct + 5) {
      bearishPoints += 1;
      reasons.push('DP distribution');
    }
    
    // Volume is a signal itself
    if (dpStats.totalValue > 1000000) {
      reasons.push('Heavy DP volume');
    }
  }
  
  // 3. News (less weight)
  if (news && news.length > 0) {
    // Just having news is useful context
    reasons.push(`${news.length} news items`);
  }
  
  // Calculate confidence
  const totalPoints = bullishPoints + bearishPoints;
  const netPoints = bullishPoints - bearishPoints;
  
  // Base confidence on total signals found
  let confidence = 0;
  if (totalPoints > 0) {
    // More signals = higher confidence
    const signalStrength = Math.abs(netPoints) / Math.max(totalPoints, 1);
    confidence = Math.round(signalStrength * 60); // Max 60% from signal strength
    
    // Bonus for multiple confirming signals
    if (reasons.length >= 2) confidence += 10;
    if (reasons.length >= 3) confidence += 10;
    if (reasons.length >= 4) confidence += 10;
  }
  
  // Minimum confidence if we have any data
  if ((flow?.tradeCount && flow.tradeCount > 0) || (dpStats?.printCount && dpStats.printCount > 0)) {
    confidence = Math.max(confidence, 25);
  }
  
  // Cap at 90%
  confidence = Math.min(confidence, 90);
  
  // Determine bias
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (netPoints >= 1.5) {
    bias = 'BULLISH';
  } else if (netPoints <= -1.5) {
    bias = 'BEARISH';
  }
  
  // Generate summary that reflects dominant signal
  let summary = 'Analyzing...';
  if (reasons.length > 0) {
    // Prioritize put/call ratio messages when extreme
    const putHeavyMsg = reasons.find(r => r.includes('put bias') || r.includes('Put heavy'));
    const callHeavyMsg = reasons.find(r => r.includes('call bias') || r.includes('Call heavy'));
    
    if (putHeavyMsg && flow && flow.putRatio >= 70) {
      summary = `Heavy put pressure (${flow.putRatio.toFixed(0)}% puts), bearish flow`;
    } else if (callHeavyMsg && flow && flow.callRatio >= 70) {
      summary = `Heavy call pressure (${flow.callRatio.toFixed(0)}% calls), bullish flow`;
    } else if (putHeavyMsg) {
      summary = `Put heavy flow (${flow?.putRatio.toFixed(0) || 0}% puts)`;
    } else if (callHeavyMsg) {
      summary = `Call heavy flow (${flow?.callRatio.toFixed(0) || 0}% calls)`;
    } else {
      // Use first 2 reasons
      summary = reasons.slice(0, 2).join(' + ');
    }
  }
  
  return {
    bias,
    confidence,
    summary,
    signals: {
      flow: (flow?.regime === 'RISK_ON' ? 'BULLISH' : 
             flow?.regime === 'RISK_OFF' ? 'BEARISH' : 'NEUTRAL') as any,
      darkpool: dpStats?.regime || 'NEUTRAL',
      newsAlignment: news?.length > 0,
    },
  };
}

// Compute key levels from flow data
// Compute key levels - USE API DATA FIRST, fallback to flow computation
function computeKeyLevels(
  flow: EnhancedFlowStats | null,
  levelsData: any
): WarRoomData['levels'] {
  // PRIORITY 1: Use API levels data (from /api/market/levels/${ticker})
  // This is calculated from full options chain OI, not just today's flow
  if (levelsData && (levelsData.callWall || levelsData.putWall)) {
    return {
      callWall: levelsData.callWall || null,
      putWall: levelsData.putWall || null,
      maxGamma: levelsData.maxGamma || null,
      gexFlip: levelsData.gexFlip || null,
      maxPain: levelsData.maxPain || null,
      vwap: levelsData.vwap || levelsData.currentPrice || null,
    };
  }

  // PRIORITY 2: Fallback - compute from flow data if API levels unavailable
  let callWall: number | null = null;
  let putWall: number | null = null;
  let maxGamma: number | null = null;
  let gexFlip: number | null = null;

  if (flow?.gexByStrike && flow.gexByStrike.length > 0) {
    // Call wall = strike with highest call premium
    const sortedByCallPremium = [...flow.gexByStrike].sort((a, b) => (b.callPremium || 0) - (a.callPremium || 0));
    callWall = sortedByCallPremium[0]?.strike || null;
    
    // Put wall = strike with highest put premium
    const sortedByPutPremium = [...flow.gexByStrike].sort((a, b) => (b.putPremium || 0) - (a.putPremium || 0));
    putWall = sortedByPutPremium[0]?.strike || null;
    
    // Max gamma = strike with highest absolute netGex
    const sortedByNetGex = [...flow.gexByStrike].sort((a, b) => Math.abs(b.netGex || 0) - Math.abs(a.netGex || 0));
    maxGamma = sortedByNetGex[0]?.strike || null;
    
    // GEX flip = strike where netGex crosses zero
    const sortedByStrike = [...flow.gexByStrike].sort((a, b) => a.strike - b.strike);
    for (let i = 0; i < sortedByStrike.length - 1; i++) {
      const currentNetGex = sortedByStrike[i].netGex || 0;
      const nextNetGex = sortedByStrike[i + 1].netGex || 0;
      
      if ((currentNetGex > 0 && nextNetGex < 0) || (currentNetGex < 0 && nextNetGex > 0)) {
        gexFlip = sortedByStrike[i].strike;
        break;
      }
    }
  }

  return {
    callWall,
    putWall,
    maxGamma,
    gexFlip,
    maxPain: levelsData?.maxPain || null,
    vwap: levelsData?.vwap || null,
  };
}
