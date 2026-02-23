import { NextRequest, NextResponse } from 'next/server';
import { validateTicker, validateTickers, validateInt } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// ─── Market Session Detection ────────────────────────────────────────
type SessionType = 'pre-market' | 'open' | 'after-hours' | 'closed';

function getMarketSession(): { session: SessionType; etNow: Date } {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = et.getHours();
  const minute = et.getMinutes();
  const day = et.getDay();
  const timeInMinutes = hour * 60 + minute;

  if (day === 0 || day === 6) return { session: 'closed', etNow: et };
  if (timeInMinutes >= 240 && timeInMinutes < 570) return { session: 'pre-market', etNow: et };
  if (timeInMinutes >= 570 && timeInMinutes < 960) return { session: 'open', etNow: et };
  if (timeInMinutes >= 960 && timeInMinutes < 1200) return { session: 'after-hours', etNow: et };
  return { session: 'closed', etNow: et };
}

// ─── Date Helpers ────────────────────────────────────────────────────
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getLastTradingDate(et: Date, includeToday: boolean): string {
  let checkDate = new Date(et);
  if (!includeToday) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  while (checkDate.getDay() === 0 || checkDate.getDay() === 6) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  return formatDate(checkDate);
}

function getTodayDateStr(et: Date): string {
  return formatDate(et);
}

// ─── Correlation ─────────────────────────────────────────────────────
function calculateCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 5) return 0;

  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;

  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }

  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

// ─── RS Regime ───────────────────────────────────────────────────────
function classifyRegime(avgRS: number): string {
  if (avgRS > 1.5) return 'STRONG_OUTPERFORM';
  if (avgRS > 0.5) return 'OUTPERFORM';
  if (avgRS > -0.5) return 'INLINE';
  if (avgRS > -1.5) return 'UNDERPERFORM';
  return 'STRONG_UNDERPERFORM';
}

