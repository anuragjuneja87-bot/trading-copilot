import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Market hours in ET
function getMarketTimeRange(): { fromTs: number; toTs: number; isLive: boolean } {
  const now = new Date();
  // Convert to ET
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;
  
  const isWeekend = day === 0 || day === 6;
  const isMarketOpen = !isWeekend && timeInMinutes >= 570 && timeInMinutes < 960; // 9:30 AM - 4:00 PM ET
  
  if (isMarketOpen) {
    // Market is open — use today from market open to now
    const marketOpen = new Date(et);
    marketOpen.setHours(9, 30, 0, 0);
    return {
      fromTs: marketOpen.getTime(),
      toTs: et.getTime(),
      isLive: true,
    };
  }
  
  // Market is closed — find last trading day
  let checkDate = new Date(et);
  
  // If after hours today (past 4 PM on weekday), use today
  if (!isWeekend && timeInMinutes >= 960) {
    // After hours — use today's full session
  } else {
    // Before open or weekend — go back
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  // Skip weekends
  while (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  
  const marketOpen = new Date(checkDate);
  marketOpen.setHours(9, 30, 0, 0);
  const marketClose = new Date(checkDate);
  marketClose.setHours(16, 0, 0, 0);
  
  return {
    fromTs: marketOpen.getTime(),
    toTs: marketClose.getTime(),
    isLive: false,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker')?.toUpperCase();
    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    
    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
    }

    let fromTs: number;
    let toTs: number;
    let isLive = true;
    
    if (fromParam && toParam) {
      fromTs = parseInt(fromParam, 10);
      toTs = parseInt(toParam, 10);
      
      // Sanity check: if the requested range is in after-hours/future, 
      // fall back to last trading session
      const now = new Date();
      const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const et = new Date(etStr);
      const hour = et.getHours();
      const minute = et.getMinutes();
      const day = et.getDay();
      const timeInMinutes = hour * 60 + minute;
      const isWeekend = day === 0 || day === 6;
      const isMarketOpen = !isWeekend && timeInMinutes >= 570 && timeInMinutes < 960;
      
      if (!isMarketOpen) {
        // Market is closed — override with last trading session
        const fallback = getMarketTimeRange();
        fromTs = fallback.fromTs;
        toTs = fallback.toTs;
        isLive = false;
      }
    } else {
      const marketRange = getMarketTimeRange();
      fromTs = marketRange.fromTs;
      toTs = marketRange.toTs;
      isLive = marketRange.isLive;
    }
    
    // Use date string format for Polygon (more reliable than timestamps)
    const fromDate = new Date(fromTs).toISOString().split('T')[0];
    const toDate = new Date(toTs).toISOString().split('T')[0];
    
    // Fetch aggregated trades from Polygon (1-minute bars)
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_API_KEY}`;
    
    const res = await fetch(url, { 
      next: { revalidate: isLive ? 30 : 300 }, // Cache longer when market closed
      signal: AbortSignal.timeout(10000),
    });
    
    if (!res.ok) {
      // If 403, try with daily bars as fallback
      if (res.status === 403) {
        console.warn(`[Volume Pressure] 403 for minute bars, trying daily fallback for ${ticker}`);
        return NextResponse.json({
          success: true,
          data: {
            ticker,
            buckets: [],
            bucketMinutes: 1,
            summary: { totalBuy: 0, totalSell: 0 },
            note: 'Minute-level data not available. Market may be closed.',
          },
        });
      }
      throw new Error(`Polygon API error: ${res.status}`);
    }
    
    const data = await res.json();
    const bars = data.results || [];
    
    if (bars.length === 0) {
      return NextResponse.json({
        success: true,
        data: {
          ticker,
          buckets: [],
          bucketMinutes: 1,
          summary: { totalBuy: 0, totalSell: 0 },
        },
      });
    }
    
    // Determine bucket size from param or auto-calculate from time range
    const bucketParam = searchParams.get('bucketMinutes');
    const rangeMs = toTs - fromTs;
    const rangeMinutes = rangeMs / (60 * 1000);
    const bucketSize = bucketParam 
      ? parseInt(bucketParam, 10)
      : rangeMinutes <= 5 ? 1
      : rangeMinutes <= 15 ? 1
      : rangeMinutes <= 30 ? 2
      : rangeMinutes <= 60 ? 5
      : rangeMinutes <= 240 ? 5
      : rangeMinutes <= 480 ? 15
      : 60;
    
    // Bucket into windows
    const buckets: Record<string, { buyVolume: number; sellVolume: number; timeMs: number }> = {};
    
    // Filter bars to only include regular market hours (9:30 AM - 4:00 PM ET)
    const filteredBars = bars.filter((bar: any) => {
      const barDate = new Date(bar.t);
      const barET = new Date(barDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const barMinutes = barET.getHours() * 60 + barET.getMinutes();
      return barMinutes >= 570 && barMinutes < 960; // 9:30 AM - 4:00 PM
    });
    
    filteredBars.forEach((bar: any) => {
      const timestamp = bar.t;
      const date = new Date(timestamp);
      
      // Round to bucket size
      const minutes = date.getMinutes();
      const bucketMinutes = Math.floor(minutes / bucketSize) * bucketSize;
      date.setMinutes(bucketMinutes, 0, 0);
      
      if (bucketSize >= 60) {
        const hours = date.getHours();
        const bucketHours = Math.floor(hours / (bucketSize / 60)) * (bucketSize / 60);
        date.setHours(bucketHours, 0, 0, 0);
      }
      
      const bucketKey = date.toISOString();
      
      if (!buckets[bucketKey]) {
        buckets[bucketKey] = { 
          buyVolume: 0, 
          sellVolume: 0, 
          timeMs: date.getTime() 
        };
      }
      
      // Buy/sell estimation: close position within high-low range
      const volume = bar.v || 0;
      const high = bar.h || 0;
      const low = bar.l || 0;
      const close = bar.c || 0;
      const barRange = high - low;
      
      let buyRatio: number;
      
      if (barRange > 0) {
        buyRatio = (close - low) / barRange;
      } else {
        const open = bar.o || 0;
        if (close > open) buyRatio = 0.6;
        else if (close < open) buyRatio = 0.4;
        else buyRatio = 0.5;
      }
      
      buyRatio = Math.max(0.15, Math.min(0.85, buyRatio));
      
      buckets[bucketKey].buyVolume += volume * buyRatio;
      buckets[bucketKey].sellVolume += volume * (1 - buyRatio);
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
        bucketMinutes: bucketSize,
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