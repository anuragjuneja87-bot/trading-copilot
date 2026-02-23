/**
 * Feature Assembler — Maps War Room Data → 34-Feature Vector
 *
 * Transforms live data from the app's existing API endpoints into the
 * exact feature vector the LightGBM B→C pipeline expects.
 *
 * Feature groups:
 *   24 base features (from Polygon/panels)
 *    3 boolean features (FOMC/OpEx calendar)
 *    7 interaction features (computed from base)
 *   ──
 *   34 total
 *
 * Missing features are passed as null — the model handles NaN gracefully.
 */

import { getCalendarFeatures } from './fomc-calendar';

// ─── Types ───────────────────────────────────────────────────────────

/** Snapshot of all war room data at a point in time */
export interface WarRoomSnapshot {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;

  // From options flow panel
  flow: {
    stats: {
      totalCallPremium?: number;
      totalPutPremium?: number;
      callRatio?: number;
      putRatio?: number;
      netDeltaAdjustedFlow?: number;
      tradeCount?: number;
      sweepRatio?: number;
      unusualCount?: number;
      gexByStrike?: Array<{
        strike: number;
        callPremium?: number;
        putPremium?: number;
        netGex?: number;
      }>;
    } | null;
  };

  // From dark pool panel
  darkpool: {
    stats: {
      printCount?: number;
      totalVolume?: number;
      bullishPct?: number;
      bearishPct?: number;
      blockCount?: number;
      avgVolume20d?: number;
    } | null;
  };

  // From levels/gamma panel
  levels: {
    callWall: number | null;
    putWall: number | null;
    vwap: number | null;
  };

  // From relative strength panel
  relativeStrength: {
    rsVsSpy?: number;
    tickerChange?: number;
    spyChange?: number;
  } | null;

  // From premarket data
  preMarketData: {
    gap: number;
    volumeRatio: number;
    preMarketVolume: number;
    avgPreMarketVolume: number;
  } | null;

  // Volume data (from prices API or volume panel)
  volume?: {
    current?: number;
    avg20d?: number;
  };

  // Price bars for momentum calculation
  recentBars?: Array<{
    timestamp: number;
    close: number;
    high: number;
    low: number;
    volume: number;
  }>;
}

/** Market regime data (cached daily — VIX, yields, etc.) */
export interface MarketRegimeData {
  vix_level?: number;
  vix_percentile_252d?: number;
  vix_term_structure?: number;
  yield_10y?: number;
  yield_curve_spread?: number;
  inflation_trend?: number;
}

/** The 34-feature vector the ML endpoint expects */
export interface FeatureVector {
  // Base features (24)
  volume_vs_20d_avg: number | null;
  price_vs_vwap_pct: number | null;
  relative_strength_vs_spy: number | null;
  intraday_range_pct: number | null;
  momentum_30m: number | null;
  momentum_1h: number | null;
  gap_pct: number | null;
  short_volume_ratio: number | null;
  dark_pool_pct: number | null;
  block_trade_ratio: number | null;
  premarket_volume_ratio: number | null;
  premarket_change_pct: number | null;
  premarket_range_pct: number | null;
  vix_level: number | null;
  vix_percentile_252d: number | null;
  vix_term_structure: number | null;
  yield_10y: number | null;
  yield_curve_spread: number | null;
  inflation_trend: number | null;
  days_to_next_fomc: number;
  day_of_week: number;
  time_of_day_bucket: number;
  call_wall_distance_pct: number | null;
  put_wall_distance_pct: number | null;

  // Bool features (3)
  is_fomc_day: number;
  is_fomc_week: number;
  is_opex_week: number;

  // Interaction features (7)
  momentum_x_vix: number | null;
  momentum_x_range: number | null;
  gap_x_pm_volume: number | null;
  gap_x_pm_range: number | null;
  vwap_x_volume: number | null;
  rs_x_momentum: number | null;
  pm_change_x_gap: number | null;
}

// ─── Feature Assembly ────────────────────────────────────────────────

/**
 * Assemble the 34-feature vector from war room data.
 *
 * @param snapshot - Current war room state
 * @param regime  - Daily market regime data (VIX, yields — can be null)
 * @returns Feature vector + metadata about completeness
 */
