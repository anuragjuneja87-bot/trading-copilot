import { NextRequest, NextResponse } from 'next/server';
import { redisGet, redisSet, isMarketOpen } from '@/lib/redis';
import { validateTicker } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Vercel Pro timeout
export const maxDuration = 30;

// Timeframe → Polygon multiplier/timespan
const TF_MAP: Record<string, { mult: number; span: string; cacheSeconds: number }> = {
  '1m':  { mult: 1,  span: 'minute', cacheSeconds: 15 },
  '5m':  { mult: 5,  span: 'minute', cacheSeconds: 30 },
  '15m': { mult: 15, span: 'minute', cacheSeconds: 60 },
  '1h':  { mult: 1,  span: 'hour',   cacheSeconds: 120 },
  '4h':  { mult: 4,  span: 'hour',   cacheSeconds: 300 },
  '1d':  { mult: 1,  span: 'day',    cacheSeconds: 900 },
};

function getMarketDate(): string {
  const now = new Date();
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;
  const isWeekend = day === 0 || day === 6;

  // If before market open today, use yesterday
  if (!isWeekend && timeInMinutes < 570) {
    et.setDate(et.getDate() - 1);
  }

  // Skip weekends
  let d = new Date(et);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d.toISOString().split('T')[0];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker: rawTicker } = await params;
  const ticker = validateTicker(rawTicker);
  if (!ticker) {
    return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const tf = searchParams.get('tf') || '5m';
  const tfConfig = TF_MAP[tf] || TF_MAP['5m'];

  const dateStr = getMarketDate();
  const cacheKey = `candles:${ticker}:${dateStr}:${tf}`;

  // ── Check Redis cache ──
  const cached = await redisGet<any>(cacheKey);
  if (cached && cached.bars?.length > 0) {
    // If market is open, only use cache if fresh enough
    const age = Date.now() - (cached.cachedAt || 0);
    if (!isMarketOpen() || age < tfConfig.cacheSeconds * 1000) {
      return NextResponse.json({
        ...cached,
        source: 'redis',
        cacheAge: Math.round(age / 1000),
      });
    }
  }

  // ── Fetch from Polygon ──
  if (!POLYGON_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    // For intraday, use today's date. For daily, go back 6 months.
    let fromDate = dateStr;
    let toDate = dateStr;
    if (tf === '1d') {
      const from = new Date(dateStr);
      from.setMonth(from.getMonth() - 6);
      fromDate = from.toISOString().split('T')[0];
    }

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${tfConfig.mult}/${tfConfig.span}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=5000&apiKey=${POLYGON_API_KEY}`;

    const res = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      // Return cached data if available, even if stale
      if (cached) {
        return NextResponse.json({ ...cached, source: 'redis-stale' });
      }
      return NextResponse.json({ error: `Polygon error: ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const rawBars = data.results || [];

    if (rawBars.length === 0 && cached) {
      return NextResponse.json({ ...cached, source: 'redis-fallback' });
    }

    // Filter to regular hours for intraday (9:30 AM - 4:00 PM ET)
    const bars = tf === '1d' ? rawBars : rawBars.filter((bar: any) => {
      const barDate = new Date(bar.t);
      const barET = new Date(barDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const barMinutes = barET.getHours() * 60 + barET.getMinutes();
      return barMinutes >= 570 && barMinutes < 960;
    });

    // Compute VWAP from bars
    let cumVol = 0, cumPV = 0;
    const processedBars = bars.map((bar: any) => {
      const typical = (bar.h + bar.l + bar.c) / 3;
      cumVol += bar.v;
      cumPV += typical * bar.v;
      const vwap = cumVol > 0 ? cumPV / cumVol : bar.c;

      return {
        t: bar.t,       // timestamp
        o: bar.o,       // open
        h: bar.h,       // high
        l: bar.l,       // low
        c: bar.c,       // close
        v: bar.v,       // volume
        vw: Math.round(vwap * 100) / 100, // computed VWAP
      };
    });

    const result = {
      ticker,
      date: dateStr,
      tf,
      bars: processedBars,
      count: processedBars.length,
      cachedAt: Date.now(),
    };

    // Cache in Redis
    await redisSet(cacheKey, result, tfConfig.cacheSeconds * 3);

    return NextResponse.json({ ...result, source: 'polygon' });
  } catch (err: any) {
    if (cached) {
      return NextResponse.json({ ...cached, source: 'redis-error-fallback' });
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
