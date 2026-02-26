/* ════════════════════════════════════════════════════════════════
   SIGNAL DETECTORS — 9 pattern detectors for alert generation
   
   Each detector compares CURRENT data against PREVIOUS state
   (from ticker_cache) to detect meaningful CHANGES.
   
   Returns null if no signal, or a DetectedSignal if triggered.
   Pure functions — no side effects, no DB calls.
   ════════════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────────────

export interface TickerState {
  ticker: string;
  price: number;
  changePercent: number;

  // Panel signals
  flowCallRatio: number;     // 0-100
  flowSweepRatio: number;    // 0-100
  flowNetDelta: number;
  sweepCount: number;
  topSweepStrike?: string;
  topSweepValue?: number;

  cvdTrend: string;          // "rising","falling","flat"
  volumePressure: number;    // 0-100

  dpBullishPct: number;      // 0-100
  dpLargePrints: number;     // count of prints > $5M
  dpTotalValue: number;

  rsVsSpy: number;           // relative strength ratio

  callWall?: number;
  putWall?: number;
  gexFlip?: number;
  vwap?: number;

  newsScore?: number;        // -1 to 1
}

export interface PreviousState {
  thesisBias?: string | null;
  confluenceCt?: number;
  flowLeader?: string | null;
  cvdTrend?: string | null;
  dpRegime?: string | null;
  rsRegime?: string | null;
  price?: number;
}

export interface DetectedSignal {
  type: string;              // alert type key
  tier: number;              // 1, 2, or 3
  title: string;
  summary: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: 'LOW' | 'MODERATE' | 'HIGH';
  signals: Array<{
    panel: string;
    status: 'bullish' | 'bearish' | 'neutral';
    detail: string;
  }>;
  target1?: number;
  stopPrice?: number;
}

// ── Helper: compute bias from signals ────────────────────────

function computeBias(state: TickerState): {
  bias: 'bullish' | 'bearish' | 'neutral';
  bullCount: number;
  bearCount: number;
} {
  let bull = 0, bear = 0;

  if (state.flowCallRatio > 60) bull++; else if (state.flowCallRatio < 40) bear++;
  if (state.volumePressure > 60) bull++; else if (state.volumePressure < 40) bear++;
  if (state.dpBullishPct > 55) bull++; else if (state.dpBullishPct < 45) bear++;
  if (state.rsVsSpy > 0.3) bull++; else if (state.rsVsSpy < -0.3) bear++;
  if (state.vwap && state.price > state.vwap) bull++; else if (state.vwap && state.price < state.vwap) bear++;
  if (state.cvdTrend === 'rising') bull++; else if (state.cvdTrend === 'falling') bear++;

  const bias = bull >= 4 ? 'bullish' : bear >= 4 ? 'bearish' : 'neutral';
  return { bias, bullCount: bull, bearCount: bear };
}

function flowLeader(callRatio: number): string {
  if (callRatio > 60) return 'calls';
  if (callRatio < 40) return 'puts';
  return 'balanced';
}

function dpRegime(bullPct: number): string {
  if (bullPct > 55) return 'accumulation';
  if (bullPct < 45) return 'distribution';
  return 'neutral';
}

function rsRegime(rs: number): string {
  if (rs > 0.3) return 'leading';
  if (rs < -0.3) return 'lagging';
  return 'inline';
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 1: CONFLUENCE (Tier 1)
//  4+ panels aligned in same direction
// ══════════════════════════════════════════════════════════════

export function detectConfluence(
  state: TickerState,
  prev: PreviousState
): DetectedSignal | null {
  const { bias, bullCount, bearCount } = computeBias(state);
  const alignedCount = Math.max(bullCount, bearCount);

  // Only fire if 4+ signals aligned AND confluence count changed
  if (alignedCount < 4) return null;
  if (prev.confluenceCt !== undefined && alignedCount <= prev.confluenceCt) return null;

  const signals = buildSignalList(state);
  const confidence = alignedCount >= 5 ? 'HIGH' : 'MODERATE';

  return {
    type: 'confluence',
    tier: 1,
    title: `${state.ticker} — ${alignedCount}/6 Signals ${bias === 'bullish' ? '▲ BULLISH' : '▼ BEARISH'}`,
    summary: `${alignedCount} of 6 panels aligned ${bias}. Flow ${state.flowCallRatio > 60 ? 'call' : 'put'}-heavy at ${state.flowCallRatio.toFixed(0)}%, CVD ${state.cvdTrend}, dark pool ${dpRegime(state.dpBullishPct)}.`,
    bias,
    confidence,
    signals,
    target1: bias === 'bullish' ? state.callWall : state.putWall,
    stopPrice: bias === 'bullish' ? state.putWall : state.callWall,
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 2: THESIS FLIP (Tier 1)
//  Bias changed from bullish↔bearish
// ══════════════════════════════════════════════════════════════

export function detectThesisFlip(
  state: TickerState,
  prev: PreviousState
): DetectedSignal | null {
  const { bias } = computeBias(state);
  const prevBias = prev.thesisBias?.toLowerCase();

  if (!prevBias) return null;
  if (bias === 'neutral' || prevBias === 'neutral') return null;
  if (bias === prevBias) return null;

  // Real flip: bullish → bearish or bearish → bullish
  return {
    type: 'thesis_flip',
    tier: 1,
    title: `${state.ticker} — Thesis Flipped to ${bias.toUpperCase()}`,
    summary: `Bias shifted from ${prevBias} to ${bias}. Multiple panels reversed direction simultaneously.`,
    bias,
    confidence: 'HIGH',
    signals: buildSignalList(state),
    target1: bias === 'bullish' ? state.callWall : state.putWall,
    stopPrice: bias === 'bullish' ? state.putWall : state.callWall,
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 3: SWEEP CLUSTER (Tier 2)
//  ≥3 sweeps in same direction within scan window
// ══════════════════════════════════════════════════════════════

export function detectSweepCluster(
  state: TickerState,
  _prev: PreviousState
): DetectedSignal | null {
  if (state.sweepCount < 3) return null;

  const bias = state.flowCallRatio > 55 ? 'bullish' : state.flowCallRatio < 45 ? 'bearish' : 'neutral';
  const strikeInfo = state.topSweepStrike
    ? ` targeting ${state.topSweepStrike} ($${((state.topSweepValue || 0) / 1000).toFixed(0)}K)`
    : '';

  return {
    type: 'sweep_cluster',
    tier: 2,
    title: `${state.ticker} — ${state.sweepCount} Sweep Cluster${strikeInfo}`,
    summary: `${state.sweepCount} aggressive sweeps detected, suggesting institutional urgency. Flow ${state.flowCallRatio.toFixed(0)}% calls.`,
    bias,
    confidence: state.sweepCount >= 5 ? 'HIGH' : 'MODERATE',
    signals: buildSignalList(state),
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 4: CVD DIVERGENCE (Tier 2)
//  Price going one way, CVD going the other
// ══════════════════════════════════════════════════════════════

export function detectCvdDivergence(
  state: TickerState,
  _prev: PreviousState
): DetectedSignal | null {
  const priceUp = state.changePercent > 0.3;
  const priceDown = state.changePercent < -0.3;
  const cvdRising = state.cvdTrend === 'rising';
  const cvdFalling = state.cvdTrend === 'falling';

  // Divergence: price and CVD in opposite directions
  const bearDivergence = priceUp && cvdFalling;  // price up but selling
  const bullDivergence = priceDown && cvdRising;  // price down but buying

  if (!bearDivergence && !bullDivergence) return null;

  const bias = bullDivergence ? 'bullish' : 'bearish';
  const label = bullDivergence ? 'Bullish Divergence' : 'Bearish Divergence';

  return {
    type: 'cvd_divergence',
    tier: 2,
    title: `${state.ticker} — CVD ${label}`,
    summary: `Price ${priceUp ? 'rising' : 'falling'} but cumulative volume delta ${cvdRising ? 'rising' : 'falling'}. Smart money may be positioning counter to price.`,
    bias,
    confidence: 'MODERATE',
    signals: buildSignalList(state),
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 5: DARK POOL LARGE PRINT (Tier 2)
//  Single print > $5M at key level
// ══════════════════════════════════════════════════════════════

export function detectDarkPoolLarge(
  state: TickerState,
  _prev: PreviousState
): DetectedSignal | null {
  if (state.dpLargePrints < 1) return null;

  const bias = state.dpBullishPct > 55 ? 'bullish' : state.dpBullishPct < 45 ? 'bearish' : 'neutral';
  const nearLevel = state.vwap && Math.abs(state.price - state.vwap) / state.price < 0.005;

  return {
    type: 'dark_pool_large',
    tier: 2,
    title: `${state.ticker} — Large Dark Pool Print${nearLevel ? ' at VWAP' : ''}`,
    summary: `${state.dpLargePrints} large print(s) detected ($${(state.dpTotalValue / 1e6).toFixed(1)}M total). Dark pool ${dpRegime(state.dpBullishPct)} bias at ${state.dpBullishPct.toFixed(0)}%.`,
    bias,
    confidence: state.dpLargePrints >= 3 ? 'HIGH' : 'MODERATE',
    signals: buildSignalList(state),
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 6: FLOW CROSSOVER (Tier 3)
//  Call/put leadership changed
// ══════════════════════════════════════════════════════════════

export function detectFlowCrossover(
  state: TickerState,
  prev: PreviousState
): DetectedSignal | null {
  const current = flowLeader(state.flowCallRatio);
  if (!prev.flowLeader || current === prev.flowLeader || current === 'balanced') return null;

  const bias = current === 'calls' ? 'bullish' : 'bearish';

  return {
    type: 'flow_crossover',
    tier: 3,
    title: `${state.ticker} — Flow Shifted to ${current === 'calls' ? 'Call' : 'Put'} Heavy`,
    summary: `Options flow shifted from ${prev.flowLeader} to ${current}. Call ratio now ${state.flowCallRatio.toFixed(0)}%.`,
    bias,
    confidence: 'LOW',
    signals: buildSignalList(state),
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 7: KEY LEVEL APPROACH (Tier 3)
//  Price within 0.5% of call/put wall or GEX flip
// ══════════════════════════════════════════════════════════════

export function detectKeyLevel(
  state: TickerState,
  _prev: PreviousState
): DetectedSignal | null {
  if (!state.price || state.price === 0) return null;

  const threshold = 0.005; // 0.5%
  const levels: Array<{ name: string; value: number; type: 'resistance' | 'support' | 'flip' }> = [];

  if (state.callWall) levels.push({ name: 'Call Wall', value: state.callWall, type: 'resistance' });
  if (state.putWall) levels.push({ name: 'Put Wall', value: state.putWall, type: 'support' });
  if (state.gexFlip) levels.push({ name: 'GEX Flip', value: state.gexFlip, type: 'flip' });

  const near = levels.filter(l => Math.abs(state.price - l.value) / state.price < threshold);
  if (near.length === 0) return null;

  const closest = near[0];
  const bias = closest.type === 'resistance' ? 'bearish' : closest.type === 'support' ? 'bullish' : 'neutral';

  return {
    type: 'key_level',
    tier: 3,
    title: `${state.ticker} — Approaching ${closest.name} ($${closest.value.toFixed(2)})`,
    summary: `Price ($${state.price.toFixed(2)}) within 0.5% of ${closest.name}. ${closest.type === 'resistance' ? 'Expect rejection or breakout.' : closest.type === 'support' ? 'Watch for bounce or breakdown.' : 'Gamma regime may shift.'}`,
    bias,
    confidence: 'LOW',
    signals: buildSignalList(state),
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 8: RS REGIME CHANGE (Tier 3)
//  Relative strength regime shifted
// ══════════════════════════════════════════════════════════════

export function detectRsRegimeChange(
  state: TickerState,
  prev: PreviousState
): DetectedSignal | null {
  const current = rsRegime(state.rsVsSpy);
  if (!prev.rsRegime || current === prev.rsRegime || current === 'inline') return null;

  const bias = current === 'leading' ? 'bullish' : 'bearish';

  return {
    type: 'rs_regime_change',
    tier: 3,
    title: `${state.ticker} — Now ${current === 'leading' ? 'Outperforming' : 'Underperforming'} SPY`,
    summary: `Relative strength shifted from ${prev.rsRegime} to ${current}. RS ratio: ${state.rsVsSpy.toFixed(2)}.`,
    bias,
    confidence: 'LOW',
    signals: buildSignalList(state),
  };
}

// ══════════════════════════════════════════════════════════════
//  DETECTOR 9: NEWS CATALYST (Tier 2)
//  Sharp sentiment shift
// ══════════════════════════════════════════════════════════════

export function detectNewsCatalyst(
  state: TickerState,
  _prev: PreviousState
): DetectedSignal | null {
  if (state.newsScore === undefined || state.newsScore === null) return null;
  if (Math.abs(state.newsScore) < 0.6) return null;

  const bias = state.newsScore > 0 ? 'bullish' : 'bearish';

  return {
    type: 'news_catalyst',
    tier: 2,
    title: `${state.ticker} — ${bias === 'bullish' ? 'Positive' : 'Negative'} News Catalyst`,
    summary: `News sentiment at ${(state.newsScore * 100).toFixed(0)}%. Strong ${bias} catalyst detected.`,
    bias,
    confidence: Math.abs(state.newsScore) > 0.8 ? 'HIGH' : 'MODERATE',
    signals: buildSignalList(state),
  };
}

// ── Build signal list for alert detail view ──────────────────

function buildSignalList(state: TickerState) {
  return [
    {
      panel: 'Options Flow',
      status: (state.flowCallRatio > 60 ? 'bullish' : state.flowCallRatio < 40 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      detail: `Call ratio ${state.flowCallRatio.toFixed(0)}%, ${state.sweepCount} sweeps`,
    },
    {
      panel: 'Volume Pressure',
      status: (state.cvdTrend === 'rising' ? 'bullish' : state.cvdTrend === 'falling' ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      detail: `CVD ${state.cvdTrend}, pressure ${state.volumePressure.toFixed(0)}%`,
    },
    {
      panel: 'Dark Pool',
      status: (state.dpBullishPct > 55 ? 'bullish' : state.dpBullishPct < 45 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      detail: `${dpRegime(state.dpBullishPct)} at ${state.dpBullishPct.toFixed(0)}%`,
    },
    {
      panel: 'Gamma',
      status: (state.gexFlip && state.price > state.gexFlip ? 'bullish' : state.gexFlip && state.price < state.gexFlip ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      detail: state.gexFlip ? `GEX flip $${state.gexFlip.toFixed(0)}, price ${state.price > state.gexFlip ? 'above' : 'below'}` : 'No GEX data',
    },
    {
      panel: 'Relative Strength',
      status: (state.rsVsSpy > 0.3 ? 'bullish' : state.rsVsSpy < -0.3 ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      detail: `RS ${rsRegime(state.rsVsSpy)}, ratio ${state.rsVsSpy.toFixed(2)}`,
    },
    {
      panel: 'VWAP',
      status: (state.vwap && state.price > state.vwap ? 'bullish' : state.vwap && state.price < state.vwap ? 'bearish' : 'neutral') as 'bullish' | 'bearish' | 'neutral',
      detail: state.vwap ? `Price ${state.price > state.vwap ? 'above' : 'below'} VWAP ($${state.vwap.toFixed(2)})` : 'No VWAP',
    },
  ];
}

// ── Master runner: run all 9 detectors ───────────────────────

export const ALL_DETECTORS = [
  detectConfluence,
  detectThesisFlip,
  detectSweepCluster,
  detectCvdDivergence,
  detectDarkPoolLarge,
  detectFlowCrossover,
  detectKeyLevel,
  detectRsRegimeChange,
  detectNewsCatalyst,
];

export function runAllDetectors(
  state: TickerState,
  prev: PreviousState
): DetectedSignal[] {
  return ALL_DETECTORS
    .map((fn) => fn(state, prev))
    .filter((s): s is DetectedSignal => s !== null);
}
