/**
 * Weighted Directional Bias Score — v2 (Bull/Bear Pressure Split)
 * 
 * Returns separate bull and bear pressure (0-100 each) for dual-line chart.
 * Also returns composite score (0-100) for the gauge.
 * 
 * Each component is scored 0-100 where 50=neutral.
 *   Bull contribution = clamp(max(0, score - 50) * 3)  → maps [50-100] to [0-100] (amplified)
 *   Bear contribution = clamp(max(0, 50 - score) * 3)  → maps [50-0]   to [0-100] (amplified)
 *   Final pressure = max(componentPressure, scorePressure) for reliable indicator values
 * 
 * Dynamic amplification on tick-sensitive components (VWAP, momentum)
 * ensures the chart moves with price action, not just cumulative stats.
 */

export interface BiasInputs {
  callRatio?: number;       // 0-100
  sweepRatio?: number;      // 0-1
  netDelta?: number;
  tradeCount?: number;
  dpBullishPct?: number;    // 0-100
  dpPrintCount?: number;
  price?: number;
  vwap?: number;
  changePercent?: number;
  volumePressure?: number;  // -100 to +100
  rsVsSpy?: number;
  gexFlip?: number;
  callWall?: number;
  putWall?: number;
}

export interface BiasResult {
  score: number;            // 0-100 composite
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bullPressure: number;     // 0-100 how strong is the bull case
  bearPressure: number;     // 0-100 how strong is the bear case
  components: BiasComponent[];
}

export interface BiasComponent {
  name: string;
  score: number;            // 0-100 (50=neutral)
  weight: number;           // 0-1
  rawValue: string;
  bullContrib: number;      // 0-100
  bearContrib: number;      // 0-100
}

function clamp(v: number): number {
  return Math.min(100, Math.max(0, v));
}

export function computeBiasScore(inputs: BiasInputs): BiasResult {
  const components: BiasComponent[] = [];

  // ── 1. OPTIONS FLOW (25%) ─────────────────────────────
  if (inputs.callRatio != null && inputs.tradeCount && inputs.tradeCount > 0) {
    let flowScore = inputs.callRatio;
    if ((inputs.sweepRatio || 0) > 0.1) flowScore = Math.min(100, flowScore + 5);
    if (inputs.netDelta) {
      if (inputs.netDelta > 50000) flowScore = Math.min(100, flowScore + 3);
      else if (inputs.netDelta < -50000) flowScore = Math.max(0, flowScore - 3);
    }
    const s = clamp(flowScore);
    components.push({
      name: 'Options Flow', score: s, weight: 0.25,
      rawValue: `${inputs.callRatio.toFixed(0)}% calls`,
      bullContrib: clamp(Math.max(0, s - 50) * 3),
      bearContrib: clamp(Math.max(0, 50 - s) * 3),
    });
  }

  // ── 2. DARK POOL (15%) ────────────────────────────────
  if (inputs.dpPrintCount && inputs.dpPrintCount > 0 && inputs.dpBullishPct != null) {
    const s = clamp(inputs.dpBullishPct);
    components.push({
      name: 'Dark Pool', score: s, weight: 0.15,
      rawValue: `${inputs.dpBullishPct.toFixed(0)}% bullish`,
      bullContrib: clamp(Math.max(0, s - 50) * 3),
      bearContrib: clamp(Math.max(0, 50 - s) * 3),
    });
  }

  // ── 3. PRICE vs VWAP (25%) — AMPLIFIED ────────────────
  // Most dynamic intraday signal. ±0.1% is meaningful, ±0.5% is strong.
  if (inputs.vwap && inputs.price && inputs.price > 0) {
    const vwapDelta = ((inputs.price - inputs.vwap) / inputs.vwap) * 100;
    const vwapScore = clamp(50 + vwapDelta * 60);
    components.push({
      name: 'Price vs VWAP', score: vwapScore, weight: 0.25,
      rawValue: `${vwapDelta >= 0 ? '+' : ''}${vwapDelta.toFixed(3)}%`,
      bullContrib: clamp(Math.max(0, vwapScore - 50) * 3),
      bearContrib: clamp(Math.max(0, 50 - vwapScore) * 3),
    });
  }

  // ── 4. VOLUME PRESSURE (15%) ──────────────────────────
  if (inputs.volumePressure !== undefined) {
    const vpScore = clamp(50 + (inputs.volumePressure / 1.5));
    components.push({
      name: 'Volume', score: vpScore, weight: 0.15,
      rawValue: `${inputs.volumePressure >= 0 ? '+' : ''}${inputs.volumePressure.toFixed(0)}%`,
      bullContrib: clamp(Math.max(0, vpScore - 50) * 3),
      bearContrib: clamp(Math.max(0, 50 - vpScore) * 3),
    });
  }

  // ── 5. PRICE MOMENTUM (15%) — AMPLIFIED ───────────────
  if (inputs.changePercent !== undefined) {
    const momScore = clamp(50 + inputs.changePercent * 25);
    components.push({
      name: 'Momentum', score: momScore, weight: 0.15,
      rawValue: `${inputs.changePercent >= 0 ? '+' : ''}${inputs.changePercent.toFixed(2)}%`,
      bullContrib: clamp(Math.max(0, momScore - 50) * 3),
      bearContrib: clamp(Math.max(0, 50 - momScore) * 3),
    });
  }

  // ── 6. RELATIVE STRENGTH (5%) ─────────────────────────
  if (inputs.rsVsSpy !== undefined) {
    const rsScore = clamp(50 + inputs.rsVsSpy * 20);
    components.push({
      name: 'Rel Strength', score: rsScore, weight: 0.05,
      rawValue: `${inputs.rsVsSpy >= 0 ? '+' : ''}${inputs.rsVsSpy.toFixed(2)}`,
      bullContrib: clamp(Math.max(0, rsScore - 50) * 3),
      bearContrib: clamp(Math.max(0, 50 - rsScore) * 3),
    });
  }

  // ── AGGREGATE ─────────────────────────────────────────
  if (components.length === 0) {
    return { score: 50, direction: 'NEUTRAL', bullPressure: 0, bearPressure: 0, components: [] };
  }

  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);

  const finalScore = Math.round(
    components.reduce((sum, c) => sum + c.score * (c.weight / totalWeight), 0)
  );

  // Component-level pressure (per-signal detail)
  const componentBull = Math.round(
    components.reduce((sum, c) => sum + c.bullContrib * (c.weight / totalWeight), 0)
  );
  const componentBear = Math.round(
    components.reduce((sum, c) => sum + c.bearContrib * (c.weight / totalWeight), 0)
  );

  // Score-based pressure (ensures the indicator reflects overall bias)
  const scoreBull = clamp(Math.max(0, finalScore - 50) * 2);
  const scoreBear = clamp(Math.max(0, 50 - finalScore) * 2);

  // Use the higher of component vs score pressure — 
  // so even if individual signals are moderate, a 76% composite shows strong bull
  const bullPressure = clamp(Math.max(componentBull, scoreBull));
  const bearPressure = clamp(Math.max(componentBear, scoreBear));

  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    finalScore >= 60 ? 'BULLISH' : finalScore <= 40 ? 'BEARISH' : 'NEUTRAL';

  return { score: finalScore, direction, bullPressure, bearPressure, components };
}
