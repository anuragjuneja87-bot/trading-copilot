import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { runAllDetectors, type TickerState, type PreviousState } from '@/lib/signal-detectors';
import { isMarketOpen } from '@/lib/redis';

/* ════════════════════════════════════════════════════════════════
   ALERT ENGINE CRON — /api/cron/alert-engine
   
   Vercel Cron calls this every 60 seconds. Market hours only.
   
   Flow:
   1. Get union of all watched tickers across all users
   2. Fetch current data from our own APIs (already cache Polygon)
   3. Load previous state from ticker_cache
   4. Run 9 signal detectors per ticker
   5. Update ticker_cache with new state
   6. Fan out detected signals → matching users
   7. Apply cooldowns + sensitivity + type filters
   8. Write alerts to DB
   9. Cleanup expired cooldowns + alerts
   
   Budget: ~15-20s for 200 tickers. Vercel Pro allows 60s.
   ════════════════════════════════════════════════════════════════ */

export const maxDuration = 60;

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
// Prefer explicit production URL > VERCEL_PROJECT_PRODUCTION_URL > VERCEL_URL > localhost
const APP_URL = process.env.NEXT_PUBLIC_APP_URL 
  || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null)
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null)
  || 'http://localhost:3000';

// Tier mapping for sensitivity filter
const TIER_GATE: Record<string, number[]> = {
  LOW: [1],           // Tier 1 only (confluence, thesis flip)
  MEDIUM: [1, 2],     // Tier 1 + Tier 2
  HIGH: [1, 2, 3],    // All tiers
};

// Cooldown durations (minutes)
const COOLDOWN_MINUTES: Record<number, number> = {
  1: 15,  // Tier 1: 15 min cooldown
  2: 15,  // Tier 2: 15 min
  3: 30,  // Tier 3: 30 min
};

// ── Verify cron authorization ────────────────────────────────

function verifyCron(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return true;
  const auth = request.headers.get('authorization');
  if (auth === `Bearer ${cronSecret}`) return true;
  const vercelCron = request.headers.get('x-vercel-cron');
  if (vercelCron) return true;
  const { searchParams } = new URL(request.url);
  if (searchParams.get('key') === cronSecret) return true;
  return false;
}

// -- Data fetchers with error logging and timeouts --

async function fetchSnapshot(ticker: string) {
  if (!POLYGON_API_KEY) return null;
  try {
    const res = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8000) }
    );
    const data = await res.json();
    const t = data.ticker;
    if (!t) return null;
    return {
      price: t.day?.c || t.lastTrade?.p || t.prevDay?.c || 0,
      changePercent: t.todaysChangePerc || 0,
    };
  } catch (e: any) {
    console.error(`[alert-engine] fetchSnapshot(${ticker}): ${e.message}`);
    return null;
  }
}

