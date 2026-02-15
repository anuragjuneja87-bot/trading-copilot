import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

interface TopTrade {
  ticker: string;
  strike: number;
  expiry: string;
  callPut: 'C' | 'P';
  premium: number;
  volume: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
      return NextResponse.json(
        { success: false, error: 'POLYGON_API_KEY not configured' },
        { status: 500 }
      );
    }

    const tickers = tickersParam
      ? tickersParam.split(',').map(t => t.trim().toUpperCase())
      : ['SPY', 'QQQ', 'NVDA'];

    // Fetch options snapshots for all tickers in parallel
    const snapshotPromises = tickers.map(async (ticker) => {
      try {
        const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, {
          next: { revalidate: 30 },
          signal: AbortSignal.timeout(10000),
        });

        if (!res.ok) {
          console.warn(`[Flow Summary] Failed to fetch ${ticker}: ${res.status}`);
          return { ticker, contracts: [] };
        }

        const data = await res.json();
        return { ticker, contracts: data.results || [] };
      } catch (err) {
        console.warn(`[Flow Summary] Error fetching ${ticker}:`, err);
        return { ticker, contracts: [] };
      }
    });

    const snapshots = await Promise.all(snapshotPromises);

    // Compute summary stats
    let totalCallPremium = 0;
    let totalPutPremium = 0;
    let sweepCount = 0;
    let unusualCount = 0;
    const allTrades: Array<{
      ticker: string;
      strike: number;
      expiry: string;
      callPut: 'C' | 'P';
      premium: number;
      volume: number;
      openInterest: number;
    }> = [];

    for (const { ticker, contracts } of snapshots) {
      for (const contract of contracts) {
        const day = contract.day || {};
        const volume = day.volume || 0;
        const vwap = parseFloat(day.vwap || '0');
        const openInterest = contract.open_interest || 0;
        const contractType = (contract.details?.contract_type || '').toUpperCase();
        const callPut = contractType === 'CALL' || contractType === 'C' ? 'C' : 'P';
        const strike = contract.details?.strike_price || 0;
        const expiry = contract.details?.expiration_date || '';

        if (volume > 0 && vwap > 0) {
          const premium = volume * vwap * 100; // Contract multiplier

          if (callPut === 'C') {
            totalCallPremium += premium;
          } else {
            totalPutPremium += premium;
          }

          // Check for sweeps (volume > open interest)
          if (volume > openInterest && openInterest > 0) {
            sweepCount++;
          }

          // Check for unusual (volume > 5x average or premium > $100K)
          // For simplicity, we'll use premium > $100K as unusual
          if (premium > 100000) {
            unusualCount++;
          }

          allTrades.push({
            ticker,
            strike,
            expiry,
            callPut,
            premium,
            volume,
            openInterest,
          });
        }
      }
    }

    // Calculate call/put ratio
    const callPutRatio = totalPutPremium > 0 ? totalCallPremium / totalPutPremium : totalCallPremium > 0 ? 999 : 1;

    // Determine net direction
    let netDirection: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (callPutRatio > 1.3) {
      netDirection = 'BULLISH';
    } else if (callPutRatio < 0.7) {
      netDirection = 'BEARISH';
    }

    // Get top 5 trades by premium
    const topTrades: TopTrade[] = allTrades
      .sort((a, b) => b.premium - a.premium)
      .slice(0, 5)
      .map((t) => ({
        ticker: t.ticker,
        strike: t.strike,
        expiry: t.expiry,
        callPut: t.callPut,
        premium: t.premium,
        volume: t.volume,
      }));

    const totalPremium = totalCallPremium + totalPutPremium;

    return NextResponse.json(
      {
        success: true,
        data: {
          netDirection,
          callPutRatio: Math.round(callPutRatio * 100) / 100,
          totalPremium: Math.round(totalPremium),
          callPremium: Math.round(totalCallPremium),
          putPremium: Math.round(totalPutPremium),
          sweepCount,
          unusualCount,
          topTrades,
          tickers,
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
    console.error('[Flow Summary API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch flow summary',
      },
      { status: 500 }
    );
  }
}
