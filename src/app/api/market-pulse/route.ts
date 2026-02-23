import { NextRequest, NextResponse } from 'next/server';
import { validateTicker, validateTickers, validateInt } from '@/lib/security';
import {
  TickerSnapshot,
  VixData,
  Mover,
  NewsItem,
  FearGreedIndex,
} from '@/types/market-pulse';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Core market tickers to always fetch
const MARKET_TICKERS = ['SPY', 'QQQ', 'VIX', 'IWM', 'DIA'];

// Popular tickers for movers - will fetch in ONE batch call
const MOVERS_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC',
  'JPM', 'BAC', 'GS', 'BA', 'CAT', 'DIS', 'NFLX', 'CRM', 'ORCL', 'PYPL',
  'SPY', 'QQQ', 'IWM', 'DIA' // Include indices
];

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  const { searchParams } = new URL(request.url);
  const bypassCache = searchParams.get('t') !== null; // If timestamp param exists, bypass cache

  try {
    console.log('=== MARKET PULSE API START ===', bypassCache ? '(bypassing cache)' : '');

    // OPTIMIZATION: Fetch ALL tickers in ONE batch call instead of 19+ individual calls
    const [batchData, newsData] = await Promise.all([
      fetchBatchSnapshots(bypassCache),
      fetchTopNews(bypassCache),
    ]);

    // Extract market data from batch
    const marketData = await extractMarketData(batchData);
    
    // Extract movers from batch
    const moversData = extractMovers(batchData);

    // Calculate derived metrics
    const fearGreedIndex = calculateFearGreedIndex(marketData);
    const marketSentiment = determineMarketSentiment(marketData, fearGreedIndex);

    const processingTime = Date.now() - startTime;
    console.log(`=== MARKET PULSE END (${processingTime}ms) ===`);

    return NextResponse.json(
      {
        success: true,
        data: {
          // Core market data
          vix: marketData.vix,
          spy: marketData.spy,
          qqq: marketData.qqq,

          // Derived metrics
          fearGreedIndex,
          marketSentiment,
          // Add regime based on VIX value
          regime: marketData.vix ? (
            marketData.vix.value > 30 ? 'CRISIS' : 
            marketData.vix.value > 20 ? 'ELEVATED' : 
            'NORMAL'
          ) : 'NORMAL',

          // Movers
          topGainers: moversData.gainers,
          topLosers: moversData.losers,

          // News
          topNews: newsData,

          // Meta
          timestamp: new Date().toISOString(),
          processingTime,
        },
      },
      {
        headers: {
          // Reduce cache time to ensure fresh data, especially at market open
          // If bypassing cache, set no-cache
          'Cache-Control': bypassCache
            ? 'no-cache, no-store, must-revalidate'
            : 'public, s-maxage=15, stale-while-revalidate=30',
        },
      }
    );
  } catch (error) {
    console.error('Market pulse error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch market pulse',
      },
      { status: 500 }
    );
  }
}

// OPTIMIZED: Single batch call for ALL tickers
async function fetchBatchSnapshots(bypassCache = false): Promise<Map<string, any>> {
  const tickerMap = new Map<string, any>();
  
  try {
    // Polygon batch snapshot endpoint - ONE call for all tickers
    const tickersParam = MOVERS_UNIVERSE.join(',');
    const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickersParam}&apiKey=${POLYGON_API_KEY}`;
    
    const response = await fetch(url, {
      next: bypassCache ? { revalidate: 0 } : { revalidate: 10 },
      cache: bypassCache ? 'no-store' : 'default',
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data = await response.json();
      const tickers = data.tickers || [];
      
      for (const tickerData of tickers) {
        const ticker = tickerData.ticker;
        if (ticker) {
          tickerMap.set(ticker, tickerData);
        }
      }
      
      console.log(`[Market Pulse] Batch fetched ${tickerMap.size} tickers in ONE call`);
    }
  } catch (error) {
    console.error('[Market Pulse] Batch fetch error:', error);
  }

  // Fetch VIX separately (it's an index, not in stock snapshot)
  try {
    const vixUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/VIX?apiKey=${POLYGON_API_KEY}`;
    const vixResponse = await fetch(vixUrl, {
      next: bypassCache ? { revalidate: 0 } : { revalidate: 10 },
      cache: bypassCache ? 'no-store' : 'default',
    });
    
    if (vixResponse.ok) {
      const vixData = await vixResponse.json();
      if (vixData.ticker) {
        tickerMap.set('VIX', vixData.ticker);
      }
    }
  } catch (error) {
    console.error('[Market Pulse] VIX fetch error:', error);
  }

  return tickerMap;
}

