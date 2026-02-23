import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

function getMarketTimeRange(): { fromTs: number; toTs: number; isLive: boolean } {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;
  const isWeekend = day === 0 || day === 6;
  const isMarketOpen = !isWeekend && timeInMinutes >= 570 && timeInMinutes < 960;

  if (isMarketOpen) {
    const marketOpen = new Date(et);
    marketOpen.setHours(9, 30, 0, 0);
    return { fromTs: marketOpen.getTime(), toTs: et.getTime(), isLive: true };
  }

  let checkDate = new Date(et);
  if (!isWeekend && timeInMinutes >= 960) {
    // After hours today — use today's session
  } else {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const marketOpen = new Date(checkDate);
  marketOpen.setHours(9, 30, 0, 0);
  const marketClose = new Date(checkDate);
  marketClose.setHours(16, 0, 0, 0);
  return { fromTs: marketOpen.getTime(), toTs: marketClose.getTime(), isLive: false };
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

      // If market is closed, override to last trading session
      const now = new Date();
      const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const et = new Date(etStr);
      const timeInMinutes = et.getHours() * 60 + et.getMinutes();
      const day = et.getDay();
      const isWeekend = day === 0 || day === 6;
      const isMarketOpen = !isWeekend && timeInMinutes >= 570 && timeInMinutes < 960;

      if (!isMarketOpen) {
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

    // Use date string format for Polygon
    const fromDate = new Date(fromTs).toISOString().split('T')[0];
    const toDate = new Date(toTs).toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_API_KEY}`;

    const res = await fetch(url, {
      next: { revalidate: isLive ? 30 : 300 },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      if (res.status === 403) {
        return NextResponse.json({
          success: true,
          data: { ticker, buckets: [], bucketMinutes: 1, summary: { totalBuy: 0, totalSell: 0 }, note: 'Minute data not available.' },
        });
      }
      throw new Error(`Polygon API error: ${res.status}`);
    }

    const data = await res.json();
    const bars = data.results || [];

    if (bars.length === 0) {
      return NextResponse.json({ success: true, data: { ticker, buckets: [], bucketMinutes: 1, summary: { totalBuy: 0, totalSell: 0 } } });
    }

    // Bucket size
    const bucketParam = searchParams.get('bucketMinutes');
    const rangeMs = toTs - fromTs;
    const rangeMinutes = rangeMs / (60 * 1000);
    const bucketSize = bucketParam ? parseInt(bucketParam, 10)
      : rangeMinutes <= 5 ? 1 : rangeMinutes <= 15 ? 1 : rangeMinutes <= 30 ? 2
      : rangeMinutes <= 60 ? 5 : rangeMinutes <= 240 ? 5 : rangeMinutes <= 480 ? 15 : 60;

    // Filter to regular market hours only (9:30 AM - 4:00 PM ET)
    const filteredBars = bars.filter((bar: any) => {
      const barDate = new Date(bar.t);
      const barET = new Date(barDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const barMinutes = barET.getHours() * 60 + barET.getMinutes();
      return barMinutes >= 570 && barMinutes < 960;
    });

    const buckets: Record<string, { buyVolume: number; sellVolume: number; timeMs: number }> = {};

    filteredBars.forEach((bar: any) => {
      const date = new Date(bar.t);
      const minutes = date.getMinutes();
      date.setMinutes(Math.floor(minutes / bucketSize) * bucketSize, 0, 0);
      if (bucketSize >= 60) {
        date.setHours(Math.floor(date.getHours() / (bucketSize / 60)) * (bucketSize / 60), 0, 0, 0);
      }
      const key = date.toISOString();
      if (!buckets[key]) buckets[key] = { buyVolume: 0, sellVolume: 0, timeMs: date.getTime() };

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
        buyRatio = close > open ? 0.6 : close < open ? 0.4 : 0.5;
      }
      buyRatio = Math.max(0.15, Math.min(0.85, buyRatio));

      buckets[key].buyVolume += volume * buyRatio;
      buckets[key].sellVolume += volume * (1 - buyRatio);
    });

    const result = Object.entries(buckets)
      .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
      .map(([key, value]) => {
        const date = new Date(key);
        const total = value.buyVolume + value.sellVolume;
        return {
          time: date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' }),
          timeMs: value.timeMs,
          buyVolume: Math.round(value.buyVolume),
          sellVolume: Math.round(value.sellVolume),
          totalVolume: Math.round(total),
          pressure: total > 0 ? Math.round(((value.buyVolume - value.sellVolume) / total) * 100) : 0,
        };
      });

    return NextResponse.json({
      success: true,
      data: {
        ticker, buckets: result, bucketMinutes: bucketSize,
        summary: { totalBuy: result.reduce((s, r) => s + r.buyVolume, 0), totalSell: result.reduce((s, r) => s + r.sellVolume, 0) },
      },
    });
  } catch (error: any) {
    console.error('[Volume Pressure API] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}