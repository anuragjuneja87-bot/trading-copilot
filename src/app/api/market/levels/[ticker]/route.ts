import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Strike filter: only consider strikes within this % of current price
const STRIKE_RANGE_PCT = 0.20; // 20% above/below

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  try {
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
      next: { revalidate: 30 }
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

    const range = high - low;
    const prevRange = snapshot.prevDay?.h && snapshot.prevDay?.l 
      ? snapshot.prevDay.h - snapshot.prevDay.l 
      : range;

    const pivot = (high + low + prevClose) / 3;
    
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

    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    // Get nearest 3 Friday expiries to aggregate options data
    const expiries = getNextExpiries(3);
    
    let callWall: number | null = null;
    let putWall: number | null = null;
    let maxGamma: number | null = null;
    let gexFlip: number | null = null;
    let maxPain: number | null = null;
    let expectedMove: number | null = null;
    
    try {
      // Fetch options for multiple expiries in parallel
      const optionsFetches = expiries.map(expiryStr => 
        fetch(
          `https://api.polygon.io/v3/snapshot/options/${ticker}?expiration_date=${expiryStr}&limit=250&apiKey=${POLYGON_API_KEY}`,
          { next: { revalidate: 60 }, signal: AbortSignal.timeout(10000) }
        ).then(r => r.ok ? r.json() : { results: [] })
         .catch(() => ({ results: [] }))
      );
      
      const optionsResults = await Promise.all(optionsFetches);
      
      // Merge all options from all expiries
      const allOptions: any[] = [];
      optionsResults.forEach(data => {
        if (data.results) {
          allOptions.push(...data.results);
        }
      });
      
      console.log(`[Levels API] ${ticker}: Fetched ${allOptions.length} options across ${expiries.length} expiries`);
      
      if (allOptions.length > 0) {
        // Strike range filter
        const minStrike = price * (1 - STRIKE_RANGE_PCT);
        const maxStrike = price * (1 + STRIKE_RANGE_PCT);
        
        // Build gamma by strike (only strikes near current price)
        const gammaByStrike: Record<number, { 
          callGamma: number; putGamma: number; 
          callOI: number; putOI: number;
          callPremium: number; putPremium: number;
        }> = {};
        
        allOptions.forEach((opt: any) => {
          const strike = opt.details?.strike_price;
          if (!strike) return;
          
          // CRITICAL: Filter strikes to reasonable range around price
          if (strike < minStrike || strike > maxStrike) return;
          
          const gamma = opt.greeks?.gamma || 0;
          const oi = opt.open_interest || 0;
          const isCall = opt.details?.contract_type === 'call';
          const premium = (opt.last_quote?.midpoint || opt.day?.close || 0) * (oi * 100);
          
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
        
        if (strikes.length > 0) {
          // Call Wall: highest call OI above price (resistance)
          let maxCallOI = 0;
          strikes.forEach(strike => {
            if (strike > price && gammaByStrike[strike].callOI > maxCallOI) {
              maxCallOI = gammaByStrike[strike].callOI;
              callWall = strike;
            }
          });
          
          // Put Wall: highest put OI below price (support)
          let maxPutOI = 0;
          strikes.forEach(strike => {
            if (strike < price && gammaByStrike[strike].putOI > maxPutOI) {
              maxPutOI = gammaByStrike[strike].putOI;
              putWall = strike;
            }
          });
          
          // Max Gamma: highest total gamma exposure
          let maxTotalGamma = 0;
          strikes.forEach(strike => {
            const totalGamma = Math.abs(gammaByStrike[strike].callGamma) + Math.abs(gammaByStrike[strike].putGamma);
            if (totalGamma > maxTotalGamma) {
              maxTotalGamma = totalGamma;
              maxGamma = strike;
            }
          });
          
          // GEX Flip: interpolate where net gamma crosses zero
          // Net GEX = callGamma - putGamma (positive = dealer long gamma)
          let prevStrike: number | null = null;
          let prevNetGex: number | null = null;
          for (const strike of strikes) {
            const netGex = gammaByStrike[strike].callGamma - gammaByStrike[strike].putGamma;
            
            if (prevNetGex !== null && prevStrike !== null) {
              // Look for zero crossing (negative to positive)
              if (prevNetGex < 0 && netGex >= 0) {
                // Interpolate the exact crossing point
                const totalRange = Math.abs(prevNetGex) + Math.abs(netGex);
                if (totalRange > 0) {
                  const ratio = Math.abs(prevNetGex) / totalRange;
                  gexFlip = prevStrike + (strike - prevStrike) * ratio;
                  gexFlip = Math.round(gexFlip * 100) / 100;
                } else {
                  gexFlip = strike;
                }
                break;
              }
            }
            prevStrike = strike;
            prevNetGex = netGex;
          }
          
          // Max Pain: strike that minimizes total option holder losses
          // Only use the nearest expiry for max pain
          const nearestExpiryOptions = allOptions.filter(
            (o: any) => o.details?.expiration_date === expiries[0]
          );
          
          let minPain = Infinity;
          for (const testPrice of strikes) {
            let totalPain = 0;
            nearestExpiryOptions.forEach((opt: any) => {
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
          
          // Expected Move from ATM straddle (nearest expiry only)
          const atmStrike = strikes.reduce((prev, curr) => 
            Math.abs(curr - price) < Math.abs(prev - price) ? curr : prev
          );
          const atmCall = nearestExpiryOptions.find((o: any) => 
            o.details?.strike_price === atmStrike && o.details?.contract_type === 'call'
          );
          const atmPut = nearestExpiryOptions.find((o: any) => 
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
        
        console.log(`[Levels API] ${ticker} @ $${price}: callWall=$${callWall}, putWall=$${putWall}, gexFlip=$${gexFlip}, maxPain=$${maxPain}`);
      }
    } catch (err) {
      console.error('[Levels API] Options fetch error:', err);
    }
    
    // Sanity-checked fallbacks
    // If values are more than 30% from price, they're likely garbage — use estimates
    const sanityCheck = (value: number | null, label: string): number | null => {
      if (value === null) return null;
      const pctAway = Math.abs(value - price) / price;
      if (pctAway > 0.30) {
        console.warn(`[Levels API] ${label} ($${value}) is ${(pctAway * 100).toFixed(0)}% from price ($${price}) — discarding`);
        return null;
      }
      return value;
    };
    
    callWall = sanityCheck(callWall, 'Call Wall');
    putWall = sanityCheck(putWall, 'Put Wall');
    gexFlip = sanityCheck(gexFlip, 'GEX Flip');
    maxPain = sanityCheck(maxPain, 'Max Pain');
    
    // Smart fallbacks based on price (only if we got nothing)
    if (!callWall) callWall = Math.round(price * 1.03 * 100) / 100; // 3% above
    if (!putWall) putWall = Math.round(price * 0.97 * 100) / 100;   // 3% below
    if (!gexFlip) gexFlip = Math.round(price * 100) / 100;          // At price
    if (!maxPain) maxPain = Math.round(price * 100) / 100;
    if (!expectedMove) expectedMove = price * 0.02;
    if (!maxGamma) maxGamma = Math.round(price * 100) / 100;

    const levels = {
      ticker,
      currentPrice: r(price),
      price: r(price),
      change: r(change),
      changePercent: r(changePercent),
      
      high: r(high),
      low: r(low),
      open: r(open),
      volume,
      vwap: r(vwap),
      
      prevClose: r(prevClose),
      prevHigh: r(snapshot.prevDay?.h || high),
      prevLow: r(snapshot.prevDay?.l || low),
      
      pivot: r(pivot),
      
      r1: r(camarilla.r1),
      r2: r(camarilla.r2),
      r3: r(camarilla.r3),
      r4: r(camarilla.r4),
      s1: r(camarilla.s1),
      s2: r(camarilla.s2),
      s3: r(camarilla.s3),
      s4: r(camarilla.s4),
      
      callWall,
      putWall,
      maxGamma,
      gexFlip,
      maxPain,
      expectedMove: r(expectedMove),
      expectedMovePercent: r((expectedMove / price) * 100),
      expiry: expiries[0],
      daysToExpiry: getDaysUntilExpiry(expiries[0]),
      
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

// Get next N Friday expiry dates
function getNextExpiries(count: number): string[] {
  const expiries: string[] = [];
  const today = new Date();
  let checkDate = new Date(today);
  
  while (expiries.length < count) {
    const dayOfWeek = checkDate.getDay();
    if (dayOfWeek === 5) { // Friday
      // Only include if it's today or in the future
      if (checkDate >= today || checkDate.toDateString() === today.toDateString()) {
        expiries.push(checkDate.toISOString().split('T')[0]);
      }
    }
    checkDate.setDate(checkDate.getDate() + 1);
  }
  
  return expiries;
}

function getDaysUntilExpiry(expiryStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryStr);
  return Math.ceil((expiry.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
}