// Extract SPY, QQQ, VIX from batch data
async function extractMarketData(batchData: Map<string, any>): Promise<MarketData> {
  const results: MarketData = {
    spy: null,
    qqq: null,
    vix: null,
  };

  // Extract SPY
  const spyData = batchData.get('SPY');
  if (spyData) {
    results.spy = parseTickerSnapshot('SPY', spyData);
  }

  // Extract QQQ
  const qqqData = batchData.get('QQQ');
  if (qqqData) {
    results.qqq = parseTickerSnapshot('QQQ', qqqData);
  }

  // Extract VIX
  const vixData = batchData.get('VIX');
  if (vixData) {
    let price = parseFloat(vixData.lastTrade?.p) || parseFloat(vixData.day?.c) || parseFloat(vixData.prevDay?.c) || 0;
    const prevClose = parseFloat(vixData.prevDay?.c) || 0;
    let change = parseFloat(vixData.todaysChange) || 0;
    let changePercent = parseFloat(vixData.todaysChangePerc) || 0;
    
    // CRITICAL FIX: If price is 0 but we have prevClose and change, calculate it
    if (price === 0 && prevClose > 0 && change !== 0) {
      price = prevClose + change;
    }
    
    // If still 0, try calculating from prevClose and changePercent
    if (price === 0 && prevClose > 0 && changePercent !== 0) {
      price = prevClose * (1 + changePercent / 100);
    }
    
    // If still 0, calculate change from prevClose
    if (price > 0 && prevClose > 0 && change === 0) {
      change = price - prevClose;
      changePercent = (change / prevClose) * 100;
    }
    
    // Last resort: use prevClose as current price (market closed)
    if (price === 0 && prevClose > 0) {
      price = prevClose;
    }

    results.vix = {
      value: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
      level: getVixLevel(price),
    };
  } else {
    // Fallback: try fetching VIX directly as an index
    try {
      const yesterday = getYesterdayDate();
      const vixUrl = `${POLYGON_BASE_URL}/v1/open-close/I:VIX/${yesterday}?apiKey=${POLYGON_API_KEY}`;
      const vixRes = await fetch(vixUrl, {
        next: { revalidate: 300 },
      });
      
      if (vixRes.ok) {
        const vixData = await vixRes.json();
        const price = vixData.close || vixData.afterHours || 20;
        const change = (vixData.close || 0) - (vixData.open || 0);
        const changePercent = vixData.open > 0 ? (change / vixData.open) * 100 : 0;
        
        results.vix = {
          value: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          level: getVixLevel(price),
        };
      } else {
        // Default fallback if fetch fails
        results.vix = {
          value: 20,
          change: 0,
          changePercent: 0,
          level: 'NORMAL',
        };
      }
    } catch (err) {
      console.error('[Market Pulse] VIX fallback fetch error:', err);
      // Default fallback
      results.vix = {
        value: 20,
        change: 0,
        changePercent: 0,
        level: 'NORMAL',
      };
    }
  }

  return results;
}

// Parse ticker data into TickerSnapshot
function parseTickerSnapshot(ticker: string, tickerData: any): TickerSnapshot | null {
  if (!tickerData) return null;

  const price = tickerData.lastTrade?.p || tickerData.day?.c || tickerData.prevDay?.c;
  if (!price) return null;

  const prevClose = tickerData.prevDay?.c || price;
  const change = tickerData.todaysChange || price - prevClose;
  const changePercent = tickerData.todaysChangePerc || (prevClose > 0 ? (change / prevClose) * 100 : 0);

  const high = tickerData.day?.h || tickerData.prevDay?.h || price;
  const low = tickerData.day?.l || tickerData.prevDay?.l || price;
  const close = tickerData.prevDay?.c || price;

  const pivot = (high + low + close) / 3;
  const r1 = 2 * pivot - low;
  const s1 = 2 * pivot - high;

  const lastTradeTimestamp = tickerData.lastTrade?.t;
  let lastTradeTime: Date | null = null;
  if (lastTradeTimestamp) {
    const timestampMs = lastTradeTimestamp / 1_000_000;
    lastTradeTime = new Date(timestampMs);
  }

  return {
    ticker,
    price: Math.round(price * 100) / 100,
    change: Math.round(change * 100) / 100,
    changePercent: Math.round(changePercent * 100) / 100,
    high: Math.round(high * 100) / 100,
    low: Math.round(low * 100) / 100,
    volume: tickerData.day?.v || 0,
    lastTradeTime,
    levels: {
      r1: Math.round(r1 * 100) / 100,
      s1: Math.round(s1 * 100) / 100,
      pivot: Math.round(pivot * 100) / 100,
    },
  };
}

