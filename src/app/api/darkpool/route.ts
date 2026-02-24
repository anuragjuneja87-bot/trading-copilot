import { NextRequest, NextResponse } from 'next/server';
import type { DarkPoolPrint, DarkPoolStats, PriceLevel } from '@/types/darkpool';
import { validateTicker, validateInt, safeError } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Reliable ET time formatter for UTC-based servers
function formatTimeET(timestampMs: number): string {
  const d = new Date(timestampMs);
  const year = d.getUTCFullYear();
  const marchStart = new Date(Date.UTC(year, 2, 1));
  const marchSecondSun = new Date(Date.UTC(year, 2, 8 + (7 - marchStart.getUTCDay()) % 7, 7));
  const novStart = new Date(Date.UTC(year, 10, 1));
  const novFirstSun = new Date(Date.UTC(year, 10, 1 + (7 - novStart.getUTCDay()) % 7, 6));
  const isEDT = d.getTime() >= marchSecondSun.getTime() && d.getTime() < novFirstSun.getTime();
  const etMs = timestampMs + (isEDT ? -4 : -5) * 3600000;
  const et = new Date(etMs);
  return `${et.getUTCHours().toString().padStart(2, '0')}:${et.getUTCMinutes().toString().padStart(2, '0')}`;
}
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Dark pool / off-exchange codes (TRF = Trade Reporting Facility)
// These are trades NOT executed on lit exchanges — i.e. dark pools, internalizers
const DARK_POOL_EXCHANGES = new Set([4, 19, 20]);

// Adaptive thresholds based on timeframe window
function getThresholds(timeRangeMs: number) {
  const minutes = timeRangeMs / (60 * 1000);
  
  // For short timeframes (1-15 min), very low thresholds to catch institutional prints
  // For longer timeframes, raise thresholds to filter noise
  if (minutes <= 5) {
    return { minSize: 500, minValue: 50000 };       // 500 shares / $50K
  } else if (minutes <= 15) {
    return { minSize: 1000, minValue: 100000 };      // 1K shares / $100K
  } else if (minutes <= 60) {
    return { minSize: 2000, minValue: 200000 };      // 2K shares / $200K
  } else if (minutes <= 240) {
    return { minSize: 3000, minValue: 300000 };      // 3K shares / $300K
  } else {
    return { minSize: 5000, minValue: 500000 };      // 5K shares / $500K (full day+)
  }
}

function getExchangeName(exchangeCode: number): string {
  const exchanges: Record<number, string> = {
    1: 'NYSE', 2: 'AMEX', 3: 'ARCA', 4: 'ADF', 10: 'BX', 11: 'NSX', 12: 'FINRA',
    13: 'ISE', 14: 'EDGA', 15: 'EDGX', 16: 'BATS', 17: 'BATY', 18: 'IEX',
    19: 'TRF', 20: 'FINRA_ADF', 21: 'MEMX',
  };
  return exchanges[exchangeCode] || `EX${exchangeCode}`;
}

function calculateSignificance(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value >= 50000000) return 5;
  if (value >= 10000000) return 4;
  if (value >= 5000000) return 3;
  if (value >= 1000000) return 2;
  return 1;
}

function determineSideWithVWAP(
  price: number,
  bid: number,
  ask: number,
  vwap: number
): { side: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number } {
  // First try bid/ask
  if (bid > 0 && ask > 0 && bid < ask) {
    const spread = ask - bid;
    const midPoint = (bid + ask) / 2;
    
    if (price >= ask) return { side: 'BULLISH', confidence: 80 };
    if (price <= bid) return { side: 'BEARISH', confidence: 80 };
    if (price > midPoint + spread * 0.1) return { side: 'BULLISH', confidence: 60 };
    if (price < midPoint - spread * 0.1) return { side: 'BEARISH', confidence: 60 };
  }
  
  // Fallback: Use VWAP
  if (vwap > 0) {
    const pctFromVwap = (price - vwap) / vwap;
    
    if (pctFromVwap > 0.001) {
      return { side: 'BULLISH', confidence: 50 };
    }
    if (pctFromVwap < -0.001) {
      return { side: 'BEARISH', confidence: 50 };
    }
  }
  
  return { side: 'NEUTRAL', confidence: 0 };
}

