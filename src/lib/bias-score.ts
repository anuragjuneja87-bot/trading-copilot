/**
 * Weighted Directional Bias Score
 * 
 * Computes a 0-100 score where:
 * - 50 = neutral
 * - >60 = bullish
 * - <40 = bearish
 * 
 * Uses raw numeric data from all signal sources, weighted by reliability.
 * This is the MOAT scoring algorithm that powers the bias timeline.
 */

export interface BiasInputs {
  // Options flow
  callRatio?: number;       // 0-100 (percentage of calls vs puts)
  sweepRatio?: number;      // 0-1 (fraction of trades that are sweeps)
  netDelta?: number;        // Net delta-adjusted flow (positive = bullish)
  tradeCount?: number;      // Total trades (for confidence)

  // Dark pool
  dpBullishPct?: number;    // 0-100
  dpPrintCount?: number;    // Number of prints (for confidence)

  // Price context
  price?: number;           // Current price
  vwap?: number;            // VWAP level
  changePercent?: number;   // Day change %

  // Volume
  volumePressure?: number;  // -100 to +100

  // Relative strength
  rsVsSpy?: number;         // Relative strength vs SPY

  // GEX context
  gexFlip?: number;         // GEX flip level
  callWall?: number;        // Call wall level
  putWall?: number;         // Put wall level
}

export interface BiasResult {
  score: number;            // 0-100
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  components: BiasComponent[];
}

export interface BiasComponent {
  name: string;
  score: number;            // 0-100 (50=neutral)
  weight: number;           // 0-1
  rawValue: string;         // Human-readable value
}

export function computeBiasScore(inputs: BiasInputs): BiasResult {
  const components: BiasComponent[] = [];

  // ── 1. OPTIONS FLOW (30%) ─────────────────────────────
  // Highest weight: direct institutional intent
  if (inputs.callRatio != null && inputs.tradeCount && inputs.tradeCount > 0) {
    let flowScore = inputs.callRatio; // Already 0-100

    // Boost for sweep activity (institutional urgency)
    if ((inputs.sweepRatio || 0) > 0.1) flowScore = Math.min(100, flowScore + 5);

    // Boost for net delta confirming direction
    if (inputs.netDelta) {
      if (inputs.netDelta > 50000) flowScore = Math.min(100, flowScore + 3);
      else if (inputs.netDelta < -50000) flowScore = Math.max(0, flowScore - 3);
    }

    components.push({
      name: 'Options Flow',
      score: Math.min(100, Math.max(0, flowScore)),
      weight: 0.30,
      rawValue: `${inputs.callRatio.toFixed(0)}% calls`,
    });
  }

  // ── 2. DARK POOL (20%) ────────────────────────────────
  // Institutional block positioning
  if (inputs.dpPrintCount && inputs.dpPrintCount > 0 && inputs.dpBullishPct != null) {
    components.push({
      name: 'Dark Pool',
      score: inputs.dpBullishPct,
      weight: 0.20,
      rawValue: `${inputs.dpBullishPct.toFixed(0)}% bullish`,
    });
  }

  // ── 3. PRICE vs VWAP (20%) ────────────────────────────
  // Key intraday pivot — above VWAP is bullish, below is bearish
  if (inputs.vwap && inputs.price && inputs.price > 0) {
    const vwapDelta = ((inputs.price - inputs.vwap) / inputs.vwap) * 100;
    // Map: -1% below → 20, at VWAP → 50, +1% above → 80
    const vwapScore = Math.min(100, Math.max(0, 50 + vwapDelta * 30));
    components.push({
      name: 'Price vs VWAP',
      score: vwapScore,
      weight: 0.20,
      rawValue: `${vwapDelta >= 0 ? '+' : ''}${vwapDelta.toFixed(2)}%`,
    });
  }

  // ── 4. VOLUME PRESSURE (15%) ──────────────────────────
  // Buy-sell pressure delta confirms direction
  if (inputs.volumePressure !== undefined) {
    const vpScore = Math.min(100, Math.max(0, 50 + (inputs.volumePressure / 2)));
    components.push({
      name: 'Volume',
      score: vpScore,
      weight: 0.15,
      rawValue: `${inputs.volumePressure >= 0 ? '+' : ''}${inputs.volumePressure.toFixed(0)}%`,
    });
  }

  // ── 5. PRICE MOMENTUM (10%) ───────────────────────────
  if (inputs.changePercent !== undefined) {
    const momentumScore = Math.min(100, Math.max(0, 50 + inputs.changePercent * 20));
    components.push({
      name: 'Momentum',
      score: momentumScore,
      weight: 0.10,
      rawValue: `${inputs.changePercent >= 0 ? '+' : ''}${inputs.changePercent.toFixed(2)}%`,
    });
  }

  // ── 6. RELATIVE STRENGTH (5%) ─────────────────────────
  if (inputs.rsVsSpy !== undefined) {
    const rsScore = Math.min(100, Math.max(0, 50 + inputs.rsVsSpy * 15));
    components.push({
      name: 'Rel Strength',
      score: rsScore,
      weight: 0.05,
      rawValue: `${inputs.rsVsSpy >= 0 ? '+' : ''}${inputs.rsVsSpy.toFixed(2)}`,
    });
  }

  // ── AGGREGATE ─────────────────────────────────────────
  if (components.length === 0) {
    return { score: 50, direction: 'NEUTRAL', components: [] };
  }

  // Redistribute weights proportionally for missing components
  const totalWeight = components.reduce((sum, c) => sum + c.weight, 0);
  const weightedScore = components.reduce(
    (sum, c) => sum + c.score * (c.weight / totalWeight), 0
  );
  const finalScore = Math.round(weightedScore);

  const direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL' =
    finalScore >= 60 ? 'BULLISH' : finalScore <= 40 ? 'BEARISH' : 'NEUTRAL';

  return { score: finalScore, direction, components };
}