// Fetch ticker snapshot
async function fetchTickerSnapshot(ticker: string, bypassCache = false): Promise<TickerSnapshot | null> {
  try {
    const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;
    
    // Check if market is open to adjust cache strategy
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const dayOfWeek = etTime.getDay();
    const timeInMinutes = hour * 60 + minute;
    const isMarketOpen = dayOfWeek >= 1 && dayOfWeek <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;
    
    const revalidateTime = isMarketOpen ? 5 : 30; // 5s when open, 30s when closed
    
    const response = await fetch(url, {
      next: bypassCache ? { revalidate: 0 } : { revalidate: revalidateTime },
      cache: bypassCache ? 'no-store' : 'default',
    });

    if (response.ok) {
      const data = await response.json();
      const tickerData = data.ticker;

      if (tickerData) {
        const price = tickerData.lastTrade?.p || tickerData.day?.c || tickerData.prevDay?.c;
        const prevClose = tickerData.prevDay?.c || price;
        const change = tickerData.todaysChange || price - prevClose;
        const changePercent =
          tickerData.todaysChangePerc || (change / prevClose) * 100;

        // Extract last trade timestamp (Polygon returns nanoseconds)
        const lastTradeTimestamp = tickerData.lastTrade?.t;
        let lastTradeTime: Date | null = null;
        if (lastTradeTimestamp) {
          // Convert nanoseconds to milliseconds
          const timestampMs = lastTradeTimestamp / 1_000_000;
          lastTradeTime = new Date(timestampMs);
        }

        // Calculate levels
        const high = tickerData.day?.h || tickerData.prevDay?.h || price;
        const low = tickerData.day?.l || tickerData.prevDay?.l || price;
        const close = tickerData.prevDay?.c || price;

        const pivot = (high + low + close) / 3;
        const r1 = 2 * pivot - low;
        const s1 = 2 * pivot - high;

        return {
          ticker,
          price: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          high: Math.round(high * 100) / 100,
          low: Math.round(low * 100) / 100,
          volume: tickerData.day?.v || 0,
          lastTradeTime, // Add timestamp
          levels: {
            r1: Math.round(r1 * 100) / 100,
            s1: Math.round(s1 * 100) / 100,
            pivot: Math.round(pivot * 100) / 100,
          },
        };
      }
    }
  } catch (error) {
    console.error(`Error fetching ${ticker}:`, error);
  }
  return null;
}

