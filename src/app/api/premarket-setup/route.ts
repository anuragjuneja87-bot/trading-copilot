import { NextRequest, NextResponse } from 'next/server';
import { validateTicker, validateTickers, validateInt } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

interface TickerSetupData {
  ticker: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  gap: number;
  gapPercent: number;
  volume: number;
  relativeVolume: number | null;
  callWall?: number;
  putWall?: number;
  maxGamma?: number;
}

function getMarketStatus(): 'pre-market' | 'market' | 'after-hours' {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const time = hour * 60 + minute;

  // Pre-market: 4:00 AM - 9:30 AM ET
  if (time >= 240 && time < 570) return 'pre-market';
  // Market hours: 9:30 AM - 4:00 PM ET
  if (time >= 570 && time < 960) return 'market';
  // After-hours: 4:00 PM - 8:00 PM ET
  if (time >= 960 && time < 1200) return 'after-hours';
  // Closed
  return 'pre-market'; // Default to pre-market for overnight
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
      return NextResponse.json(
        { success: false, error: 'Market data service not configured' },
        { status: 500 }
      );
    }

    const tickers = tickersParam
      ? validateTickers(tickersParam, 10)
      : ['SPY', 'QQQ', 'NVDA'];
    
    if (tickersParam && tickers.length === 0) {
      return NextResponse.json({ success: false, error: 'Invalid ticker symbols' }, { status: 400 });
    }

    // Fetch prices from Polygon snapshot
    const pricesUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_API_KEY}`;
    const pricesRes = await fetch(pricesUrl, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(10000),
    });

    if (!pricesRes.ok) {
      throw new Error(`Failed to fetch prices: ${pricesRes.status}`);
    }

    const pricesData = await pricesRes.json();

    // Fetch key levels for SPY (if SPY is in the list)
    let spyLevels: { callWall?: number; putWall?: number; maxGamma?: number } = {};
    if (tickers.includes('SPY')) {
      try {
        // Call the levels API directly (internal fetch to avoid circular dependency)
        const levelsUrl = `https://api.polygon.io/v3/snapshot/options/SPY?apiKey=${POLYGON_API_KEY}`;
        const levelsRes = await fetch(levelsUrl, {
          next: { revalidate: 60 },
          signal: AbortSignal.timeout(15000),
        });

        if (levelsRes.ok) {
          const levelsData = await levelsRes.json();
          const contracts = levelsData.results || [];
          const currentPrice = pricesData.tickers?.find((t: any) => t.ticker === 'SPY')?.lastTrade?.p || 0;

          if (currentPrice > 0 && contracts.length > 0) {
            // Calculate gamma levels (simplified version of levels API logic)
            const gammaByStrike = new Map<number, { callGex: number; putGex: number }>();

            for (const contract of contracts) {
              const strike = contract.details?.strike_price;
              const contractType = (contract.details?.contract_type || '').toLowerCase();
              const gamma = parseFloat(contract.greeks?.gamma || '0');
              const openInterest = contract.open_interest || 0;
              const volume = contract.day?.volume || 0;

              if (!strike || !gamma) continue;

              const gex = gamma * (openInterest || volume) * 100;

              if (!gammaByStrike.has(strike)) {
                gammaByStrike.set(strike, { callGex: 0, putGex: 0 });
              }

              const existing = gammaByStrike.get(strike)!;
              if (contractType === 'call' || contractType === 'c') {
                existing.callGex += gex;
              } else if (contractType === 'put' || contractType === 'p') {
                existing.putGex += gex;
              }
            }

            // Find Call Wall
            let callWall = currentPrice;
            let maxCallGex = 0;
            for (const [strike, { callGex }] of gammaByStrike.entries()) {
              if (strike >= currentPrice && callGex > maxCallGex) {
                maxCallGex = callGex;
                callWall = strike;
              }
            }
            if (callWall === currentPrice) {
              callWall = Math.round(currentPrice * 1.02);
            }

            // Find Put Wall
            let putWall = currentPrice;
            let maxPutGex = 0;
            for (const [strike, { putGex }] of gammaByStrike.entries()) {
              if (strike <= currentPrice && putGex > maxPutGex) {
                maxPutGex = putGex;
                putWall = strike;
              }
            }
            if (putWall === currentPrice) {
              putWall = Math.round(currentPrice * 0.98);
            }

            // Find Max Gamma
            let maxGamma = currentPrice;
            let maxTotalGex = 0;
            for (const [strike, { callGex, putGex }] of gammaByStrike.entries()) {
              const totalGex = Math.abs(callGex) + Math.abs(putGex);
              if (totalGex > maxTotalGex) {
                maxTotalGex = totalGex;
                maxGamma = strike;
              }
            }

            spyLevels = {
              callWall: Math.round(callWall),
              putWall: Math.round(putWall),
              maxGamma: Math.round(maxGamma),
            };
          }
        }
      } catch (err) {
        console.warn('[Premarket Setup] Failed to fetch SPY levels:', err);
        // Continue without levels
      }
    }

    // Process ticker data
    const tickerData: TickerSetupData[] = [];

    for (const item of pricesData.tickers || []) {
      const lastTrade = item.lastTrade || {};
      const prevDay = item.prevDay || {};
      const day = item.day || {};

      const price = parseFloat(lastTrade.p) || 0;
      const prevClose = parseFloat(prevDay.c) || 0;
      const volume = parseInt(day.v) || 0;

      if (price > 0 && prevClose > 0) {
        const change = price - prevClose;
        const changePercent = (change / prevClose) * 100;
        const gap = change;
        const gapPercent = changePercent;

        const tickerSetup: TickerSetupData = {
          ticker: item.ticker,
          price,
          prevClose,
          change,
          changePercent,
          gap,
          gapPercent,
          volume,
          relativeVolume: null, // Would need historical data to calculate
        };

        // Add levels for SPY only
        if (item.ticker === 'SPY' && spyLevels.callWall) {
          tickerSetup.callWall = spyLevels.callWall;
          tickerSetup.putWall = spyLevels.putWall;
          tickerSetup.maxGamma = spyLevels.maxGamma;
        }

        tickerData.push(tickerSetup);
      }
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          tickers: tickerData,
          marketStatus: getMarketStatus(),
          timestamp: new Date().toISOString(),
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: any) {
    console.error('[Premarket Setup API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: "An error occurred" || 'Failed to fetch premarket setup',
      },
      { status: 500 }
    );
  }
}