function calculateDarkPoolStats(prints: DarkPoolPrint[]): DarkPoolStats {
  if (!prints.length) {
    return getEmptyStats();
  }

  const totalValue = prints.reduce((sum, p) => sum + p.value, 0);
  const totalShares = prints.reduce((sum, p) => sum + p.size, 0);

  const bullishPrints = prints.filter(p => p.side === 'BULLISH');
  const bearishPrints = prints.filter(p => p.side === 'BEARISH');
  const neutralPrints = prints.filter(p => p.side === 'NEUTRAL');

  const bullishValue = bullishPrints.reduce((sum, p) => sum + p.value, 0);
  const bearishValue = bearishPrints.reduce((sum, p) => sum + p.value, 0);
  const bullishPct = totalValue > 0 ? Math.round((bullishValue / totalValue) * 100) : 0;
  const bearishPct = totalValue > 0 ? Math.round((bearishValue / totalValue) * 100) : 0;

  const largestPrint = prints.reduce((max, p) => p.value > max.value ? p : max, prints[0]);

  // Price level distribution
  const priceLevels: PriceLevel[] = [];
  const priceMap = new Map<number, {
    ticker: string;
    totalValue: number;
    totalShares: number;
    printCount: number;
    bullishValue: number;
    bearishValue: number;
  }>();

  prints.forEach(p => {
    const roundedPrice = Math.round(p.price * 4) / 4;
    const existing = priceMap.get(roundedPrice) || {
      ticker: p.ticker,
      totalValue: 0,
      totalShares: 0,
      printCount: 0,
      bullishValue: 0,
      bearishValue: 0,
    };
    
    existing.totalValue += p.value;
    existing.totalShares += p.size;
    existing.printCount += 1;
    
    if (p.side === 'BULLISH') {
      existing.bullishValue += p.value;
    } else if (p.side === 'BEARISH') {
      existing.bearishValue += p.value;
    }
    
    priceMap.set(roundedPrice, existing);
  });

  priceMap.forEach((values, price) => {
    priceLevels.push({
      ticker: values.ticker,
      price,
      totalValue: values.totalValue,
      totalShares: values.totalShares,
      printCount: values.printCount,
      bullishValue: values.bullishValue,
      bearishValue: values.bearishValue,
      avgSize: values.printCount > 0 ? values.totalShares / values.printCount : 0,
    });
  });

  priceLevels.sort((a, b) => b.price - a.price);

  // Time series
  const timeBuckets = new Map<number, {
    time: string;
    timeMs: number;
    bullishValue: number;
    bearishValue: number;
    neutralValue: number;
    totalValue: number;
    printCount: number;
  }>();

  // Dynamic bucket size based on data time range
  const printTimes = prints.map(p => p.timestampMs);
  const timeRangeMs = printTimes.length > 1 
    ? Math.max(...printTimes) - Math.min(...printTimes)
    : 60 * 60 * 1000; // default 1 hour if single print
  const rangeMinutes = timeRangeMs / (60 * 1000);
  const dpBucketMinutes = rangeMinutes <= 1 ? 1
    : rangeMinutes <= 5 ? 1
    : rangeMinutes <= 15 ? 1
    : rangeMinutes <= 30 ? 5
    : rangeMinutes <= 60 ? 5
    : rangeMinutes <= 240 ? 15
    : 15;
  const bucketSize = dpBucketMinutes * 60 * 1000;
  prints.forEach(p => {
    const bucket = Math.floor(p.timestampMs / bucketSize) * bucketSize;
    const existing = timeBuckets.get(bucket) || {
      time: formatTimeET(bucket),
      timeMs: bucket,
      bullishValue: 0,
      bearishValue: 0,
      neutralValue: 0,
      totalValue: 0,
      printCount: 0,
    };
    
    existing.totalValue += p.value;
    existing.printCount += 1;
    if (p.side === 'BULLISH') existing.bullishValue += p.value;
    else if (p.side === 'BEARISH') existing.bearishValue += p.value;
    else existing.neutralValue += p.value;
    
    timeBuckets.set(bucket, existing);
  });

  const timeSeries = Array.from(timeBuckets.values()).sort((a, b) => a.timeMs - b.timeMs);

  // Determine regime
  let regime: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL' = 'NEUTRAL';
  if (bullishPct > 55 && largestPrint?.side === 'BULLISH') {
    regime = 'ACCUMULATION';
  } else if (bearishPct > 55 && largestPrint?.side === 'BEARISH') {
    regime = 'DISTRIBUTION';
  }

  return {
    totalValue,
    totalShares,
    printCount: prints.length,
    bullishCount: bullishPrints.length,
    bearishCount: bearishPrints.length,
    neutralCount: neutralPrints.length,
    bullishValue,
    bearishValue,
    bullishPct,
    bearishPct,
    largestPrint: largestPrint ? {
      ticker: largestPrint.ticker,
      value: largestPrint.value,
      price: largestPrint.price,
      side: largestPrint.side,
    } : null,
    mostActive: null,
    priceLevels,
    sizeDistribution: { mega: 0, large: 0, medium: 0, small: 0 },
    timeSeries,
    regime,
  };
}