// Fetch VIX data
async function fetchVixData(bypassCache = false): Promise<VixData | null> {
  try {
    // Try snapshot first
    const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/VIX?apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(url, {
      next: bypassCache ? { revalidate: 0 } : { revalidate: 5 },
      cache: bypassCache ? 'no-store' : 'default',
    });

    if (response.ok) {
      const data = await response.json();
      const tickerData = data.ticker;

      if (tickerData) {
        const price = tickerData.lastTrade?.p || tickerData.day?.c || tickerData.prevDay?.c;
        const prevClose = tickerData.prevDay?.c || price;
        const change = price - prevClose;
        const changePercent = (change / prevClose) * 100;

        return {
          value: Math.round(price * 100) / 100,
          change: Math.round(change * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          level: getVixLevel(price),
        };
      }
    }

    // Fallback: try previous day data
    const prevUrl = `${POLYGON_BASE_URL}/v2/aggs/ticker/VIX/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const prevResponse = await fetch(prevUrl, {
      next: bypassCache ? { revalidate: 0 } : { revalidate: 5 },
      cache: bypassCache ? 'no-store' : 'default',
    });

    if (prevResponse.ok) {
      const prevData = await prevResponse.json();
      const result = prevData.results?.[0];

      if (result) {
        return {
          value: Math.round(result.c * 100) / 100,
          change: Math.round((result.c - result.o) * 100) / 100,
          changePercent: Math.round(((result.c - result.o) / result.o) * 100 * 100) / 100,
          level: getVixLevel(result.c),
        };
      }
    }
  } catch (error) {
    console.error('Error fetching VIX:', error);
  }
  return null;
}

// Get yesterday's date (skip weekends)
function getYesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  // Skip weekends
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

// Determine VIX level
function getVixLevel(vix: number): 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH' | 'EXTREME' {
  if (vix < 12) return 'LOW';
  if (vix < 20) return 'NORMAL';
  if (vix < 25) return 'ELEVATED';
  if (vix < 35) return 'HIGH';
  return 'EXTREME';
}

// Extract movers from batch data
function extractMovers(batchData: Map<string, any>): { gainers: Mover[]; losers: Mover[] } {
  const movers: Mover[] = [];

  // Exclude indices from movers list
  const excludeFromMovers = ['SPY', 'QQQ', 'IWM', 'DIA', 'VIX'];

  for (const [ticker, tickerData] of batchData.entries()) {
    if (excludeFromMovers.includes(ticker)) continue;

    const price = tickerData.lastTrade?.p || tickerData.day?.c || tickerData.prevDay?.c;
    if (!price) continue;

    const change = tickerData.todaysChange || 0;
    const changePercent = tickerData.todaysChangePerc || 0;

    movers.push({
      ticker,
      price: Math.round(price * 100) / 100,
      change: Math.round(change * 100) / 100,
      changePercent: Math.round(changePercent * 100) / 100,
    });
  }

  // Sort by change percent
  const sorted = movers.sort((a, b) => b.changePercent - a.changePercent);

  return {
    gainers: sorted.filter((m) => m.changePercent > 0).slice(0, 5),
    losers: sorted.filter((m) => m.changePercent < 0).slice(-5).reverse(),
  };
}

// Fetch top news headlines
async function fetchTopNews(bypassCache = false): Promise<NewsItem[]> {
  try {
    const url = `${POLYGON_BASE_URL}/v2/reference/news?limit=5&order=desc&sort=published_utc&apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(url, {
      next: bypassCache ? { revalidate: 0 } : { revalidate: 60 },
      cache: bypassCache ? 'no-store' : 'default',
    });

    if (response.ok) {
      const data = await response.json();
      const articles = data.results || [];

      return articles.slice(0, 5).map((article: any) => {
        // Quick sentiment from title
        const sentiment = quickSentiment(article.title);

        return {
          id: article.id || `news-${Date.now()}-${Math.random()}`,
          title: article.title || 'No headline',
          tickers: article.tickers?.slice(0, 3) || [],
          publishedUtc: article.published_utc || new Date().toISOString(),
          sentiment,
          url: article.article_url || '#',
        };
      });
    }
  } catch (error) {
    console.error('Error fetching news:', error);
  }
  return [];
}

// Quick sentiment analysis for news titles
function quickSentiment(title: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' {
  const titleLower = title.toLowerCase();

  const bullishWords = [
    'surge',
    'soar',
    'jump',
    'rally',
    'gain',
    'beat',
    'rise',
    'high',
    'boom',
    'growth',
  ];
  const bearishWords = [
    'crash',
    'plunge',
    'fall',
    'drop',
    'sink',
    'miss',
    'low',
    'fear',
    'concern',
    'warning',
  ];

  const bullishCount = bullishWords.filter((w) => titleLower.includes(w)).length;
  const bearishCount = bearishWords.filter((w) => titleLower.includes(w)).length;

  if (bullishCount > bearishCount) return 'BULLISH';
  if (bearishCount > bullishCount) return 'BEARISH';
  return 'NEUTRAL';
}

// Calculate Fear & Greed Index (0-100)
function calculateFearGreedIndex(marketData: MarketData): FearGreedIndex {
  let score = 50; // Start neutral

  // VIX component (lower VIX = more greed)
  if (marketData.vix) {
    const vix = marketData.vix.value;
    if (vix < 12) score += 25;
    else if (vix < 15) score += 15;
    else if (vix < 20) score += 5;
    else if (vix < 25) score -= 5;
    else if (vix < 30) score -= 15;
    else score -= 25;
  }

  // Market momentum component
  if (marketData.spy) {
    const spyChange = marketData.spy.changePercent;
    if (spyChange > 1.5) score += 15;
    else if (spyChange > 0.5) score += 8;
    else if (spyChange > 0) score += 3;
    else if (spyChange > -0.5) score -= 3;
    else if (spyChange > -1.5) score -= 8;
    else score -= 15;
  }

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  let label: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
  if (score <= 20) label = 'EXTREME_FEAR';
  else if (score <= 40) label = 'FEAR';
  else if (score <= 60) label = 'NEUTRAL';
  else if (score <= 80) label = 'GREED';
  else label = 'EXTREME_GREED';

  return { score, label };
}

// Determine overall market sentiment
function determineMarketSentiment(
  marketData: MarketData,
  fearGreed: FearGreedIndex
): 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' {
  let bullishSignals = 0;
  let bearishSignals = 0;

  // VIX
  if (marketData.vix) {
    if (marketData.vix.value < 18) bullishSignals++;
    else if (marketData.vix.value > 25) bearishSignals++;
  }

  // SPY momentum
  if (marketData.spy) {
    if (marketData.spy.changePercent > 0.3) bullishSignals++;
    else if (marketData.spy.changePercent < -0.3) bearishSignals++;
  }

  // QQQ momentum
  if (marketData.qqq) {
    if (marketData.qqq.changePercent > 0.3) bullishSignals++;
    else if (marketData.qqq.changePercent < -0.3) bearishSignals++;
  }

  // Fear & Greed
  if (fearGreed.score > 60) bullishSignals++;
  else if (fearGreed.score < 40) bearishSignals++;

  if (bullishSignals >= 3) return 'RISK_ON';
  if (bearishSignals >= 3) return 'RISK_OFF';
  return 'NEUTRAL';
}

// Type definitions
interface MarketData {
  spy: TickerSnapshot | null;
  qqq: TickerSnapshot | null;
  vix: VixData | null;
}