export function assembleFeatures(
  snapshot: WarRoomSnapshot,
  regime?: MarketRegimeData | null
): { features: FeatureVector; completeness: string; availableCount: number } {
  const { price } = snapshot;

  // ── Calendar features (always available) ──
  const calendar = getCalendarFeatures();

  // ── Volume vs 20d average ──
  const volume_vs_20d_avg = computeVolumeRatio(snapshot);

  // ── Price vs VWAP ──
  const price_vs_vwap_pct =
    snapshot.levels.vwap && price
      ? ((price - snapshot.levels.vwap) / snapshot.levels.vwap) * 100
      : null;

  // ── Relative strength vs SPY ──
  const relative_strength_vs_spy = snapshot.relativeStrength?.rsVsSpy ?? null;

  // ── Intraday range ──
  const intraday_range_pct = computeIntradayRange(snapshot);

  // ── Momentum (30m, 1h) ──
  const { momentum_30m, momentum_1h } = computeMomentum(snapshot);

  // ── Gap ──
  const gap_pct = snapshot.preMarketData?.gap ?? snapshot.changePercent ?? null;

  // ── Short volume ratio (not available in app — pass null) ──
  const short_volume_ratio: number | null = null;

  // ── Dark pool features ──
  const dpStats = snapshot.darkpool.stats;
  const dark_pool_pct = dpStats?.totalVolume && snapshot.volume?.current
    ? (dpStats.totalVolume / snapshot.volume.current) * 100
    : dpStats?.bullishPct != null
      ? dpStats.bullishPct + (dpStats.bearishPct ?? 0)
      : null;

  const block_trade_ratio =
    dpStats?.blockCount != null && dpStats?.printCount
      ? dpStats.blockCount / dpStats.printCount
      : null;

  // ── Premarket features ──
  const premarket_volume_ratio = snapshot.preMarketData?.volumeRatio ?? null;
  const premarket_change_pct = snapshot.preMarketData?.gap ?? null;
  const premarket_range_pct: number | null = null; // Need PM high/low

  // ── Market regime (from daily cache) ──
  const vix_level = regime?.vix_level ?? null;
  const vix_percentile_252d = regime?.vix_percentile_252d ?? null;
  const vix_term_structure = regime?.vix_term_structure ?? null;
  const yield_10y = regime?.yield_10y ?? null;
  const yield_curve_spread = regime?.yield_curve_spread ?? null;
  const inflation_trend = regime?.inflation_trend ?? null;

  // ── Options levels distance ──
  const call_wall_distance_pct =
    snapshot.levels.callWall && price
      ? ((snapshot.levels.callWall - price) / price) * 100
      : null;

  const put_wall_distance_pct =
    snapshot.levels.putWall && price
      ? ((snapshot.levels.putWall - price) / price) * 100
      : null;

  // ── Interaction features (computed from base) ──
  const momentum_x_vix = safeMultiply(momentum_30m, vix_percentile_252d);
  const momentum_x_range = safeMultiply(momentum_30m, intraday_range_pct);
  const gap_x_pm_volume = safeMultiply(gap_pct, premarket_volume_ratio);
  const gap_x_pm_range = safeMultiply(gap_pct, premarket_range_pct);
  const vwap_x_volume = safeMultiply(price_vs_vwap_pct, volume_vs_20d_avg);
  const rs_x_momentum = safeMultiply(relative_strength_vs_spy, momentum_1h);
  const pm_change_x_gap = safeMultiply(premarket_change_pct, gap_pct);

  const features: FeatureVector = {
    volume_vs_20d_avg,
    price_vs_vwap_pct,
    relative_strength_vs_spy,
    intraday_range_pct,
    momentum_30m,
    momentum_1h,
    gap_pct,
    short_volume_ratio,
    dark_pool_pct,
    block_trade_ratio,
    premarket_volume_ratio,
    premarket_change_pct,
    premarket_range_pct,
    vix_level,
    vix_percentile_252d,
    vix_term_structure,
    yield_10y,
    yield_curve_spread,
    inflation_trend,
    days_to_next_fomc: calendar.days_to_next_fomc,
    day_of_week: calendar.day_of_week,
    time_of_day_bucket: calendar.time_of_day_bucket,
    call_wall_distance_pct,
    put_wall_distance_pct,
    is_fomc_day: calendar.is_fomc_day,
    is_fomc_week: calendar.is_fomc_week,
    is_opex_week: calendar.is_opex_week,
    momentum_x_vix,
    momentum_x_range,
    gap_x_pm_volume,
    gap_x_pm_range,
    vwap_x_volume,
    rs_x_momentum,
    pm_change_x_gap,
  };

  // Count non-null features
  const values = Object.values(features);
  const availableCount = values.filter(v => v !== null && v !== undefined).length;
  const completeness = `${availableCount}/${values.length}`;

  return { features, completeness, availableCount };
}