async function fetchFlowStats(ticker: string) {
  try {
    const res = await fetch(`${APP_URL}/api/flow/options?tickers=${ticker}&limit=300`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[alert-engine] fetchFlow(${ticker}) HTTP ${res.status}: ${await res.text().catch(() => '')}`);
      return null;
    }
    const json = await res.json();
    return json.data?.stats || json.stats || null;
  } catch (e: any) {
    console.error(`[alert-engine] fetchFlow(${ticker}): ${e.message}`);
    return null;
  }
}

async function fetchDarkPool(ticker: string) {
  try {
    const res = await fetch(`${APP_URL}/api/darkpool?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[alert-engine] fetchDP(${ticker}) HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json.data?.stats || json.stats || null;
  } catch (e: any) {
    console.error(`[alert-engine] fetchDP(${ticker}): ${e.message}`);
    return null;
  }
}

async function fetchVolumePressure(ticker: string) {
  try {
    const res = await fetch(`${APP_URL}/api/market/volume-pressure?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[alert-engine] fetchVP(${ticker}) HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    const vpData = json.data || json;
    if (!vpData?.summary) return null;
    const { totalBuy, totalSell } = vpData.summary;
    const totalVol = totalBuy + totalSell;
    const pressure = totalVol > 0 ? Math.round(((totalBuy - totalSell) / totalVol) * 100) : 0;
    let cvdTrend: 'rising' | 'falling' | 'flat' = 'flat';
    const buckets = vpData.buckets || [];
    if (buckets.length >= 3) {
      const recent = buckets.slice(-3);
      const cvds = recent.map((b: any) => (b.buyVolume || 0) - (b.sellVolume || 0));
      if (cvds[2] > cvds[1] && cvds[1] > cvds[0]) cvdTrend = 'rising';
      else if (cvds[2] < cvds[1] && cvds[1] < cvds[0]) cvdTrend = 'falling';
    }
    return { pressure, cvdTrend };
  } catch (e: any) {
    console.error(`[alert-engine] fetchVP(${ticker}): ${e.message}`);
    return null;
  }
}

async function fetchLevels(ticker: string) {
  try {
    const res = await fetch(`${APP_URL}/api/levels?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[alert-engine] fetchLevels(${ticker}) HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json.data || json;
  } catch (e: any) {
    console.error(`[alert-engine] fetchLevels(${ticker}): ${e.message}`);
    return null;
  }
}

async function fetchRelativeStrength(ticker: string) {
  try {
    const res = await fetch(`${APP_URL}/api/market/relative-strength?ticker=${ticker}`, {
      cache: 'no-store',
      headers: { 'x-cron-worker': '1' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.error(`[alert-engine] fetchRS(${ticker}) HTTP ${res.status}`);
      return null;
    }
    const json = await res.json();
    return json.data || json;
  } catch (e: any) {
    console.error(`[alert-engine] fetchRS(${ticker}): ${e.message}`);
    return null;
  }
}


// ── Build TickerState from raw API responses ─────────────────

function buildTickerState(
  ticker: string,
  snapshot: any,
  flow: any,
  dp: any,
  vp: any,
  levels: any,
  rs: any
): TickerState {
  return {
    ticker,
    price: snapshot?.price || 0,
    changePercent: snapshot?.changePercent || 0,

    flowCallRatio: flow?.callRatio ?? 50,
    flowSweepRatio: flow?.sweepRatio ?? 0,
    flowNetDelta: flow?.netDeltaAdjustedFlow ?? 0,
    sweepCount: flow?.sweepCount ?? 0,
    topSweepStrike: flow?.topSweepStrike,
    topSweepValue: flow?.topSweepValue,

    // vp is now { pressure, cvdTrend } from our fixed fetcher
    cvdTrend: vp?.cvdTrend || 'flat',
    volumePressure: vp?.pressure ?? 50,

    dpBullishPct: dp?.bullishPct ?? 50,
    dpLargePrints: dp?.largePrintCount ?? 0,
    dpTotalValue: dp?.totalValue ?? 0,

    rsVsSpy: rs?.rsVsSpy ?? 0,

    callWall: levels?.callWall ?? undefined,
    putWall: levels?.putWall ?? undefined,
    gexFlip: levels?.gexFlip ?? undefined,
    vwap: levels?.vwap ?? undefined,

    newsScore: undefined,
  };
}

// ── Process batch of tickers ─────────────────────────────────

async function processTickers(tickers: string[]) {
  const results: Array<{
    ticker: string;
    signals: number;
    error?: string;
  }> = [];

  // Process in parallel batches of 5 to avoid overwhelming APIs
  const BATCH_SIZE = 5;
  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (ticker) => {
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
            return { ticker, signals: 0, error: 'no-snapshot' };
          }

          // Diagnostic: log what we got so we can verify data extraction
          console.log(`[alert-engine] ${ticker}: price=$${snapshot.price}, flow=${flow ? `callR=${flow.callRatio}%` : 'null'}, dp=${dp ? `bull=${dp.bullishPct}%` : 'null'}, vp=${vp ? `p=${vp.pressure}` : 'null'}, levels=${levels ? `cw=${levels.callWall}` : 'null'}, rs=${rs ? `rs=${rs.rsVsSpy}` : 'null'}`);

          const state = buildTickerState(ticker, snapshot, flow, dp, vp, levels, rs);

          // Load previous state from ticker_cache
          const cached = await prisma.tickerCache.findUnique({
            where: { ticker },
          });

          const prev: PreviousState = cached
            ? {
                thesisBias: cached.thesisBias,
                confluenceCt: cached.confluenceCt,
                flowLeader: cached.flowLeader,
                cvdTrend: cached.cvdTrend,
                dpRegime: cached.dpRegime,
                rsRegime: cached.rsRegime,
                price: cached.price,
              }
            : {};

          // Run all 9 detectors
          const detectedSignals = runAllDetectors(state, prev);

          if (detectedSignals.length > 0) {
            console.log(`[alert-engine] 🎯 ${ticker}: ${detectedSignals.length} signal(s) detected: ${detectedSignals.map(s => `${s.type}(T${s.tier})`).join(', ')}`);
          }

          // Update ticker_cache with current state
          const flowLdr = state.flowCallRatio > 60 ? 'calls' : state.flowCallRatio < 40 ? 'puts' : 'balanced';
          const dpReg = state.dpBullishPct > 55 ? 'accumulation' : state.dpBullishPct < 45 ? 'distribution' : 'neutral';
          const rsReg = state.rsVsSpy > 0.3 ? 'leading' : state.rsVsSpy < -0.3 ? 'lagging' : 'inline';
          const { bias, bullCount } = (() => {
            let b = 0;
            if (state.flowCallRatio > 60) b++; if (state.volumePressure > 60) b++;
            if (state.dpBullishPct > 55) b++; if (state.rsVsSpy > 0.3) b++;
            if (state.vwap && state.price > state.vwap) b++; if (state.cvdTrend === 'rising') b++;
            return { bias: b >= 4 ? 'BULLISH' : 'NEUTRAL', bullCount: b };
          })();

          await prisma.tickerCache.upsert({
            where: { ticker },
            create: {
              ticker,
              price: state.price,
              changePercent: state.changePercent,
              thesisBias: bias,
              confluenceCt: bullCount,
              flowLeader: flowLdr,
              cvdTrend: state.cvdTrend,
              dpRegime: dpReg,
              rsRegime: rsReg,
              callWall: state.callWall || null,
              putWall: state.putWall || null,
              gexFlip: state.gexFlip || null,
              vwap: state.vwap || null,
              sweepCount: state.sweepCount,
              topSweepStrike: state.topSweepStrike || null,
              topSweepValue: state.topSweepValue || null,
              signalsJson: state as any,
            },
            update: {
              price: state.price,
              changePercent: state.changePercent,
              thesisBias: bias,
              confluenceCt: bullCount,
              flowLeader: flowLdr,
              cvdTrend: state.cvdTrend,
              dpRegime: dpReg,
              rsRegime: rsReg,
              callWall: state.callWall || null,
              putWall: state.putWall || null,
              gexFlip: state.gexFlip || null,
              vwap: state.vwap || null,
              sweepCount: state.sweepCount,
              topSweepStrike: state.topSweepStrike || null,
              topSweepValue: state.topSweepValue || null,
              signalsJson: state as any,
            },
          });

          // Fan out signals to users
          if (detectedSignals.length > 0) {
            await fanOutSignals(ticker, state.price, detectedSignals);
          }

          return { ticker, signals: detectedSignals.length };
        } catch (e: any) {
          return { ticker, signals: 0, error: e.message };
        }
      })
    );

    results.push(...batchResults);
  }

  return results;
}

