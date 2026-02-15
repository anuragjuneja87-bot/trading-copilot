import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import type { DarkPoolPrint, DarkPoolStats, PriceLevel } from '@/types/darkpool';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Removed hardcoded MONITORED_TICKERS - now uses tickers from query params (user's watchlist)

// Dark pool exchange codes (ADF, FINRA facilities)
const DARK_POOL_EXCHANGES = [4, 19, 20]; // Common dark pool exchange IDs

function getExchangeName(exchangeCode: number): string {
  const exchanges: Record<number, string> = {
    1: 'NYSE',
    2: 'AMEX',
    3: 'ARCA',
    4: 'ADF', // Dark pool
    10: 'BX',
    11: 'NSX',
    12: 'FINRA',
    13: 'ISE',
    14: 'EDGA',
    15: 'EDGX',
    16: 'BATS',
    17: 'BATY',
    18: 'IEX',
    19: 'TRF', // Dark pool
    20: 'FINRA_ADF', // Dark pool
    21: 'MEMX',
  };
  return exchanges[exchangeCode] || `EX${exchangeCode}`;
}

// Calculate significance score (1-5) based on trade size
function calculateSignificance(value: number): 1 | 2 | 3 | 4 | 5 {
  if (value >= 50000000) return 5;      // $50M+
  if (value >= 10000000) return 4;       // $10M+
  if (value >= 5000000) return 3;       // $5M+
  if (value >= 1000000) return 2;        // $1M+
  return 1;                               // <$1M
}

// Determine trade side based on price vs bid/ask with confidence
function determineSide(
  price: number,
  bid: number,
  ask: number
): { side: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; confidence: number } {
  if (bid === 0 || ask === 0 || bid >= ask) {
    return { side: 'NEUTRAL', confidence: 0 };
  }

  const spread = ask - bid;
  const midPoint = (bid + ask) / 2;

  // Price at or above ask = aggressive buying (BULLISH)
  if (price >= ask) {
    const confidence = Math.min(100, 70 + ((price - ask) / spread) * 30);
    return { side: 'BULLISH', confidence: Math.round(confidence) };
  }

  // Price at or below bid = aggressive selling (BEARISH)
  if (price <= bid) {
    const confidence = Math.min(100, 70 + ((bid - price) / spread) * 30);
    return { side: 'BEARISH', confidence: Math.round(confidence) };
  }

  // Price between bid and ask - use midpoint as reference
  if (price > midPoint + spread * 0.1) {
    const confidence = 50 + ((price - midPoint) / (spread / 2)) * 20;
    return { side: 'BULLISH', confidence: Math.min(100, Math.round(confidence)) };
  }

  if (price < midPoint - spread * 0.1) {
    const confidence = 50 + ((midPoint - price) / (spread / 2)) * 20;
    return { side: 'BEARISH', confidence: Math.min(100, Math.round(confidence)) };
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

  // Find largest print
  const largestPrint = prints.reduce((max, p) => p.value > max.value ? p : max, prints[0]);

  // Find most active ticker
  const tickerCounts = prints.reduce((acc, p) => {
    acc[p.ticker] = (acc[p.ticker] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostActiveEntry = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1])[0];

  // Calculate price levels (aggregate value by price bucket)
  const levelMap = new Map<string, PriceLevel>();
  prints.forEach(p => {
    // Round to nearest $0.50 for stocks, or nearest $1 for high-priced stocks
    const bucket = p.price > 500 
      ? Math.round(p.price) 
      : Math.round(p.price * 2) / 2;
    const key = `${p.ticker}-${bucket}`;
    
    const existing = levelMap.get(key) || {
      ticker: p.ticker,
      price: bucket,
      totalValue: 0,
      totalShares: 0,
      printCount: 0,
      bullishValue: 0,
      bearishValue: 0,
      avgSize: 0,
    };
    
    existing.totalValue += p.value;
    existing.totalShares += p.size;
    existing.printCount += 1;
    if (p.side === 'BULLISH') existing.bullishValue += p.value;
    if (p.side === 'BEARISH') existing.bearishValue += p.value;
    existing.avgSize = existing.totalValue / existing.printCount;
    
    levelMap.set(key, existing);
  });

  const priceLevels = Array.from(levelMap.values())
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 10);

  // Print size distribution
  const sizeDistribution = {
    mega: prints.filter(p => p.value >= 10000000).length,    // $10M+
    large: prints.filter(p => p.value >= 1000000 && p.value < 10000000).length, // $1M-$10M
    medium: prints.filter(p => p.value >= 500000 && p.value < 1000000).length, // $500K-$1M
    small: prints.filter(p => p.value < 500000).length, // <$500K
  };

  // Time series (5-minute buckets)
  const bucketSize = 5 * 60 * 1000;
  const timeBuckets = new Map<number, any>();
  
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
    mostActive: mostActiveEntry ? { ticker: mostActiveEntry[0], count: mostActiveEntry[1] } : null,
    priceLevels,
    sizeDistribution,
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

export async function GET(request: NextRequest) {
  try {
    // Allow public access for the free dark pool page
    const isPublicRequest = request.headers.get('x-internal-public') === 'true';
    if (!isPublicRequest) {
      // Check authentication for protected requests
      const session = await getServerSession();
      if (!session?.user) {
        return NextResponse.json(
          { success: false, error: 'Unauthorized' },
          { status: 401 }
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const tickerFilter = searchParams.get('ticker'); // Single ticker
    const tickersParam = searchParams.get('tickers'); // Multiple tickers (comma-separated)
    const minSize = parseInt(searchParams.get('minSize') || '100000');
    const timeFilter = searchParams.get('time') || 'hour';
    
    // Priority: single ticker > multiple tickers param > empty (return empty result)
    let tickers: string[] = [];
    
    if (tickerFilter) {
      tickers = [tickerFilter.toUpperCase()];
    } else if (tickersParam) {
      tickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    }
    
    // If no tickers provided, return empty result (don't use hardcoded list)
    if (tickers.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          prints: [],
          stats: getEmptyStats(),
        },
        message: 'No tickers specified. Select tickers from your watchlist.',
      });
    }

    console.log('=== DARK POOL API START ===');
    console.log(`Fetching for tickers: ${tickers.join(', ')}`);
    console.log(`Time filter: ${timeFilter}, minSize: $${minSize}`);
    
    const allPrints: DarkPoolPrint[] = [];
    const quoteCache = new Map<string, { bid: number; ask: number; mid: number }>();

    // Fetch current quotes for side detection
    for (const ticker of tickers.slice(0, 10)) {
      try {
        const quoteUrl = `${POLYGON_BASE_URL}/v2/last/nbbo/${ticker}?apiKey=${POLYGON_API_KEY}`;
        const quoteResponse = await fetch(quoteUrl, {
          next: { revalidate: 5 },
          signal: AbortSignal.timeout(10000),
        });
        
        if (quoteResponse.ok) {
          const quoteData = await quoteResponse.json();
          const result = quoteData.results?.[0];
          if (result) {
            const bidPrice = parseFloat(result.bid || result.P || 0);
            const askPrice = parseFloat(result.ask || result.p || 0);
            if (bidPrice > 0 && askPrice > 0 && bidPrice < askPrice) {
              quoteCache.set(ticker, {
                bid: bidPrice,
                ask: askPrice,
                mid: (bidPrice + askPrice) / 2,
              });
              console.log(`[Dark Pool API] ${ticker}: Quote ${bidPrice.toFixed(2)} / ${askPrice.toFixed(2)}`);
            }
          }
        }
      } catch (e) {
        console.error(`[Dark Pool API] Quote fetch failed for ${ticker}:`, e);
      }
    }

    // Calculate timestamp filter
    const now = Date.now();
    let timestampGte = now - 60 * 60 * 1000; // Default: last hour
    if (timeFilter === 'day') {
      timestampGte = now - 24 * 60 * 60 * 1000;
    } else if (timeFilter === 'week') {
      timestampGte = now - 7 * 24 * 60 * 60 * 1000;
    }
    
    console.log(`[Dark Pool API] Time filter: ${timeFilter}, timestampGte: ${new Date(timestampGte).toISOString()}`);

    // Fetch trades for each ticker
    for (const ticker of tickers.slice(0, 10)) {
      try {
        // Fetch trades - use nanoseconds
        const timestampGteNs = timestampGte * 1000000;
        const tradesUrl = `${POLYGON_BASE_URL}/v3/trades/${ticker}?timestamp.gte=${timestampGteNs}&limit=1000&order=desc&apiKey=${POLYGON_API_KEY}`;
        
        console.log(`[Dark Pool API] Fetching trades for ${ticker} from ${new Date(timestampGte).toISOString()}`);
        
        const tradesResponse = await fetch(tradesUrl, {
          next: { revalidate: 10 },
          signal: AbortSignal.timeout(10000),
        });
        
        if (!tradesResponse.ok) {
          console.error(`[Dark Pool API] Trades fetch failed for ${ticker}: ${tradesResponse.status}`);
          continue;
        }

        const tradesData = await tradesResponse.json();
        const trades = tradesData.results || [];
        
        console.log(`[Dark Pool API] ${ticker}: Found ${trades.length} total trades`);

        // Filter for dark pool trades
        const quote = quoteCache.get(ticker);
        
        for (const trade of trades) {
          const price = parseFloat(trade.price || 0);
          const size = parseInt(trade.size || 0);
          const value = price * size;
          
          // Skip if value is too small
          if (value < minSize) continue;

          // Check if dark pool exchange OR large block trade
          const exchangeId = trade.exchange || 0;
          const isDarkPool = DARK_POOL_EXCHANGES.includes(exchangeId);
          // Lower threshold: large block is value >= minSize OR size >= 1000 shares (more lenient)
          const isLargeBlock = value >= minSize || size >= 1000;
          
          if (!isDarkPool && !isLargeBlock) {
            continue;
          }
          
          // Log when we find a potential print
          if (allPrints.length < 5) {
            console.log(`[Dark Pool API] ${ticker}: Found potential print - value: $${value.toFixed(0)}, size: ${size}, exchange: ${exchangeId} (${getExchangeName(exchangeId)}), isDarkPool: ${isDarkPool}, isLargeBlock: ${isLargeBlock}`);
          }

          // Determine side with confidence
          const { side, confidence } = determineSide(
            price,
            quote?.bid || 0,
            quote?.ask || 0
          );

          // Calculate significance
          const significance = calculateSignificance(value);

          const timestampNs = trade.sip_timestamp || trade.participant_timestamp || 0;
          const timestampMs = Math.floor(timestampNs / 1000000);

          const print: DarkPoolPrint = {
            id: `${ticker}-${timestampNs}-${trade.sequence_number || Date.now()}`,
            ticker,
            price,
            size,
            value: Math.round(value),
            timestamp: new Date(timestampMs).toISOString(),
            timestampMs,
            exchange: getExchangeName(exchangeId),
            exchangeCode: exchangeId,
            side,
            sideConfidence: confidence,
            significance,
            conditions: trade.conditions || [],
            bidAtTrade: quote?.bid || 0,
            askAtTrade: quote?.ask || 0,
          };

          allPrints.push(print);
        }
        
        const printsForTicker = allPrints.filter(p => p.ticker === ticker).length;
        console.log(`[Dark Pool API] ${ticker}: Added ${printsForTicker} prints (total so far: ${allPrints.length})`);
        
        // If no prints found for this ticker, log why
        if (printsForTicker === 0 && trades.length > 0) {
          const sampleTrade = trades[0];
          const sampleValue = (parseFloat(sampleTrade.price || 0) * parseInt(sampleTrade.size || 0));
          console.log(`[Dark Pool API] ${ticker}: No prints found. Sample trade: value=$${sampleValue.toFixed(0)}, size=${sampleTrade.size}, exchange=${sampleTrade.exchange}`);
        }
      } catch (tickerError) {
        console.error(`[Dark Pool API] Error processing ${ticker}:`, tickerError);
      }
    }

    // Sort by timestamp (newest first)
    allPrints.sort((a, b) => b.timestampMs - a.timestampMs);

    // Calculate enhanced stats
    const stats = calculateDarkPoolStats(allPrints);

    console.log(`=== DARK POOL RESULTS ===`);
    console.log(`Total prints: ${allPrints.length}`);
    console.log(`Bullish: ${stats.bullishCount}, Bearish: ${stats.bearishCount}, Neutral: ${stats.neutralCount}`);
    console.log(`Total value: $${(stats.totalValue / 1000000).toFixed(1)}M`);
    console.log(`Bullish %: ${stats.bullishPct}%, Bearish %: ${stats.bearishPct}%`);

    return NextResponse.json({
      success: true,
      data: {
        prints: allPrints.slice(0, 100), // Limit to 100 most recent
        stats: stats,
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=20',
      },
    });

  } catch (error: any) {
    console.error('[Dark Pool API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch dark pool data' },
      { status: 500 }
    );
  }
}
