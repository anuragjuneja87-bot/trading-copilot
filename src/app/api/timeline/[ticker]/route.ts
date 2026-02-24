import { NextRequest, NextResponse } from 'next/server';

/* ──────────────────────────────────────────────────────────
   TIMELINE API — Server-side bias score storage
   
   GET  /api/timeline/SPY → full day's timeline
   POST /api/timeline/SPY → append a new point
   
   Storage: Upstash Redis (primary) → in-memory Map (fallback)
   ────────────────────────────────────────────────────────── */

interface TimelinePoint {
  t: number;    // timestamp (Unix ms)
  s: number;    // score (0-100)
  d: number;    // direction: 0=BEAR, 1=NEUTRAL, 2=BULL
  bc: number;   // bull count
  brc: number;  // bear count
}

// ── Storage Backend ─────────────────────────────────────

// In-memory fallback (survives warm Vercel instances, lost on cold start)
const memoryStore = new Map<string, TimelinePoint[]>();

function getDayKey(ticker: string): string {
  // Key format: tl:{TICKER}:{YYYY-MM-DD}
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  const [m, d, y] = dateStr.split('/');
  return `tl:${ticker.toUpperCase()}:${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// Upstash Redis REST API (no SDK needed — just fetch)
async function redisGet(key: string): Promise<TimelinePoint[] | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
    const data = await res.json();
    if (data.result) {
      return JSON.parse(data.result);
    }
    return null;
  } catch (e) {
    console.error('[Timeline] Redis GET error:', e);
    return null;
  }
}

async function redisSet(key: string, value: TimelinePoint[], ttlSeconds: number): Promise<boolean> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return false;

  try {
    const res = await fetch(`${url}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}/EX/${ttlSeconds}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: 'POST',
    });
    const data = await res.json();
    return data.result === 'OK';
  } catch (e) {
    console.error('[Timeline] Redis SET error:', e);
    return false;
  }
}

const hasRedis = () => !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
const TTL_SECONDS = 24 * 60 * 60; // 24 hours
const MIN_INTERVAL_MS = 10000; // 10s between points
const MAX_POINTS = 3000; // ~13 hours at 15s intervals

// ── GET: Fetch full day's timeline ─────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const key = getDayKey(ticker);

  // Try Redis first
  if (hasRedis()) {
    const data = await redisGet(key);
    if (data) {
      return NextResponse.json({ 
        points: data, 
        source: 'redis',
        count: data.length,
      });
    }
  }

  // Fallback to memory
  const memData = memoryStore.get(key) || [];
  return NextResponse.json({ 
    points: memData, 
    source: hasRedis() ? 'redis-empty' : 'memory',
    count: memData.length,
  });
}

// ── POST: Append a new point ───────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const key = getDayKey(ticker);

  let body: { score: number; direction: number; bullCount: number; bearCount: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { score, direction, bullCount, bearCount } = body;
  if (score == null || direction == null) {
    return NextResponse.json({ error: 'Missing score or direction' }, { status: 400 });
  }

  const point: TimelinePoint = {
    t: Date.now(),
    s: Math.round(score),
    d: direction,
    bc: bullCount || 0,
    brc: bearCount || 0,
  };

  // Load existing
  let existing: TimelinePoint[] = [];
  if (hasRedis()) {
    existing = (await redisGet(key)) || [];
  } else {
    existing = memoryStore.get(key) || [];
  }

  // Deduplicate: skip if last point is too recent
  const last = existing[existing.length - 1];
  if (last && (point.t - last.t) < MIN_INTERVAL_MS) {
    return NextResponse.json({ stored: false, reason: 'too-recent', count: existing.length });
  }

  // Append + cap
  existing.push(point);
  if (existing.length > MAX_POINTS) {
    existing = existing.slice(-MAX_POINTS);
  }

  // Save
  if (hasRedis()) {
    await redisSet(key, existing, TTL_SECONDS);
  }
  // Always update memory too (fast reads)
  memoryStore.set(key, existing);

  return NextResponse.json({ stored: true, count: existing.length });
}