// ── Fan out: signals → matching users ────────────────────────

async function fanOutSignals(
  ticker: string,
  price: number,
  signals: Array<ReturnType<typeof runAllDetectors>[number]>
) {
  // Find all users watching this ticker with alert settings
  const users = await prisma.watchlistItem.findMany({
    where: { ticker },
    select: {
      userId: true,
      user: {
        select: {
          alertSettings: true,
        },
      },
    },
  });

  if (users.length === 0) return;

  console.log(`[alert-engine] Fan-out: ${ticker} has ${signals.length} signal(s) → ${users.length} user(s) watching`);

  const now = new Date();
  const alertsToCreate: any[] = [];
  const cooldownsToCreate: any[] = [];

  for (const userItem of users) {
    // Use saved settings or sensible defaults if user hasn't configured yet
    const settings = userItem.user.alertSettings || {
      sensitivity: 'MEDIUM',
      enabledTypes: ['confluence', 'thesis_flip', 'sweep_cluster', 'cvd_divergence', 'dark_pool_large', 'key_level', 'news_catalyst'],
    };

    const allowedTiers = TIER_GATE[settings.sensitivity] || TIER_GATE.MEDIUM;
    const enabledTypes = new Set(settings.enabledTypes);

    for (const signal of signals) {
      // Filter: tier gate
      if (!allowedTiers.includes(signal.tier)) continue;

      // Filter: enabled type
      if (!enabledTypes.has(signal.type)) continue;

      // Check cooldown
      const cooldownKey = {
        userId: userItem.userId,
        ticker,
        alertType: signal.type,
      };

      const existingCooldown = await prisma.alertCooldown.findUnique({
        where: {
          userId_ticker_alertType: cooldownKey,
        },
      });

      if (existingCooldown && existingCooldown.expiresAt > now) {
        continue; // Still in cooldown
      }

      // Create alert
      const cooldownMinutes = COOLDOWN_MINUTES[signal.tier] || 15;
      const expiresAt = new Date(now.getTime() + 30 * 60 * 1000); // 30 min expiry
      const cooldownExpiry = new Date(now.getTime() + cooldownMinutes * 60 * 1000);

      alertsToCreate.push({
        userId: userItem.userId,
        ticker,
        type: signal.type,
        tier: signal.tier,
        title: signal.title,
        summary: signal.summary,
        bias: signal.bias,
        confidence: signal.confidence,
        price,
        target1: signal.target1 || null,
        stopPrice: signal.stopPrice || null,
        signalsJson: signal.signals,
        expiresAt,
      });

      cooldownsToCreate.push({
        ...cooldownKey,
        expiresAt: cooldownExpiry,
      });
    }
  }

  // Batch write alerts
  if (alertsToCreate.length > 0) {
    await prisma.alert.createMany({ data: alertsToCreate });
    console.log(`[alert-engine] 🔔 Created ${alertsToCreate.length} alert(s) for ${ticker}: ${alertsToCreate.map(a => a.type).join(', ')}`);
  }

  // Batch upsert cooldowns
  for (const cd of cooldownsToCreate) {
    await prisma.alertCooldown.upsert({
      where: {
        userId_ticker_alertType: {
          userId: cd.userId,
          ticker: cd.ticker,
          alertType: cd.alertType,
        },
      },
      create: cd,
      update: { expiresAt: cd.expiresAt },
    });
  }
}

