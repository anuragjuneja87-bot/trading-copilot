import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    
    if (!tickersParam) {
      return NextResponse.json(
        { success: false, error: 'Tickers parameter required' },
        { status: 400 }
      );
    }

    const tickers = tickersParam.split(',').map(t => t.trim().toUpperCase());
    
    if (tickers.length === 0 || tickers.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Provide 1-20 tickers' },
        { status: 400 }
      );
    }

    // Fetch from Polygon snapshot API
    const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_API_KEY}`;
    
    const response = await fetch(url, {
      next: { revalidate: 5 }, // Cache for 5 seconds
    });

    if (!response.ok) {
      console.error('Polygon API error:', response.status);
      return NextResponse.json(
        { success: false, error: 'Failed to fetch prices' },
        { status: 500 }
      );
    }

    const data = await response.json();
    
    // Transform to our format
    const prices = (data.tickers || []).map((item: any) => {
      const lastTrade = item.lastTrade || {};
      const lastQuote = item.lastQuote || {};
      const day = item.day || {};
      const prevDay = item.prevDay || {};
      
      return {
        ticker: item.ticker,
        price: parseFloat(lastTrade.p) || 0,
        change: parseFloat(item.todaysChange) || 0,
        changePercent: parseFloat(item.todaysChangePerc) || 0,
        volume: parseInt(day.v) || 0,
        bid: parseFloat(lastQuote.p) || null,
        ask: parseFloat(lastQuote.P) || null,
        high: parseFloat(day.h) || null,
        low: parseFloat(day.l) || null,
        prevClose: parseFloat(prevDay.c) || null,
        updatedAt: new Date().toISOString(),
      };
    });

    const nextResponse = NextResponse.json({
      success: true,
      data: { prices },
      meta: {
        timestamp: new Date().toISOString(),
        cached: false,
      },
    });
    
    // Cache for 5 seconds, stale-while-revalidate for 10s
    nextResponse.headers.set(
      'Cache-Control',
      'public, s-maxage=5, stale-while-revalidate=10'
    );
    
    return nextResponse;
    
  } catch (error) {
    console.error('Prices API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