// ─── Helpers ─────────────────────────────────────────────────────────

function safeMultiply(a: number | null, b: number | null): number | null {
  if (a == null || b == null) return null;
  return a * b;
}

function computeVolumeRatio(snapshot: WarRoomSnapshot): number | null {
  if (snapshot.volume?.current && snapshot.volume?.avg20d && snapshot.volume.avg20d > 0) {
    return snapshot.volume.current / snapshot.volume.avg20d;
  }
  // Fallback: use dark pool stats if available
  if (snapshot.darkpool.stats?.totalVolume && snapshot.darkpool.stats?.avgVolume20d) {
    return snapshot.darkpool.stats.totalVolume / snapshot.darkpool.stats.avgVolume20d;
  }
  return null;
}

function computeIntradayRange(snapshot: WarRoomSnapshot): number | null {
  if (!snapshot.recentBars?.length || !snapshot.price) return null;

  let dayHigh = -Infinity;
  let dayLow = Infinity;

  for (const bar of snapshot.recentBars) {
    if (bar.high > dayHigh) dayHigh = bar.high;
    if (bar.low < dayLow) dayLow = bar.low;
  }

  if (dayHigh === -Infinity || dayLow === Infinity) return null;
  return ((dayHigh - dayLow) / snapshot.price) * 100;
}

function computeMomentum(
  snapshot: WarRoomSnapshot
): { momentum_30m: number | null; momentum_1h: number | null } {
  if (!snapshot.recentBars?.length || !snapshot.price) {
    return { momentum_30m: null, momentum_1h: null };
  }

  const now = Date.now();
  const bars = snapshot.recentBars.sort((a, b) => a.timestamp - b.timestamp);

  // Find price ~30min ago
  const thirtyMinAgo = now - 30 * 60 * 1000;
  const bar30m = bars.find(b => b.timestamp <= thirtyMinAgo);
  const momentum_30m =
    bar30m && bar30m.close > 0
      ? ((snapshot.price - bar30m.close) / bar30m.close) * 100
      : null;

  // Find price ~1h ago
  const oneHourAgo = now - 60 * 60 * 1000;
  const bar1h = bars.find(b => b.timestamp <= oneHourAgo);
  const momentum_1h =
    bar1h && bar1h.close > 0
      ? ((snapshot.price - bar1h.close) / bar1h.close) * 100
      : null;

  return { momentum_30m, momentum_1h };
}

// ─── Feature Names (for logging/debugging) ──────────────────────────

export const FEATURE_NAMES = [
  'volume_vs_20d_avg', 'price_vs_vwap_pct', 'relative_strength_vs_spy',
  'intraday_range_pct', 'momentum_30m', 'momentum_1h', 'gap_pct',
  'short_volume_ratio', 'dark_pool_pct', 'block_trade_ratio',
  'premarket_volume_ratio', 'premarket_change_pct', 'premarket_range_pct',
  'vix_level', 'vix_percentile_252d', 'vix_term_structure',
  'yield_10y', 'yield_curve_spread', 'inflation_trend',
  'days_to_next_fomc', 'day_of_week', 'time_of_day_bucket',
  'call_wall_distance_pct', 'put_wall_distance_pct',
  'is_fomc_day', 'is_fomc_week', 'is_opex_week',
  'momentum_x_vix', 'momentum_x_range',
  'gap_x_pm_volume', 'gap_x_pm_range',
  'vwap_x_volume', 'rs_x_momentum', 'pm_change_x_gap',
] as const;
