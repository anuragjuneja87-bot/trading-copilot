import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

/**
 * Fast API endpoint for key levels (Call Wall, Put Wall, Max Gamma)
 * Uses options snapshot data to calculate gamma exposure
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();

    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter required' },
        { status: 400 }
      );
    }

    if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
      return NextResponse.json(
        { success: false, error: 'POLYGON_API_KEY not configured' },
        { status: 500 }
      );
    }

    // Get current price
    const priceRes = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${ticker}&apiKey=${POLYGON_API_KEY}`,
      {
        next: { revalidate: 5 },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!priceRes.ok) {
      throw new Error(`Failed to fetch price: ${priceRes.status}`);
    }

    const priceData = await priceRes.json();
    const currentPrice = priceData.tickers?.[0]?.lastTrade?.p;
    
    if (!currentPrice) {
      throw new Error(`Could not get current price for ${ticker}`);
    }

    // Get options snapshot to calculate gamma levels
    const snapshotRes = await fetch(
      `https://api.polygon.io/v3/snapshot/options/${ticker}?apiKey=${POLYGON_API_KEY}`,
      {
        next: { revalidate: 60 }, // Cache for 1 minute
        signal: AbortSignal.timeout(15000),
      }
    );

    if (!snapshotRes.ok) {
      // Fallback: return estimated levels based on current price
      // Ensure all three values are different
      const callWallEst = Math.round(currentPrice * 1.02);
      const putWallEst = Math.round(currentPrice * 0.98);
      const maxGammaEst = Math.round(currentPrice * 1.01); // Slightly above current price
      
      return NextResponse.json({
        success: true,
        data: {
          ticker,
          callWall: callWallEst,
          putWall: putWallEst,
          maxGamma: maxGammaEst,
          currentPrice,
          source: 'estimated',
        },
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      });
    }

    const snapshotData = await snapshotRes.json();
    const contracts = snapshotData.results || [];

    if (contracts.length === 0) {
      // Fallback: return estimated levels
      // Ensure all three values are different
      const callWallEst = Math.round(currentPrice * 1.02);
      const putWallEst = Math.round(currentPrice * 0.98);
      const maxGammaEst = Math.round(currentPrice * 1.01); // Slightly above current price
      
      return NextResponse.json({
        success: true,
        data: {
          ticker,
          callWall: callWallEst,
          putWall: putWallEst,
          maxGamma: maxGammaEst,
          currentPrice,
          source: 'estimated',
        },
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      });
    }

    // Calculate gamma exposure by strike
    const gammaByStrike = new Map<number, { callGex: number; putGex: number }>();

    for (const contract of contracts) {
      const strike = contract.details?.strike_price;
      const contractType = (contract.details?.contract_type || '').toLowerCase();
      const gamma = parseFloat(contract.greeks?.gamma || '0');
      const openInterest = contract.open_interest || 0;
      const volume = contract.day?.volume || 0;

      if (!strike || !gamma) continue;

      // Gamma exposure = gamma * open interest * 100 (contract multiplier)
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

    // Find Call Wall (strike with max call GEX, above current price)
    let callWall = Math.round(currentPrice * 1.02);
    let maxCallGex = 0;
    for (const [strike, { callGex }] of gammaByStrike.entries()) {
      // Prefer strikes above current price for call wall
      if (strike >= currentPrice && callGex > maxCallGex) {
        maxCallGex = callGex;
        callWall = strike;
      }
    }
    // If no strikes above price, find the highest strike with call GEX
    if (callWall === Math.round(currentPrice * 1.02) && maxCallGex === 0) {
      for (const [strike, { callGex }] of gammaByStrike.entries()) {
        if (callGex > maxCallGex) {
          maxCallGex = callGex;
          callWall = strike;
        }
      }
    }
    // Ensure call wall is different from current price
    if (callWall === Math.round(currentPrice)) {
      callWall = Math.round(currentPrice * 1.02);
    }

    // Find Put Wall (strike with max put GEX, below current price)
    let putWall = Math.round(currentPrice * 0.98);
    let maxPutGex = 0;
    for (const [strike, { putGex }] of gammaByStrike.entries()) {
      // Prefer strikes below current price for put wall
      if (strike <= currentPrice && putGex > maxPutGex) {
        maxPutGex = putGex;
        putWall = strike;
      }
    }
    // If no strikes below price, find the lowest strike with put GEX
    if (putWall === Math.round(currentPrice * 0.98) && maxPutGex === 0) {
      for (const [strike, { putGex }] of gammaByStrike.entries()) {
        if (putGex > maxPutGex) {
          maxPutGex = putGex;
          putWall = strike;
        }
      }
    }
    // Ensure put wall is different from current price
    if (putWall === Math.round(currentPrice)) {
      putWall = Math.round(currentPrice * 0.98);
    }

    // Find Max Gamma (strike with max total GEX, can be anywhere)
    let maxGamma = Math.round(currentPrice);
    let maxTotalGex = 0;
    for (const [strike, { callGex, putGex }] of gammaByStrike.entries()) {
      const totalGex = Math.abs(callGex) + Math.abs(putGex);
      if (totalGex > maxTotalGex) {
        maxTotalGex = totalGex;
        maxGamma = strike;
      }
    }
    // Ensure max gamma is different from call/put walls
    if (maxGamma === callWall || maxGamma === putWall) {
      // Find next best strike
      let secondBestGamma = Math.round(currentPrice);
      let secondBestGex = 0;
      for (const [strike, { callGex, putGex }] of gammaByStrike.entries()) {
        if (strike === maxGamma) continue;
        const totalGex = Math.abs(callGex) + Math.abs(putGex);
        if (totalGex > secondBestGex) {
          secondBestGex = totalGex;
          secondBestGamma = strike;
        }
      }
      if (secondBestGamma !== Math.round(currentPrice)) {
        maxGamma = secondBestGamma;
      } else {
        // Use a different value from call/put walls
        maxGamma = Math.round((callWall + putWall) / 2);
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        callWall: Math.round(callWall),
        putWall: Math.round(putWall),
        maxGamma: Math.round(maxGamma),
        currentPrice,
        source: 'calculated',
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });
  } catch (error: any) {
    console.error('[Levels API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch key levels',
      },
      { status: 500 }
    );
  }
}
