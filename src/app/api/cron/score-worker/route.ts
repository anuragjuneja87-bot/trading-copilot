import { NextRequest, NextResponse } from 'next/server';
import { computeBiasScore, type BiasInputs } from '@/lib/bias-score';
import {
  hasRedis, redisGet, redisSet, redisLpush, redisExpire,
  getTodayET, timelineKey, thesisKey, isMarketOpen,
} from '@/lib/redis';

/* ──────────────────────────────────────────────────────────
   CRON WORKER — Server-side bias score computation
   
   Vercel Cron calls this every 60 seconds during market hours.
   Fetches raw data → computes weighted bias → stores in Redis.
   
   This runs INDEPENDENTLY of any browser session, so the
   timeline has continuous data even when nobody has the page open.
   
   Also stores thesis snapshots for analytics/model retraining.
   ────────────────────────────────────────────────────────── */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const APP_URL = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

// Tickers to track continuously
const TRACKED_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'META', 'AMD', 'MSFT'];

// Compact timeline point format (matches timeline API)
interface TimelinePoint {
  t: number;    // timestamp
  s: number;    // score 0-100
  d: number;    // direction: 0=BEAR, 1=NEUTRAL, 2=BULL
  bc: number;   // bull count
  brc: number;  // bear count
}

// Thesis snapshot for analytics/retraining
interface ThesisSnapshot {
  ts: number;               // timestamp
  ticker: string;
  price: number;
  score: number;
  direction: string;
  components: Array<{ name: string; score: number; weight: number; rawValue: string }>;
  inputs: BiasInputs;       // Raw inputs for model retraining
  // Market context
  vwap?: number;
  callWall?: number;
  putWall?: number;
  gexFlip?: number;
}

const DIR_MAP: Record<string, number> = { BEARISH: 0, NEUTRAL: 1, BULLISH: 2 };
const TTL_SECONDS = 24 * 60 * 60;
const MAX_POINTS = 3000;
const MIN_INTERVAL_MS = 30000; // 30s between points

// ── Verify cron secret ──────────────────────────────────

function verifyCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true; // No secret configured = allow (dev mode)
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${cronSecret}`;
}

// ── Data fetchers (direct Polygon API) ──────────────────

async function fetchSnapshot(ticker: string): Promise<{
  price: number;
  changePercent: number;
  todaysChange: number;
} | null> {
  if (!POLYGON_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`,
      { cache: 'no-store' }
    );
    const data = await res.json();
    const t = data.ticker;
    if (!t) return null;
    return {
      price: t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0,
      changePercent: t.todaysChangePerc || 0,
      todaysChange: t.todaysChange || 0,
    };
  } catch { return null; }
}

