import { NextRequest, NextResponse } from 'next/server';
import { redisGet, redisSet, isMarketOpen } from '@/lib/redis';
import { validateTicker } from '@/lib/security';

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
  const cacheKey = `candles:${ticker}:${today}:${tf}`;

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

    // For intraday (< 1d), filter to regular hours 9:30-16:00 ET
    const isIntraday = ['1m', '5m', '15m', '30m', '1h', '4h'].includes(tf);
    const bars = isIntraday ? rawBars.filter((bar: any) => {
      const d = new Date(bar.t);
      const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
      const et = new Date(etStr);
      const mins = et.getHours() * 60 + et.getMinutes();
      return mins >= 570 && mins < 960; // 9:30 - 16:00
    }) : rawBars;

    // Compute running VWAP (resets daily for intraday)
    let cumVol = 0, cumPV = 0, lastDay = '';
    const processed = bars.map((bar: any) => {
      // Reset VWAP at day boundary for intraday
      if (isIntraday) {
        const dayStr = new Date(bar.t).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        if (dayStr !== lastDay) { cumVol = 0; cumPV = 0; lastDay = dayStr; }
      }
      const typical = (bar.h + bar.l + bar.c) / 3;
      cumVol += bar.v;
      cumPV += typical * bar.v;

      return {
        t: Math.floor(bar.t / 1000), // seconds (lightweight-charts uses seconds)
        o: bar.o, h: bar.h, l: bar.l, c: bar.c,
        v: bar.v,
        vw: cumVol > 0 ? Math.round((cumPV / cumVol) * 100) / 100 : bar.c,
      };
    });

    const result = { ticker, tf, bars: processed, count: processed.length, cachedAt: Date.now() };
    await redisSet(cacheKey, result, tfCfg.cache * 3);

    return NextResponse.json({ ...result, source: 'polygon' });
  } catch (err: any) {
    if (cached) return NextResponse.json({ ...cached, source: 'redis-error-fallback' });
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
