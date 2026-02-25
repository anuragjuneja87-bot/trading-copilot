import { NextRequest, NextResponse } from 'next/server';
import { validateTicker, validateTickers, validateInt } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Extended hours: 4:00 AM - 8:00 PM ET
const PRE_MARKET_START = 240;  // 4:00 AM
const RTH_START = 570;         // 9:30 AM
const RTH_END = 960;           // 4:00 PM
const AFTER_HOURS_END = 1200;  // 8:00 PM

function getMarketTimeRange(): { fromTs: number; toTs: number; isLive: boolean } {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;
  const isWeekend = day === 0 || day === 6;
  const isMarketOpen = !isWeekend && timeInMinutes >= PRE_MARKET_START && timeInMinutes < AFTER_HOURS_END;

  if (isMarketOpen) {
    const sessionStart = new Date(et);
    sessionStart.setHours(4, 0, 0, 0);
    return { fromTs: sessionStart.getTime(), toTs: et.getTime(), isLive: true };
  }

  let checkDate = new Date(et);
  if (!isWeekend && timeInMinutes >= AFTER_HOURS_END) {
    // Past 8 PM — use today's full session
  } else {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
    checkDate.setDate(checkDate.getDate() - 1);
  }

  const sessionStart = new Date(checkDate);
  sessionStart.setHours(4, 0, 0, 0);
  const sessionEnd = new Date(checkDate);
  sessionEnd.setHours(20, 0, 0, 0);
  return { fromTs: sessionStart.getTime(), toTs: sessionEnd.getTime(), isLive: false };
}

function getSessionType(barMinutes: number): 'pre' | 'rth' | 'post' {
  if (barMinutes < RTH_START) return 'pre';
  if (barMinutes >= RTH_END) return 'post';
  return 'rth';
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = validateTicker(searchParams.get('ticker'));
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

      const now = new Date();
      const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const et = new Date(etStr);
      const timeInMinutes = et.getHours() * 60 + et.getMinutes();
      const day = et.getDay();
      const isWeekend = day === 0 || day === 6;
      const isActive = !isWeekend && timeInMinutes >= PRE_MARKET_START && timeInMinutes < AFTER_HOURS_END;

      if (!isActive) {
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

    const fromDate = new Date(fromTs).toISOString().split('T')[0];
    const toDate = new Date(toTs).toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/minute/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;

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

    // ★ Filter to extended hours (4:00 AM - 8:00 PM ET)
    const filteredBars = bars.filter((bar: any) => {
      const barDate = new Date(bar.t);
      const barET = new Date(barDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const barMinutes = barET.getHours() * 60 + barET.getMinutes();
      return barMinutes >= PRE_MARKET_START && barMinutes < AFTER_HOURS_END;
    });

    const bucketParam = searchParams.get('bucketMinutes');
    const bucketSize = bucketParam ? parseInt(bucketParam, 10)
      : filteredBars.length <= 960 ? 1 : 5;

    const buckets: Record<string, { buyVolume: number; sellVolume: number; timeMs: number; session: 'pre' | 'rth' | 'post' }> = {};

    filteredBars.forEach((bar: any) => {
      const date = new Date(bar.t);
      const barET = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const barMinutes = barET.getHours() * 60 + barET.getMinutes();
      const session = getSessionType(barMinutes);

      const minutes = date.getMinutes();
      date.setMinutes(Math.floor(minutes / bucketSize) * bucketSize, 0, 0);
      if (bucketSize >= 60) {
        date.setHours(Math.floor(date.getHours() / (bucketSize / 60)) * (bucketSize / 60), 0, 0, 0);
      }
      const key = date.toISOString();
      if (!buckets[key]) buckets[key] = { buyVolume: 0, sellVolume: 0, timeMs: date.getTime(), session };

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
          session: value.session,
        };
      });

    // ★ Find indices for session boundaries (for chart markers)
    let rthOpenIdx = -1;
    let rthCloseIdx = -1;
    result.forEach((b, i) => {
      if (b.session === 'rth' && rthOpenIdx === -1) rthOpenIdx = i;
      if (b.session === 'post' && rthCloseIdx === -1) rthCloseIdx = i;
    });

    return NextResponse.json({
      success: true,
      data: {
        ticker, buckets: result, bucketMinutes: bucketSize,
        summary: { totalBuy: result.reduce((s, r) => s + r.buyVolume, 0), totalSell: result.reduce((s, r) => s + r.sellVolume, 0) },
        sessionBoundaries: { rthOpenIdx, rthCloseIdx },
      },
    });
  } catch (error: any) {
    console.error('[Volume Pressure API] Error:', error);
    return NextResponse.json({ success: false, error: "An error occurred" }, { status: 500 });
  }
}