// ── Cleanup old data ─────────────────────────────────────────

async function cleanup() {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  await Promise.all([
    // Expired cooldowns
    prisma.alertCooldown.deleteMany({
      where: { expiresAt: { lt: now } },
    }),
    // Alerts older than 24h
    prisma.alert.deleteMany({
      where: { createdAt: { lt: oneDayAgo } },
    }),
  ]);
}

// ── GET handler (called by Vercel Cron) ──────────────────────

export async function GET(request: NextRequest) {
  if (!verifyCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!isMarketOpen()) {
    return NextResponse.json({
      status: 'skipped',
      reason: 'Market closed',
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`[alert-engine] Starting. APP_URL=${APP_URL}, POLYGON_API_KEY=${POLYGON_API_KEY ? 'set' : 'MISSING'}`);

  const startTime = Date.now();

  try {
    // Step 1: Get union of all watched tickers
    const watchedRaw = await prisma.watchlistItem.findMany({
      select: { ticker: true },
      distinct: ['ticker'],
    });
    const allTickers = watchedRaw.map((w) => w.ticker);

    console.log(`[alert-engine] Tickers from watchlists: [${allTickers.join(', ')}] (${allTickers.length} total)`);

    if (allTickers.length === 0) {
      console.log('[alert-engine] ⚠️ No watched tickers — no users have watchlists set up');
      return NextResponse.json({
        status: 'skipped',
        reason: 'No watched tickers',
        timestamp: new Date().toISOString(),
      });
    }

    // Step 2-6: Process all tickers
    const results = await processTickers(allTickers);

    // Step 7: Cleanup
    await cleanup();

    const elapsed = Date.now() - startTime;
    const totalSignals = results.reduce((sum, r) => sum + r.signals, 0);

    return NextResponse.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      elapsed: `${elapsed}ms`,
      tickers: allTickers.length,
      signalsDetected: totalSignals,
      results,
    });
  } catch (e: any) {
    console.error('[alert-engine] Error:', e.message);
    return NextResponse.json({
      status: 'error',
      error: e.message,
      elapsed: `${Date.now() - startTime}ms`,
    }, { status: 500 });
  }
}