// ─── Fetch Polygon Snapshot (real-time, includes pre-market) ─────────
async function fetchSnapshot(tickers: string[]): Promise<Record<string, {
  price: number;
  prevClose: number;
  changePct: number;
  todaysChange: number;
  todaysChangePct: number;
  preMarketPrice?: number;
  dayOpen?: number;
}>> {
  const url = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${tickers.join(',')}&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url, {
    next: { revalidate: 15 },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return {};
  const data = await res.json();
  const result: Record<string, any> = {};

  for (const t of data.tickers || []) {
    const lastTradePrice = parseFloat(t.lastTrade?.p) || 0;
    const dayClose = parseFloat(t.day?.c) || 0;
    const prevDayClose = parseFloat(t.prevDay?.c) || 0;
    const dayOpen = parseFloat(t.day?.o) || 0;
    const preMarketPrice = parseFloat(t.min?.c) || parseFloat(t.prevDay?.c) || 0;
    const price = lastTradePrice || dayClose || prevDayClose;
    const todaysChange = parseFloat(t.todaysChange) || 0;
    const todaysChangePct = parseFloat(t.todaysChangePerc) || 0;

    result[t.ticker] = {
      price,
      prevClose: prevDayClose,
      changePct: prevDayClose > 0 ? ((price - prevDayClose) / prevDayClose) * 100 : todaysChangePct,
      todaysChange,
      todaysChangePct,
      preMarketPrice: lastTradePrice || preMarketPrice,
      dayOpen: dayOpen || undefined,
    };
  }
  return result;
}

// ─── Fetch intraday bars (supports extended hours) ───────────────────
async function fetchBars(
  sym: string,
  dateStr: string,
  includeExtended: boolean
): Promise<any[]> {
  const url = `https://api.polygon.io/v2/aggs/ticker/${sym}/range/5/minute/${dateStr}/${dateStr}?adjusted=true&sort=asc&limit=500&apiKey=${POLYGON_API_KEY}`;
  const res = await fetch(url, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.results || []).filter((bar: any) => {
    const barDate = new Date(bar.t);
    const barET = new Date(barDate.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const minutes = barET.getHours() * 60 + barET.getMinutes();

    if (includeExtended) {
      // Pre-market (4:00 AM) through close (4:00 PM)
      return minutes >= 240 && minutes < 960;
    }
    // Regular hours only
    return minutes >= 570 && minutes < 960;
  });
}

// ─── Build normalized series from prev close or first bar ────────────
function buildSeries(
  bars: any[],
  referencePrice?: number
): any[] {
  if (!bars.length) return [];
  const basePrice = referencePrice || bars[0].o;
  if (basePrice === 0) return [];

  return bars.map((bar: any) => {
    const date = new Date(bar.t);
    return {
      time: date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      }),
      timeMs: bar.t,
      price: bar.c,
      pctChange: ((bar.c - basePrice) / basePrice) * 100,
      volume: bar.v,
    };
  });
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN HANDLER
// ═══════════════════════════════════════════════════════════════════════

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = validateTicker(searchParams.get('ticker'));

    if (!ticker) {
      return NextResponse.json({ success: false, error: 'Ticker required' }, { status: 400 });
    }

    const { session, etNow } = getMarketSession();
    const tickers = [ticker];
    if (ticker !== 'SPY') tickers.push('SPY');
    if (ticker !== 'QQQ') tickers.push('QQQ');

    // ── ALWAYS fetch real-time snapshot (includes pre-market prices) ──
    const snapshots = await fetchSnapshot(tickers);

    const isPreMarketOrEarly = session === 'pre-market' || session === 'closed';
    const isAfterHours = session === 'after-hours';

    // ── Determine date and whether to include extended hours bars ──
    let dateStr: string;
    let includeExtended: boolean;

    if (session === 'pre-market') {
      // During pre-market: fetch TODAY's bars with extended hours
      dateStr = getTodayDateStr(etNow);
      includeExtended = true;
    } else if (session === 'open') {
      // During market hours: fetch today's bars (regular + pre-market for full picture)
      dateStr = getTodayDateStr(etNow);
      includeExtended = true; // Include pre-market bars to show the full day including gap
    } else {
      // After hours / closed: use last trading day
      dateStr = getLastTradingDate(etNow, session === 'after-hours');
      includeExtended = false;
    }

    // ── Fetch bars for all tickers ──
    const barResults = await Promise.all(
      tickers.map((sym) => fetchBars(sym, dateStr, includeExtended))
    );

    // ── Build series normalized from previous close (to capture gap/pre-market move) ──
    const series: Record<string, any[]> = {};
    tickers.forEach((sym, i) => {
      const prevClose = snapshots[sym]?.prevClose;
      series[sym] = buildSeries(barResults[i], prevClose);
    });

    // ── Calculate RS from bars if we have them ──
    const tickerSeries = series[ticker] || [];
    const spySeries = series['SPY'] || [];
    const qqqSeries = series['QQQ'] || [];

    let tickerChange: number;
    let spyChange: number;
    let qqqChange: number;

    if (tickerSeries.length > 0) {
      // Use intraday bar data (normalized from prev close)
      const latestTicker = tickerSeries[tickerSeries.length - 1];
      const latestSpy = spySeries[spySeries.length - 1];
      const latestQqq = qqqSeries[qqqSeries.length - 1];
      tickerChange = latestTicker?.pctChange || 0;
      spyChange = latestSpy?.pctChange || 0;
      qqqChange = latestQqq?.pctChange || 0;
    } else {
      // Fallback to snapshot data (real-time, always available incl pre-market)
      tickerChange = snapshots[ticker]?.changePct || 0;
      spyChange = snapshots['SPY']?.changePct || 0;
      qqqChange = snapshots['QQQ']?.changePct || 0;
    }

    const rsVsSpy = tickerChange - spyChange;
    const rsVsQqq = tickerChange - qqqChange;

    // ── Correlation ──
    const tickerChanges = tickerSeries.map((d: any) => d.pctChange);
    const spyChanges = spySeries.map((d: any) => d.pctChange);
    const qqqChanges = qqqSeries.map((d: any) => d.pctChange);
    const corrSpy = calculateCorrelation(tickerChanges, spyChanges);
    const corrQqq = calculateCorrelation(tickerChanges, qqqChanges);

    // ── Regime ──
    const avgRS = (rsVsSpy + rsVsQqq) / 2;
    const regime = classifyRegime(avgRS);

    // ── RS time series ──
    const rsTimeSeries = tickerSeries.map((d: any, i: number) => {
      const spyPct = spySeries[i]?.pctChange || 0;
      const qqqPct = qqqSeries[i]?.pctChange || 0;
      return {
        time: d.time,
        timeMs: d.timeMs,
        tickerPct: d.pctChange,
        spyPct,
        qqqPct,
        rsVsSpy: d.pctChange - spyPct,
        rsVsQqq: d.pctChange - qqqPct,
      };
    });

    // ── If pre-market with no bars yet, synthesize a single data point from snapshot ──
    if (rsTimeSeries.length === 0 && (isPreMarketOrEarly || isAfterHours)) {
      const now = Date.now();
      const timeLabel = new Date().toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
        timeZone: 'America/New_York',
      });
      rsTimeSeries.push({
        time: timeLabel,
        timeMs: now,
        tickerPct: tickerChange,
        spyPct: spyChange,
        qqqPct: qqqChange,
        rsVsSpy,
        rsVsQqq,
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        ticker,
        date: dateStr,
        session,
        series,
        rsTimeSeries,
        // Include snapshot data so the panel can show it during pre-market
        snapshot: {
          ticker: snapshots[ticker] || null,
          SPY: snapshots['SPY'] || null,
          QQQ: snapshots['QQQ'] || null,
        },
        summary: {
          tickerChange: Math.round(tickerChange * 100) / 100,
          spyChange: Math.round(spyChange * 100) / 100,
          qqqChange: Math.round(qqqChange * 100) / 100,
          rsVsSpy: Math.round(rsVsSpy * 100) / 100,
          rsVsQqq: Math.round(rsVsQqq * 100) / 100,
          corrSpy: Math.round(corrSpy * 100) / 100,
          corrQqq: Math.round(corrQqq * 100) / 100,
          regime,
          session,
        },
      },
    });
  } catch (error: any) {
    console.error('[Relative Strength API] Error:', error);
    return NextResponse.json({ success: false, error: "An error occurred" }, { status: 500 });
  }
}