function getEmptyStats(): DarkPoolStats {
  return {
    totalValue: 0,
    totalShares: 0,
    printCount: 0,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    bullishValue: 0,
    bearishValue: 0,
    bullishPct: 0,
    bearishPct: 0,
    largestPrint: null,
    mostActive: null,
    priceLevels: [],
    sizeDistribution: { mega: 0, large: 0, medium: 0, small: 0 },
    timeSeries: [],
    regime: 'NEUTRAL',
  };
}

// Helper to get last trading day range (handles closed markets)
function getLastTradingDayRange(): { gte: number; lte: number; isMarketClosed: boolean } {
  const now = new Date();
  const day = now.getDay();
  const hour = now.getHours();
  const minute = now.getMinutes();
  
  const isWeekend = day === 0 || day === 6;
  const isBeforeOpen = hour < 9 || (hour === 9 && minute < 30);
  const isAfterClose = hour >= 16;
  const isMarketClosed = isWeekend || isBeforeOpen || isAfterClose;
  
  if (isMarketClosed) {
    let lastTradingDay = new Date(now);
    
    if (day === 0) lastTradingDay.setDate(lastTradingDay.getDate() - 2);
    else if (day === 6) lastTradingDay.setDate(lastTradingDay.getDate() - 1);
    else if (isBeforeOpen) lastTradingDay.setDate(lastTradingDay.getDate() - 1);
    
    const adjustedDay = lastTradingDay.getDay();
    if (adjustedDay === 0) lastTradingDay.setDate(lastTradingDay.getDate() - 2);
    else if (adjustedDay === 6) lastTradingDay.setDate(lastTradingDay.getDate() - 1);
    
    const marketOpen = new Date(lastTradingDay);
    marketOpen.setHours(9, 30, 0, 0);
    
    const marketClose = new Date(lastTradingDay);
    marketClose.setHours(16, 0, 0, 0);
    
    console.log(`[Dark Pool] Market closed, using last trading day: ${lastTradingDay.toDateString()}`);
    
    return {
      gte: marketOpen.getTime(),
      lte: marketClose.getTime(),
      isMarketClosed: true,
    };
  }
  
  // Market is open, use last hour as default
  return {
    gte: now.getTime() - 60 * 60 * 1000,
    lte: now.getTime(),
    isMarketClosed: false,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = validateTicker(searchParams.get('tickers') || searchParams.get('ticker'));
  const limit = validateInt(searchParams.get('limit'), 100, 1, 500);
  
  // Request params logged — redacted in production
  
  if (!ticker) {
    return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
  }

  try {
    // Get time range
    const queryGte = searchParams.get('timestampGte');
    const queryLte = searchParams.get('timestampLte');
    
    let timestampGte: number;
    let timestampLte: number;
    let isMarketClosed = false;
    let tradingDay: string;
    
    if (queryGte && queryLte) {
      timestampGte = parseInt(queryGte);
      timestampLte = parseInt(queryLte);
      tradingDay = new Date(timestampGte).toDateString();
    } else {
      const timeRange = getLastTradingDayRange();
      timestampGte = timeRange.gte;
      timestampLte = timeRange.lte;
      isMarketClosed = timeRange.isMarketClosed;
      tradingDay = new Date(timestampGte).toDateString();
    }
    
    const dateStr = new Date(timestampGte).toISOString().split('T')[0];
    
    // Get current price and VWAP for side detection
    const prevUrl = `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const prevRes = await fetch(prevUrl, { signal: AbortSignal.timeout(5000) });
    const prevData = await prevRes.json();
    
    const currentPrice = prevData.results?.[0]?.c || 0;
    const vwap = prevData.results?.[0]?.vw || currentPrice;
    
    console.log('[DarkPool] Price:', currentPrice, 'VWAP:', vwap, 'Date:', dateStr);
    
    // Convert to nanoseconds for Polygon API
    const timestampGteNs = timestampGte * 1000000;
    const timestampLteNs = timestampLte * 1000000;
    
    const tradesUrl = `${POLYGON_BASE_URL}/v3/trades/${ticker}?timestamp.gte=${timestampGteNs}&timestamp.lte=${timestampLteNs}&limit=1000&order=desc&apiKey=${POLYGON_API_KEY}`;
    
    console.log('[DarkPool] Fetching trades...', {
      from: new Date(timestampGte).toISOString(),
      to: new Date(timestampLte).toISOString(),
      isMarketClosed,
    });
    
    const tradesRes = await fetch(tradesUrl, { signal: AbortSignal.timeout(15000) });
    
    if (!tradesRes.ok) {
      console.error('[DarkPool] Trades fetch failed:', tradesRes.status);
      return NextResponse.json({
        success: true,
        data: {
          prints: [],
          stats: getEmptyStats(),
        },
      });
    }
    
    const tradesData = await tradesRes.json();
    const allTrades = tradesData.results || [];
    
    console.log('[DarkPool] Total trades received:', allTrades.length);
    
    // Calculate adaptive thresholds based on time range
    const timeRangeMs = timestampLte - timestampGte;
    const autoThresholds = getThresholds(timeRangeMs);
    
    // Allow override from query params, otherwise use adaptive defaults
    const minSizeParam = searchParams.get('minSize');
    const minSize = minSizeParam ? parseInt(minSizeParam) : autoThresholds.minSize;
    const minValue = autoThresholds.minValue;
    
    // TWO-PASS FILTER:
    // Pass 1: Filter by dark pool exchange codes (the critical missing filter!)
    // Pass 2: Filter by size/value thresholds
    const darkPoolTrades = allTrades.filter((t: any) => {
      const exchange = t.exchange || 0;
      // Only include trades from dark pool / off-exchange venues
      return DARK_POOL_EXCHANGES.has(exchange);
    });
    
    console.log('[DarkPool] Dark pool exchange trades:', darkPoolTrades.length, 'out of', allTrades.length, 'total');
    
    const blockTrades = darkPoolTrades.filter((t: any) => {
      const size = t.size || 0;
      const price = parseFloat(t.price || currentPrice);
      const notional = size * price;
      return size >= minSize && notional >= minValue;
    });
    
    console.log('[DarkPool] Block trades after size filter:', blockTrades.length, 
      `(minSize: ${minSize}, minValue: $${minValue.toLocaleString()}, dark pool trades: ${darkPoolTrades.length})`);
    
    // If no block trades but we have dark pool trades, log size distribution for debugging
    if (blockTrades.length === 0 && darkPoolTrades.length > 0) {
      const sizes = darkPoolTrades.slice(0, 20).map((t: any) => ({
        size: t.size,
        notional: Math.round(parseFloat(t.price || 0) * (t.size || 0)),
        exchange: t.exchange,
      }));
      console.log('[DarkPool] Sample dark pool trades (top 20):', JSON.stringify(sizes));
      
      // Try with lower thresholds to show something useful
      const fallbackTrades = darkPoolTrades.filter((t: any) => {
        const size = t.size || 0;
        const price = parseFloat(t.price || currentPrice);
        return size >= 100 && (size * price) >= 10000; // Much lower: 100 shares / $10K
      });
      
      if (fallbackTrades.length > 0) {
        console.log('[DarkPool] Fallback trades (100+ shares, $10K+):', fallbackTrades.length);
        // Use fallback trades if we found some
        return processAndReturn(fallbackTrades.slice(0, limit), ticker, currentPrice, vwap, dateStr, timestampGte, timestampLte, isMarketClosed, tradingDay);
      }
    }
    
    return processAndReturn(blockTrades.slice(0, limit), ticker, currentPrice, vwap, dateStr, timestampGte, timestampLte, isMarketClosed, tradingDay);
    
  } catch (error: any) {
    const err = safeError(error, 'DarkPool', 'Failed to fetch dark pool data');
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }
}

function processAndReturn(
  trades: any[], 
  ticker: string, 
  currentPrice: number, 
  vwap: number, 
  dateStr: string,
  timestampGte: number,
  timestampLte: number,
  isMarketClosed: boolean,
  tradingDay: string
) {
  // Enrich with side detection
  const enrichedPrints: DarkPoolPrint[] = trades.map((trade: any, index: number) => {
    const price = parseFloat(trade.price || 0);
    const size = parseInt(trade.size || 0);
    const value = price * size;
    
    const { side, confidence } = determineSideWithVWAP(price, 0, 0, vwap);
    
    const timestampNs = trade.sip_timestamp || trade.participant_timestamp || 0;
    const timestampMs = Math.floor(timestampNs / 1000000);
    
    return {
      id: trade.sequence_number?.toString() || `${timestampNs}-${index}`,
      ticker,
      price: Math.round(price * 100) / 100,
      size,
      value: Math.round(value),
      side,
      sideConfidence: confidence,
      timestamp: new Date(timestampMs).toISOString(),
      timestampMs,
      exchange: getExchangeName(trade.exchange || 0),
      exchangeCode: trade.exchange || 0,
      significance: calculateSignificance(value),
      conditions: trade.conditions || [],
      bidAtTrade: 0,
      askAtTrade: 0,
    };
  });
  
  const stats = calculateDarkPoolStats(enrichedPrints);
  const priceDistribution = buildPriceDistribution(enrichedPrints, currentPrice);
  
  return NextResponse.json({
    success: true,
    data: {
      prints: enrichedPrints,
      stats,
      priceDistribution,
      queryDate: dateStr,
      meta: {
        isMarketClosed,
        tradingDay,
        dataFrom: new Date(timestampGte).toISOString(),
        dataTo: new Date(timestampLte).toISOString(),
      },
    },
  });
}

function buildPriceDistribution(prints: DarkPoolPrint[], currentPrice: number) {
  if (prints.length === 0) return [];
  
  const buckets: Record<string, { bullish: number; bearish: number; neutral: number }> = {};
  
  prints.forEach(p => {
    const bucket = (Math.round(p.price * 4) / 4).toFixed(2);
    if (!buckets[bucket]) {
      buckets[bucket] = { bullish: 0, bearish: 0, neutral: 0 };
    }
    const sideKey = p.side.toLowerCase() as 'bullish' | 'bearish' | 'neutral';
    buckets[bucket][sideKey] += p.value;
  });
  
  return Object.entries(buckets)
    .map(([price, values]) => ({
      price: parseFloat(price),
      bullish: values.bullish,
      bearish: values.bearish,
      neutral: values.neutral,
      total: values.bullish + values.bearish + values.neutral,
    }))
    .sort((a, b) => b.price - a.price)
    .slice(0, 20);
}
