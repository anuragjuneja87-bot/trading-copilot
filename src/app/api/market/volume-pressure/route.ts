import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    
    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
    }

    // Use provided timeframe range, or default to today's market hours
    let fromTs: number;
    let toTs: number;
    
    if (fromParam && toParam) {
      fromTs = parseInt(fromParam, 10);
      toTs = parseInt(toParam, 10);
    } else {
      // Default: Get today's date range
      const now = new Date();
      const marketOpen = new Date(now);
      marketOpen.setHours(9, 30, 0, 0);
      
      // Use previous trading day if before market open
      if (now < marketOpen) {
        marketOpen.setDate(marketOpen.getDate() - 1);
      }
      
      fromTs = Math.floor(marketOpen.getTime());
      toTs = Math.floor(now.getTime());
    }
    
    // Fetch aggregated trades from Polygon (1-minute bars)
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${fromTs}/${toTs}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_API_KEY}`;
    
    const res = await fetch(url, { next: { revalidate: 60 } });
    
    if (!res.ok) {
      throw new Error(`Polygon API error: ${res.status}`);
    }
    
    const data = await res.json();
    const bars = data.results || [];
    
    // Bucket into 15-minute windows
    const buckets: Record<string, { buyVolume: number; sellVolume: number; timeMs: number }> = {};
    
    bars.forEach((bar: any) => {
      const timestamp = bar.t;
      const date = new Date(timestamp);
      
      // Round to 15-minute bucket
      const minutes = date.getMinutes();
      const bucketMinutes = Math.floor(minutes / 15) * 15;
      date.setMinutes(bucketMinutes, 0, 0);
      
      const bucketKey = date.toISOString();
      
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { 
          buyVolume: 0, 
          sellVolume: 0, 
          timeMs: date.getTime() 
        };
      }
      
      // Estimate buy/sell based on price movement
      // If close > open, assume more buying; if close < open, assume more selling
      const volume = bar.v || 0;
      const priceChange = (bar.c || 0) - (bar.o || 0);
      
      if (priceChange > 0) {
        // Price went up - estimate 60% buy, 40% sell
        buckets[bucketKey].buyVolume += volume * 0.6;
        buckets[bucketKey].sellVolume += volume * 0.4;
      } else if (priceChange < 0) {
        // Price went down - estimate 40% buy, 60% sell
        buckets[bucketKey].buyVolume += volume * 0.4;
        buckets[bucketKey].sellVolume += volume * 0.6;
      } else {
        // No change - split 50/50
        buckets[bucketKey].buyVolume += volume * 0.5;
        buckets[bucketKey].sellVolume += volume * 0.5;
      }
    });
    
    // Convert to array and format
    const result = Object.entries(buckets)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([key, value]) => {
        const date = new Date(key);
        const total = value.buyVolume + value.sellVolume;
        const pressure = total > 0 
          ? Math.round(((value.buyVolume - value.sellVolume) / total) * 100)
          : 0;
        
        return {
          time: date.toLocaleTimeString('en-US', { 
            hour: 'numeric', 
            minute: '2-digit',
            hour12: true 
          }),
          timeMs: value.timeMs,
          buyVolume: Math.round(value.buyVolume),
          sellVolume: Math.round(value.sellVolume),
          totalVolume: Math.round(total),
          pressure,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        buckets: result,
        summary: {
          totalBuy: result.reduce((sum, r) => sum + r.buyVolume, 0),
          totalSell: result.reduce((sum, r) => sum + r.sellVolume, 0),
        },
      },
    });
  } catch (error: any) {
    console.error('[Volume Pressure API] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
