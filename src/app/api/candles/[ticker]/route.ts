import { NextRequest, NextResponse } from 'next/server';
import { redisGet, redisSet, isMarketOpen } from '@/lib/redis';
import { validateTicker } from '@/lib/security';
import { computeBarPressure, pressureToColor } from '@/lib/candle-pressure';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
export const maxDuration = 30;

// Timeframe config: Polygon params + how far back to fetch
const TF_MAP: Record<string, { mult: number; span: string; daysBack: number; cache: number }> = {
  '1m':  { mult: 1,  span: 'minute', daysBack: 1,    cache: 15 },
  '5m':  { mult: 5,  span: 'minute', daysBack: 1,    cache: 30 },
  '15m': { mult: 15, span: 'minute', daysBack: 5,    cache: 45 },
  '30m': { mult: 30, span: 'minute', daysBack: 10,   cache: 60 },
  '1h':  { mult: 1,  span: 'hour',   daysBack: 20,   cache: 120 },
  '4h':  { mult: 4,  span: 'hour',   daysBack: 60,   cache: 300 },
  '1d':  { mult: 1,  span: 'day',    daysBack: 365,  cache: 900 },
  '1w':  { mult: 1,  span: 'week',   daysBack: 730,  cache: 3600 },
};

function getTodayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function subtractDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00Z');
  d.setDate(d.getDate() - days);
  return d.toISOString().split('T')[0];
}

/** Classify a bar's session from its timestamp */
function getBarSession(timestampMs: number): 'pre' | 'rth' | 'post' {
  const d = new Date(timestampMs);
  const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const mins = et.getHours() * 60 + et.getMinutes();
  
  if (mins >= 570 && mins < 960) return 'rth';   // 9:30 - 16:00
  if (mins >= 240 && mins < 570) return 'pre';    // 4:00 - 9:30
  if (mins >= 960 && mins < 1200) return 'post';  // 16:00 - 20:00
  return 'pre'; // overnight → treat as pre
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
  const tfCfg = TF_MAP[tf] || TF_MAP['5m'];

  const today = getTodayET();
  const fromDate = subtractDays(today, tfCfg.daysBack);
  const toDate = today;
  const cacheKey = `candles:${ticker}:${today}:${tf}:v2`; // v2 cache key — includes extended hours

  // ── Redis cache check ──
  const cached = await redisGet<any>(cacheKey);
  if (cached?.bars?.length > 0) {
    const age = Date.now() - (cached.cachedAt || 0);
    if (!isMarketOpen() || age < tfCfg.cache * 1000) {
      return NextResponse.json({ ...cached, source: 'redis', cacheAge: Math.round(age / 1000) });
    }
  }

  if (!POLYGON_API_KEY) {
    return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
  }

  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${tfCfg.mult}/${tfCfg.span}/${fromDate}/${toDate}?adjusted=true&sort=asc&limit=50000&apiKey=${POLYGON_API_KEY}`;

    const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });

    if (!res.ok) {
      if (cached) return NextResponse.json({ ...cached, source: 'redis-stale' });
      return NextResponse.json({ error: `Polygon ${res.status}` }, { status: 502 });
    }

    const data = await res.json();
    const rawBars = data.results || [];
    if (rawBars.length === 0 && cached) {
      return NextResponse.json({ ...cached, source: 'redis-fallback' });
    }

    // For intraday: include pre-market (4:00-9:30) + regular (9:30-16:00) + after-hours (16:00-20:00)
    // Filter out overnight bars (20:00-4:00)
    const isIntraday = ['1m', '5m', '15m', '30m', '1h', '4h'].includes(tf);
    const bars = isIntraday ? rawBars.filter((bar: any) => {
      const d = new Date(bar.t);
      const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const et = new Date(etStr);
      const mins = et.getHours() * 60 + et.getMinutes();
      // Include 4:00 AM - 8:00 PM ET (pre-market + regular + after-hours)
      return mins >= 240 && mins < 1200;
    }) : rawBars;

    // Compute running VWAP (resets daily for intraday, only from RTH bars)
    let cumVol = 0, cumPV = 0, lastDay = '';
    const processed = bars.map((bar: any, i: number) => {
      const session = isIntraday ? getBarSession(bar.t) : 'rth';
      
      // Reset VWAP at day boundary for intraday
      if (isIntraday) {
        const dayStr = new Date(bar.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (dayStr !== lastDay) { cumVol = 0; cumPV = 0; lastDay = dayStr; }
      }
      
      // Only accumulate VWAP from RTH bars (pre/post volume shouldn't distort VWAP)
      const typical = (bar.h + bar.l + bar.c) / 3;
      if (session === 'rth') {
        cumVol += bar.v;
        cumPV += typical * bar.v;
      }
      const vwap = cumVol > 0 ? cumPV / cumVol : bar.c;
      
      const { bp, brp } = computeBarPressure({ bar, i, bars, vwap });
      
      return {
        t: Math.floor(bar.t / 1000),
        o: bar.o, h: bar.h, l: bar.l, c: bar.c,
        v: bar.v,
        vw: Math.round(vwap * 100) / 100,
        bp, brp,
        s: session, // 'pre' | 'rth' | 'post'
      };
    });

    // Ensure strictly ascending time: dedupe by t, keep last bar per time
    type BarItem = (typeof processed)[number];
    const seen = new Map<number, BarItem>();
    for (const b of processed) {
      seen.set(b.t, b);
    }
    const deduped: BarItem[] = Array.from(seen.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, b]) => b);

    const result = { ticker, tf, bars: deduped, count: deduped.length, cachedAt: Date.now() };
    await redisSet(cacheKey, result, tfCfg.cache * 3);

    return NextResponse.json({ ...result, source: 'polygon' });
  } catch (err: any) {
    if (cached) return NextResponse.json({ ...cached, source: 'redis-error-fallback' });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