async function fetchFlowStats(ticker: string): Promise<{
  callRatio: number;
  sweepRatio: number;
  netDelta: number;
  tradeCount: number;
} | null> {
  try {
    const res = await fetch(`${APP_URL}/api/flow/options?tickers=${ticker}&limit=300`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const stats = data.stats;
    if (!stats) return null;
    return {
      callRatio: stats.callRatio ?? 50,
      sweepRatio: stats.sweepRatio ?? 0,
      netDelta: stats.netDeltaAdjustedFlow ?? 0,
      tradeCount: stats.tradeCount ?? 0,
    };
  } catch { return null; }
}

async function fetchDarkPool(ticker: string): Promise<{
  bullishPct: number;
  printCount: number;
} | null> {
  try {
    const res = await fetch(`${APP_URL}/api/darkpool?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const stats = data.stats;
    if (!stats) return null;
    return {
      bullishPct: stats.bullishPct ?? 50,
      printCount: stats.printCount ?? 0,
    };
  } catch { return null; }
}

async function fetchVolumePressure(ticker: string): Promise<number | undefined> {
  try {
    const res = await fetch(`${APP_URL}/api/market/volume-pressure?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.pressure ?? undefined;
  } catch { return undefined; }
}

async function fetchLevels(ticker: string): Promise<{
  vwap: number | null;
  callWall: number | null;
  putWall: number | null;
  gexFlip: number | null;
} | null> {
  try {
    const res = await fetch(`${APP_URL}/api/levels?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return {
      vwap: data.vwap ?? null,
      callWall: data.callWall ?? null,
      putWall: data.putWall ?? null,
      gexFlip: data.gexFlip ?? null,
    };
  } catch { return null; }
}

async function fetchRelativeStrength(ticker: string): Promise<number | undefined> {
  try {
    const res = await fetch(`${APP_URL}/api/market/relative-strength?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
    });
    if (!res.ok) return undefined;
    const data = await res.json();
    return data.rsVsSpy ?? undefined;
  } catch { return undefined; }
}

// ── Process a single ticker ─────────────────────────────

async function processTicker(ticker: string): Promise<{
  ticker: string;
  score: number;
  direction: string;
  stored: boolean;
  error?: string;
}> {
  try {
    // Fetch all data in parallel
    const [snapshot, flow, dp, vp, levels, rs] = await Promise.all([
      fetchSnapshot(ticker),
      fetchFlowStats(ticker),
      fetchDarkPool(ticker),
      fetchVolumePressure(ticker),
      fetchLevels(ticker),
      fetchRelativeStrength(ticker),
    ]);

    if (!snapshot || snapshot.price === 0) {
      return { ticker, score: 0, direction: 'NEUTRAL', stored: false, error: 'no-snapshot' };
    }

    // Build bias inputs
    const inputs: BiasInputs = {
      price: snapshot.price,
      changePercent: snapshot.changePercent,
      callRatio: flow?.callRatio,
      sweepRatio: flow?.sweepRatio,
      netDelta: flow?.netDelta,
      tradeCount: flow?.tradeCount,
      dpBullishPct: dp?.bullishPct,
      dpPrintCount: dp?.printCount,
      volumePressure: vp,
      vwap: levels?.vwap ?? undefined,
      gexFlip: levels?.gexFlip ?? undefined,
      callWall: levels?.callWall ?? undefined,
      putWall: levels?.putWall ?? undefined,
      rsVsSpy: rs,
    };

    // Compute score
    const result = computeBiasScore(inputs);

    // ── Store timeline point in Redis ────────────────
    const tlKey = timelineKey(ticker);
    const existing: TimelinePoint[] = (await redisGet<TimelinePoint[]>(tlKey)) || [];

    // Check min interval
    const lastPoint = existing[existing.length - 1];
    const now = Date.now();
    if (lastPoint && (now - lastPoint.t) < MIN_INTERVAL_MS) {
      return { ticker, score: result.score, direction: result.direction, stored: false, error: 'too-recent' };
    }

    const point: TimelinePoint = {
      t: now,
      s: result.score,
      d: DIR_MAP[result.direction] ?? 1,
      bc: flow ? (flow.callRatio > 60 ? 1 : 0) + (dp && dp.bullishPct > 55 ? 1 : 0) : 0,
      brc: flow ? (flow.callRatio < 40 ? 1 : 0) + (dp && dp.bullishPct < 45 ? 1 : 0) : 0,
    };

    existing.push(point);
    const capped = existing.length > MAX_POINTS ? existing.slice(-MAX_POINTS) : existing;
    await redisSet(tlKey, capped, TTL_SECONDS);

    // ── Store thesis snapshot for retraining ─────────
    const tKey = thesisKey(ticker);
    const thesisSnap: ThesisSnapshot = {
      ts: now,
      ticker,
      price: snapshot.price,
      score: result.score,
      direction: result.direction,
      components: result.components,
      inputs,
      vwap: levels?.vwap ?? undefined,
      callWall: levels?.callWall ?? undefined,
      putWall: levels?.putWall ?? undefined,
      gexFlip: levels?.gexFlip ?? undefined,
    };

    await redisLpush(tKey, thesisSnap);
    await redisExpire(tKey, 7 * 24 * 60 * 60); // Keep 7 days

    return { ticker, score: result.score, direction: result.direction, stored: true };
  } catch (e: any) {
    return { ticker, score: 0, direction: 'NEUTRAL', stored: false, error: e.message };
  }
}

// ── GET endpoint (Vercel Cron calls this) ────────────────

export async function GET(request: NextRequest) {
  // Verify cron authorization
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Only run during market hours
  if (!isMarketOpen()) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'Market closed',
      timestamp: new Date().toISOString(),
    });
  }

  if (!hasRedis()) {
    return NextResponse.json({
      status: 'error',
      reason: 'Redis not configured',
    }, { status: 500 });
  }

  const startTime = Date.now();

  // Process all tracked tickers in parallel
  const results = await Promise.all(
    TRACKED_TICKERS.map(ticker => processTicker(ticker))
  );

  const elapsed = Date.now() - startTime;
  const stored = results.filter(r => r.stored).length;

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    elapsed: `${elapsed}ms`,
    tickers: TRACKED_TICKERS.length,
    stored,
    results,
  });
}
