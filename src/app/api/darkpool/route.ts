import { NextRequest, NextResponse } from 'next/server';
import type { DarkPoolPrint, DarkPoolStats } from '@/types/darkpool';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Dark pool exchange codes
const DARK_POOL_EXCHANGES = [4, 19, 20];

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
  const priceLevels: Array<{ price: number; bullish: number; bearish: number; neutral: number }> = [];
  const priceMap = new Map<number, { bullish: number; bearish: number; neutral: number }>();

  prints.forEach(p => {
    const roundedPrice = Math.round(p.price * 4) / 4; // Round to $0.25
    const existing = priceMap.get(roundedPrice) || { bullish: 0, bearish: 0, neutral: 0 };
    
    if (p.side === 'BULLISH') existing.bullish += p.value;
    else if (p.side === 'BEARISH') existing.bearish += p.value;
    else existing.neutral += p.value;
    
    priceMap.set(roundedPrice, existing);
  });

  priceMap.forEach((values, price) => {
    priceLevels.push({ price, ...values });
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

  const bucketSize = 15 * 60 * 1000; // 15 minutes
  prints.forEach(p => {
    const bucket = Math.floor(p.timestampMs / bucketSize) * bucketSize;
    const existing = timeBuckets.get(bucket) || {
      time: new Date(bucket).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
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
  
  // If market is closed (before 9:30 AM or after 4 PM ET, or weekend)
  const isWeekend = day === 0 || day === 6;
  const isBeforeOpen = hour < 9 || (hour === 9 && minute < 30);
  const isAfterClose = hour >= 16;
  const isMarketClosed = isWeekend || isBeforeOpen || isAfterClose;
  
  if (isMarketClosed) {
    // Go back to last trading day
    let lastTradingDay = new Date(now);
    
    if (day === 0) lastTradingDay.setDate(lastTradingDay.getDate() - 2); // Sunday -> Friday
    else if (day === 6) lastTradingDay.setDate(lastTradingDay.getDate() - 1); // Saturday -> Friday
    else if (isBeforeOpen) lastTradingDay.setDate(lastTradingDay.getDate() - 1); // Before open -> yesterday
    
    // Adjust for weekend if yesterday was weekend
    const adjustedDay = lastTradingDay.getDay();
    if (adjustedDay === 0) lastTradingDay.setDate(lastTradingDay.getDate() - 2);
    else if (adjustedDay === 6) lastTradingDay.setDate(lastTradingDay.getDate() - 1);
    
    // Set to market hours (9:30 AM - 4:00 PM ET)
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
  
  // Market is open, use current time
  return {
    gte: now.getTime() - 60 * 60 * 1000, // Last hour
    lte: now.getTime(),
    isMarketClosed: false,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const ticker = searchParams.get('tickers')?.toUpperCase() || searchParams.get('ticker')?.toUpperCase();
  const limit = parseInt(searchParams.get('limit') || '100');
  
  console.log('[DarkPool] Request received:', { ticker, limit, params: Object.fromEntries(searchParams.entries()) });
  
  if (!ticker) {
    return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
  }

  try {
    // Get time range (handles closed markets and timeframe params)
    const queryGte = searchParams.get('timestampGte');
    const queryLte = searchParams.get('timestampLte');
    
    let timestampGte: number;
    let timestampLte: number;
    let isMarketClosed = false;
    let tradingDay: string;
    
    if (queryGte && queryLte) {
      // Use provided timeframe params
      timestampGte = parseInt(queryGte);
      timestampLte = parseInt(queryLte);
      tradingDay = new Date(timestampGte).toDateString();
    } else {
      // Auto-detect: get last trading day if market is closed
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
    const prevClose = prevData.results?.[0]?.c || currentPrice;
    const dayVolume = prevData.results?.[0]?.v || 0;
    
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
    
    // Filter for block trades (dark pool indicator)
    // Use more lenient filter: $10K minimum (or use minSize param if provided)
    const minSizeParam = searchParams.get('minSize');
    const minNotional = minSizeParam ? parseInt(minSizeParam) : 10000; // Default $10K for better data capture
    
    const blockTrades = allTrades.filter((t: any) => {
      const size = t.size || 0;
      const price = parseFloat(t.price || currentPrice);
      const notional = size * price;
      
      // Also check if it's a large size trade (100+ shares) even if notional is lower
      const isLargeSize = size >= 100;
      const isLargeNotional = notional >= minNotional;
      
      return isLargeNotional || isLargeSize;
    });
    
    console.log('[DarkPool] Block trades found:', blockTrades.length, `(minNotional: $${minNotional}, total trades: ${allTrades.length})`);
    
    // If no block trades found, log sample trades for debugging
    if (blockTrades.length === 0 && allTrades.length > 0) {
      const sampleTrade = allTrades[0];
      const sampleNotional = (parseFloat(sampleTrade.price || 0) * parseInt(sampleTrade.size || 0));
      console.log('[DarkPool] Sample trade:', {
        price: sampleTrade.price,
        size: sampleTrade.size,
        notional: sampleNotional,
        exchange: sampleTrade.exchange,
        timestamp: sampleTrade.sip_timestamp,
      });
    }
    
    // Enrich with side detection based on VWAP
    const enrichedPrints: DarkPoolPrint[] = blockTrades.slice(0, limit).map((trade: any, index: number) => {
      const price = parseFloat(trade.price || 0);
      const size = parseInt(trade.size || 0);
      const value = price * size;
      
      // Determine side based on price vs VWAP
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
    
    // Calculate stats
    const stats = calculateDarkPoolStats(enrichedPrints);
    
    // Build price distribution for chart
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
    
  } catch (error: any) {
    console.error('[DarkPool] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

function buildPriceDistribution(prints: DarkPoolPrint[], currentPrice: number) {
  if (prints.length === 0) return [];
  
  // Group by price level (round to nearest $0.25)
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
    .slice(0, 20); // Top 20 price levels
}
