import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
    // Next.js 15: params is a Promise, must await
    const { ticker: tickerParam } = await params;
    const ticker = tickerParam?.toUpperCase();
    
    if (!ticker) {
      return NextResponse.json(
        { success: false, error: 'Ticker parameter required' }, 
        { status: 400 }
      );
    }

    if (!POLYGON_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'API key not configured' }, 
        { status: 500 }
      );
    }

    // Fetch snapshot from Polygon
    const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;
    
    const res = await fetch(url, { 
      next: { revalidate: 30 } // Cache for 30 seconds
    });

    if (!res.ok) {
      console.error(`[Levels API] Polygon error: ${res.status}`);
      return NextResponse.json(
        { success: false, error: `Failed to fetch data for ${ticker}` }, 
        { status: res.status }
      );
    }

    const data = await res.json();

    if (!data.ticker) {
      return NextResponse.json(
        { success: false, error: `Ticker ${ticker} not found` }, 
        { status: 404 }
      );
    }

    const snapshot = data.ticker;
    const price = snapshot.lastTrade?.p || snapshot.day?.c || snapshot.prevDay?.c || 0;
    const high = snapshot.day?.h || snapshot.prevDay?.h || price;
    const low = snapshot.day?.l || snapshot.prevDay?.l || price;
    const open = snapshot.day?.o || snapshot.prevDay?.o || price;
    const prevClose = snapshot.prevDay?.c || price;
    const volume = snapshot.day?.v || 0;
    const vwap = snapshot.day?.vw || price;

    // Calculate range
    const range = high - low;
    const prevRange = snapshot.prevDay?.h && snapshot.prevDay?.l 
      ? snapshot.prevDay.h - snapshot.prevDay.l 
      : range;

    // Pivot point
    const pivot = (high + low + prevClose) / 3;
    
    // Helper to round numbers
    const r = (n: number, decimals: number = 2) => 
      Math.round(n * Math.pow(10, decimals)) / Math.pow(10, decimals);

    // Camarilla Levels
    const camarilla = {
      r4: prevClose + prevRange * 1.1 / 2,
      r3: prevClose + prevRange * 1.1 / 4,
      r2: prevClose + prevRange * 1.1 / 6,
      r1: prevClose + prevRange * 1.1 / 12,
      s1: prevClose - prevRange * 1.1 / 12,
      s2: prevClose - prevRange * 1.1 / 6,
      s3: prevClose - prevRange * 1.1 / 4,
      s4: prevClose - prevRange * 1.1 / 2,
    };

    // Calculate change
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    // Get nearest Friday expiry for options
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
    const friday = new Date(today);
    friday.setDate(today.getDate() + daysUntilFriday);
    const expiryStr = friday.toISOString().split('T')[0];
    
    // Fetch options chain to calculate gamma levels
    let callWall = null;
    let putWall = null;
    let maxGamma = null;
    let gexFlip = null;
    let maxPain = null;
    let expectedMove = null;
    
    try {
      const optionsUrl = `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiryStr}&limit=250&apiKey=${POLYGON_API_KEY}`;
      const optionsRes = await fetch(optionsUrl, { 
        next: { revalidate: 60 },
        signal: AbortSignal.timeout(15000) 
      });
      
      if (optionsRes.ok) {
        const optionsData = await optionsRes.json();
        const options = optionsData.results || [];
        
        if (options.length > 0) {
          // Calculate gamma levels
          const gammaByStrike: Record<number, { callGamma: number; putGamma: number; callOI: number; putOI: number; callPremium: number; putPremium: number }> = {};
          
          options.forEach((opt: any) => {
            const strike = opt.details?.strike_price;
            const gamma = opt.greeks?.gamma || 0;
            const oi = opt.open_interest || 0;
            const isCall = opt.details?.contract_type === 'call';
            const premium = (opt.last_quote?.midpoint || opt.day?.close || 0) * (oi * 100);
            
            if (!strike) return;
            
            if (!gammaByStrike[strike]) {
              gammaByStrike[strike] = { callGamma: 0, putGamma: 0, callOI: 0, putOI: 0, callPremium: 0, putPremium: 0 };
            }
            
            if (isCall) {
              gammaByStrike[strike].callGamma += gamma * oi * 100;
              gammaByStrike[strike].callOI += oi;
              gammaByStrike[strike].callPremium += premium;
            } else {
              gammaByStrike[strike].putGamma += gamma * oi * 100;
              gammaByStrike[strike].putOI += oi;
              gammaByStrike[strike].putPremium += premium;
            }
          });
          
          const strikes = Object.keys(gammaByStrike).map(Number).sort((a, b) => a - b);
          
          // Find Call Wall (highest call premium/OI)
          let maxCallPremium = 0;
          strikes.forEach(strike => {
            if (gammaByStrike[strike].callPremium > maxCallPremium) {
              maxCallPremium = gammaByStrike[strike].callPremium;
              callWall = strike;
            }
          });
          
          // Find Put Wall (highest put premium/OI)
          let maxPutPremium = 0;
          strikes.forEach(strike => {
            if (gammaByStrike[strike].putPremium > maxPutPremium) {
              maxPutPremium = gammaByStrike[strike].putPremium;
              putWall = strike;
            }
          });
          
          // Find Max Gamma (highest total gamma)
          let maxTotalGamma = 0;
          strikes.forEach(strike => {
            const totalGamma = Math.abs(gammaByStrike[strike].callGamma) + Math.abs(gammaByStrike[strike].putGamma);
            if (totalGamma > maxTotalGamma) {
              maxTotalGamma = totalGamma;
              maxGamma = strike;
            }
          });
          
          // Find GEX Flip (where net gamma crosses zero)
          let prevNetGex = null;
          for (const strike of strikes) {
            const netGex = gammaByStrike[strike].callGamma - gammaByStrike[strike].putGamma;
            if (prevNetGex !== null && prevNetGex < 0 && netGex >= 0) {
              gexFlip = strike;
              break;
            }
            prevNetGex = netGex;
          }
          
          // Calculate Max Pain
          let minPain = Infinity;
          for (const testPrice of strikes) {
            let totalPain = 0;
            
            options.forEach((opt: any) => {
              const strike = opt.details?.strike_price;
              const oi = opt.open_interest || 0;
              const isCall = opt.details?.contract_type === 'call';
              
              if (isCall && testPrice > strike) {
                totalPain += (testPrice - strike) * oi * 100;
              } else if (!isCall && testPrice < strike) {
                totalPain += (strike - testPrice) * oi * 100;
              }
            });
            
            if (totalPain < minPain) {
              minPain = totalPain;
              maxPain = testPrice;
            }
          }
          
          // Calculate Expected Move from ATM straddle
          const atmStrike = strikes.reduce((prev, curr) => 
            Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
          );
          
          const atmCall = options.find((o: any) => 
            o.details?.strike_price === atmStrike && o.details?.contract_type === 'call'
          );
          const atmPut = options.find((o: any) => 
            o.details?.strike_price === atmStrike && o.details?.contract_type === 'put'
          );
          
          if (atmCall && atmPut) {
            const callMid = atmCall.last_quote?.midpoint || atmCall.day?.close || 0;
            const putMid = atmPut.last_quote?.midpoint || atmPut.day?.close || 0;
            if (callMid > 0 && putMid > 0) {
              expectedMove = (callMid + putMid) * 0.85;
            }
          }
        }
      }
    } catch (err) {
      console.error('[Levels API] Options fetch error:', err);
    }
    
    // Fallback estimates if options data unavailable
    if (!callWall) callWall = Math.round(price * 1.02);
    if (!putWall) putWall = Math.round(price * 0.98);
    if (!gexFlip) gexFlip = Math.round(price);
    if (!maxPain) maxPain = Math.round(price);
    if (!expectedMove) expectedMove = price * 0.015;
    if (!maxGamma) maxGamma = Math.round(price * 1.01);

    // Build response
    const levels = {
      ticker,
      currentPrice: r(price),
      price: r(price), // Keep for backward compatibility
      change: r(change),
      changePercent: r(changePercent),
      
      // Session data
      high: r(high),
      low: r(low),
      open: r(open),
      volume,
      vwap: r(vwap),
      
      // Previous day
      prevClose: r(prevClose),
      prevHigh: r(snapshot.prevDay?.h || high),
      prevLow: r(snapshot.prevDay?.l || low),
      
      // Pivot
      pivot: r(pivot),
      
      // Camarilla Levels (for day trading)
      r1: r(camarilla.r1),
      r2: r(camarilla.r2),
      r3: r(camarilla.r3),
      r4: r(camarilla.r4),
      s1: r(camarilla.s1),
      s2: r(camarilla.s2),
      s3: r(camarilla.s3),
      s4: r(camarilla.s4),
      
      // Gamma levels
      callWall,
      putWall,
      maxGamma,
      gexFlip,
      maxPain,
      expectedMove: r(expectedMove),
      expectedMovePercent: r((expectedMove / price) * 100),
      expiry: expiryStr,
      daysToExpiry: daysUntilFriday,
      
      // Metadata
      range: r(range),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(
      { success: true, data: levels },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: any) {
    console.error('[Levels API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' }, 
      { status: 500 }
    );
  }
}

