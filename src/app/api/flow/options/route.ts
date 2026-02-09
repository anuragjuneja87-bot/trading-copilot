import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Validate API key
if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
  console.warn('POLYGON_API_KEY is not configured properly');
}

// Default tickers to monitor for flow
const DEFAULT_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'MSFT', 'AMZN', 'GOOGL'];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const minPremium = parseInt(searchParams.get('minPremium') || '10000');
    const callPut = searchParams.get('callPut') || 'all';
    const unusual = searchParams.get('unusual') === 'true';
    const sweeps = searchParams.get('sweeps') === 'true';
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);

    const tickers = tickersParam 
      ? tickersParam.split(',').map(t => t.trim().toUpperCase())
      : DEFAULT_TICKERS;

    // Fetch options data from Polygon
    // Note: This is a simplified version. In production, you'd query your
    // options_flow Delta table that's populated by streaming job
    const flowData: any[] = [];

    for (const ticker of tickers.slice(0, 5)) { // Limit API calls
      try {
        const url = `https://api.polygon.io/v3/snapshot/options/${ticker}?limit=30&order=desc&sort=volume&apiKey=${POLYGON_API_KEY}`;
        
        const response = await fetch(url, {
          next: { revalidate: 30 }, // Cache for 30 seconds
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) continue;

        const data = await response.json();
        const results = data.results || [];

        for (const item of results) {
          const details = item.details || {};
          const day = item.day || {};
          const greeks = item.greeks || {};
          
          const volume = parseInt(day.volume) || 0;
          const lastPrice = parseFloat(day.close || day.last_trade_price) || 0;
          const premium = lastPrice * volume * 100;
          const oi = parseInt(item.open_interest) || 0;
          const spotPrice = parseFloat(item.underlying_asset?.price) || 0;
          const strike = parseFloat(details.strike_price) || 0;
          const contractType = (details.contract_type || '')[0]?.toUpperCase() || '?';
          
          // Calculate OTM percent
          let otmPercent = 0;
          if (spotPrice > 0 && strike > 0) {
            if (contractType === 'C') {
              otmPercent = ((strike - spotPrice) / spotPrice) * 100;
            } else {
              otmPercent = ((spotPrice - strike) / spotPrice) * 100;
            }
          }

          // Determine if unusual
          const isUnusual = 
            premium >= 100000 || 
            volume >= 500 || 
            (oi > 0 && volume > oi * 0.5) ||
            Math.abs(otmPercent) > 10;

          // Determine trade type
          let side: 'BUY' | 'SWEEP' | 'BLOCK' = 'BUY';
          if (volume > 1000 && premium > 500000) side = 'BLOCK';
          else if (volume > 500 && premium > 100000) side = 'SWEEP';

          const isSweep = side === 'SWEEP' || side === 'BLOCK';
          const isGolden = premium > 1000000 && isSweep;

          // Apply filters
          if (premium < minPremium) continue;
          if (callPut !== 'all' && contractType !== callPut.toUpperCase()) continue;
          if (unusual && !isUnusual) continue;
          if (sweeps && !isSweep) continue;

          flowData.push({
            id: `${ticker}-${details.ticker || Date.now()}`,
            ticker,
            strike,
            expiry: details.expiration_date || '',
            callPut: contractType as 'C' | 'P',
            side,
            size: volume,
            premium: Math.round(premium),
            spotPrice,
            iv: greeks.implied_volatility ? parseFloat(greeks.implied_volatility) : null,
            oi,
            otmPercent: Math.round(otmPercent * 10) / 10,
            heatScore: calculateHeatScore(premium, volume, oi, isUnusual, isSweep),
            isUnusual,
            isSweep,
            isGolden,
            timestamp: new Date().toISOString(),
          });
        }
      } catch (err: any) {
        console.error(`Error fetching flow for ${ticker}:`, err);
        // Continue to next ticker if one fails
        if (err.name === 'AbortError' || err.code === 'UND_ERR_CONNECT_TIMEOUT') {
          console.warn(`Timeout fetching ${ticker} - skipping`);
        }
      }
    }

    // Sort by premium and limit
    flowData.sort((a, b) => b.premium - a.premium);
    const limitedFlow = flowData.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: { 
        flow: limitedFlow,
        meta: {
          total: flowData.length,
          returned: limitedFlow.length,
          tickers: tickers.slice(0, 5),
        }
      },
      meta: {
        timestamp: new Date().toISOString(),
        cached: false,
      },
    });
    
  } catch (error: any) {
    console.error('Flow API error:', error);
    
    // Return partial data if we have some results
    if (flowData.length > 0) {
      return NextResponse.json({
        success: true,
        data: { 
          flow: flowData,
          meta: {
            total: flowData.length,
            returned: flowData.length,
            tickers: tickers.slice(0, 5),
            warning: 'Some tickers failed to load',
          }
        },
        meta: {
          timestamp: new Date().toISOString(),
          cached: false,
        },
      });
    }
    
    return NextResponse.json(
      { 
        success: false, 
        error: error.message || 'Failed to fetch options flow data',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}

// Calculate a "heat score" 1-10 indicating trade conviction
function calculateHeatScore(
  premium: number,
  volume: number,
  oi: number,
  isUnusual: boolean,
  isSweep: boolean
): number {
  let score = 5;
  
  // Premium size
  if (premium > 1000000) score += 2;
  else if (premium > 500000) score += 1.5;
  else if (premium > 100000) score += 1;
  
  // Volume relative to OI
  if (oi > 0) {
    const volOiRatio = volume / oi;
    if (volOiRatio > 1) score += 1.5;
    else if (volOiRatio > 0.5) score += 1;
  }
  
  // Unusual activity
  if (isUnusual) score += 1;
  
  // Sweep/Block
  if (isSweep) score += 1;
  
  return Math.min(10, Math.max(1, Math.round(score)));
}
