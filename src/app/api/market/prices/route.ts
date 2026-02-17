import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');

    if (!tickersParam) {
      return NextResponse.json(
        { success: false, error: 'tickers parameter required' },
        { status: 400 }
      );
    }

    if (!POLYGON_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'API key not configured' },
        { status: 500 }
      );
    }

    const tickers = tickersParam
      .split(',')
      .map(t => t.trim().toUpperCase())
      .filter(Boolean);
    
    if (tickers.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    if (tickers.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Maximum 20 tickers per request' },
        { status: 400 }
      );
    }

    // Check if market is open to adjust cache strategy
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = etTime.getHours();
    const minute = etTime.getMinutes();
    const dayOfWeek = etTime.getDay();
    const timeInMinutes = hour * 60 + minute;
    const isMarketOpen = dayOfWeek >= 1 && dayOfWeek <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;
    
    // Shorter cache during market hours, longer when closed
    const revalidateTime = isMarketOpen ? 5 : 60;

    // Use Polygon batch snapshot endpoint
    const url = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_API_KEY}`;
    
    const response = await fetch(url, {
      next: { revalidate: revalidateTime },
    });

    if (!response.ok) {
      console.error('[Market Prices API] Polygon error:', response.status);
      throw new Error(`Polygon API error: ${response.status}`);
    }

    const data = await response.json();
    const tickerSnapshots = data.tickers || [];

    const prices = tickerSnapshots.map((t: any) => {
      // Extract price from various possible sources
      const lastTradePrice = parseFloat(t.lastTrade?.p) || 0;
      const dayClose = parseFloat(t.day?.c) || 0;
      const prevDayClose = parseFloat(t.prevDay?.c) || 0;
      const dayOpen = parseFloat(t.day?.o) || 0;
      const prevDayOpen = parseFloat(t.prevDay?.o) || 0;
      
      // Use the first non-zero price found
      let price = lastTradePrice || dayClose || prevDayClose;
      
      // Get change values
      let change = parseFloat(t.todaysChange) || 0;
      let changePercent = parseFloat(t.todaysChangePerc) || 0;
      
      // WEEKEND FIX: If change is 0 but we have day data, calculate from that
      if (change === 0 && dayClose > 0 && dayOpen > 0) {
        change = dayClose - dayOpen; // Day's change (close - open)
        changePercent = (change / dayOpen) * 100;
      }
      
      // If still 0 but we have prevDay data, calculate from that (Friday's change)
      if (change === 0 && prevDayClose > 0 && prevDayOpen > 0) {
        change = prevDayClose - prevDayOpen;
        changePercent = (change / prevDayOpen) * 100;
      }
      
      // If still 0 but we have prevDay close, use that as the change reference
      if (change === 0 && prevDayClose > 0 && dayClose > 0) {
        change = dayClose - prevDayClose;
        changePercent = (change / prevDayClose) * 100;
      }
      
      // CRITICAL FIX: If price is still 0 but we have prevClose and change, calculate it
      if (price === 0 && prevDayClose > 0 && change !== 0) {
        price = prevDayClose + change;
      }
      
      // If still 0, try calculating from prevClose and changePercent
      if (price === 0 && prevDayClose > 0 && changePercent !== 0) {
        price = prevDayClose * (1 + changePercent / 100);
      }
      
      // Last resort: use prevClose as current price (market closed)
      if (price === 0 && prevDayClose > 0) {
        price = prevDayClose;
      }

      return {
        ticker: t.ticker,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        volume: parseInt(t.day?.v) || 0,
        bid: parseFloat(t.lastQuote?.p) || null,
        ask: parseFloat(t.lastQuote?.P) || null,
        high: parseFloat(t.day?.h) || parseFloat(t.prevDay?.h) || null,
        low: parseFloat(t.day?.l) || parseFloat(t.prevDay?.l) || null,
        open: parseFloat(t.day?.o) || parseFloat(t.prevDay?.o) || null,
        prevClose: prevDayClose || null,
        vwap: parseFloat(t.day?.vw) || 0,
        timestamp: t.lastTrade?.t 
          ? new Date(t.lastTrade.t / 1000000).toISOString() 
          : new Date().toISOString(),
      };
    });

    const nextResponse = NextResponse.json(
      { 
        success: true, 
        data: prices,  // Direct array, not nested under "prices"
        timestamp: new Date().toISOString() 
      },
      {
        headers: {
          'Cache-Control': isMarketOpen 
            ? 'public, s-maxage=5, stale-while-revalidate=10'
            : 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );

    return nextResponse;

  } catch (error: any) {
    console.error('[Market Prices API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch prices' },
      { status: 500 }
    );
  }
}
