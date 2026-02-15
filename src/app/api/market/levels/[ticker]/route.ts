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

    // Build response
    const levels = {
      ticker,
      price: r(price),
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

