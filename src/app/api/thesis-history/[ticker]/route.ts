import { NextRequest, NextResponse } from 'next/server';
import { redisLrange, thesisKey, getTodayET } from '@/lib/redis';

/* ──────────────────────────────────────────────────────────
   THESIS HISTORY API
   
   GET /api/thesis-history/SPY?date=2026-02-24&limit=100
   
   Returns stored thesis snapshots for analytics and
   model retraining. Each snapshot includes:
   - Bias score + direction
   - All component scores and weights
   - Raw input values (callRatio, dpBullish%, VWAP position, etc.)
   - Market levels at the time
   ────────────────────────────────────────────────────────── */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> }
) {
  const { ticker } = await params;
  const { searchParams } = new URL(request.url);
  const date = searchParams.get('date') || getTodayET();
  const limit = Math.min(parseInt(searchParams.get('limit') || '500'), 2000);

  const key = thesisKey(ticker, date);
  const snapshots = await redisLrange(key, 0, limit - 1);

  return NextResponse.json({
    ticker: ticker.toUpperCase(),
    date,
    count: snapshots.length,
    snapshots,
  });
}
