'use client';

import { useMemo, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import type { EnhancedOptionTrade } from '@/types/flow';
import type { DarkPoolPrint } from '@/types/darkpool';

/* ════════════════════════════════════════════════════════════════
   CONFLUENCE INDICATOR v4

   Row 1: Compressed signal pills (quality-gated, same logic as v2)
   Row 2: AGGREGATED unusual signals — not raw prints

   Aggregation logic (proprietary moat):
   1. SWEEP CLUSTER — ≥2 sweeps at same strike within window
   2. FLOW MOMENTUM — call/put premium ratio extreme (>70%)
   3. DP ACCUMULATION — ≥2 dark pool prints near same price
   4. PREMIUM SPIKE — single trade ≥ 2× average trade size
   5. DIRECTIONAL PRESSURE — rolling bull/bear activity ratio

   "LIVE" label only during market hours. "SESSION" when closed.
   ════════════════════════════════════════════════════════════════ */

// ── Types ─────────────────────────────────────────────────────

interface Signal {
  name: string;
  shortName: string;
  status: 'bullish' | 'bearish' | 'neutral' | 'no_data';
  value: string;
  shortValue: string;
  quality: 'high' | 'low' | 'none';
}

interface AggSignal {
  id: string;
  icon: string;
  type: string;
  typeBg: string;
  typeColor: string;
  text: string;
  detail: string;
  isBullish: boolean;
}

interface ConfluenceIndicatorProps {
  flowStats: any;
  darkPoolStats: any;
  volumePressure: number;
  priceVsGexFlip: 'above' | 'below';
  currentPrice: number;
  vwap: number | null;
  relativeStrength: any;
  mlPrediction: any;
  ticker: string;
  marketSession?: 'pre-market' | 'open' | 'after-hours' | 'closed';
  trades?: EnhancedOptionTrade[];
  prints?: DarkPoolPrint[];
}

// ── Colors ────────────────────────────────────────────────────

const K = {
  green: '#00dc82',   greenDim: 'rgba(0,220,130,0.12)',
  red: '#ff4757',     redDim: 'rgba(255,71,87,0.12)',
  yellow: '#fbbf24',  yellowDim: 'rgba(251,191,36,0.1)',
  cyan: '#00e5ff',    cyanDim: 'rgba(0,229,255,0.1)',
  purple: '#a78bfa',  purpleDim: 'rgba(167,139,250,0.12)',
  muted: 'rgba(255,255,255,0.15)',
  textPrimary: '#e8eaf0',
  textMuted: 'rgba(255,255,255,0.25)',
  border: 'rgba(255,255,255,0.06)',
  borderSubtle: 'rgba(255,255,255,0.04)',
  cardBg: '#0c1018',
  font: "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace",
};

const DOT_COLORS: Record<string, string> = {
  bullish: K.green, bearish: K.red, neutral: K.yellow, no_data: K.muted,
};

const FLOW_MIN_TRADES = 5, FLOW_MIN_PREMIUM = 50000, FLOW_HIGH_TRADES = 20, FLOW_HIGH_PREMIUM = 500000;
const DP_MIN_PRINTS = 5, DP_HIGH_PRINTS = 10, DP_HIGH_VALUE = 5000000;

function fmtK(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

// ── Component ─────────────────────────────────────────────────

export function ConfluenceIndicator({
  flowStats, darkPoolStats, volumePressure, priceVsGexFlip,
  currentPrice, vwap, relativeStrength, mlPrediction, ticker,
  marketSession, trades = [], prints = [],
}: ConfluenceIndicatorProps) {

  const isClosed = marketSession === 'closed' || marketSession === 'after-hours';
  const isLive = marketSession === 'open';
  const isPre = marketSession === 'pre-market';
  const isIndex = ['SPY', 'QQQ', 'IWM', 'DIA'].includes(ticker?.toUpperCase());
  const [isPaused, setIsPaused] = useState(false);

  // ── Build signals (same quality-gated logic) ────────────────

  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];

    // 1. OPTIONS FLOW
    const callRatio = flowStats?.callRatio;
    const flowTradeCount = flowStats?.tradeCount || flowStats?.totalTrades || 0;
    const flowPremium = (flowStats?.callPremium || 0) + (flowStats?.putPremium || 0) || flowStats?.totalPremium || 0;
    const hasFlowData = callRatio !== undefined && callRatio !== null && flowTradeCount > 0;
    if (hasFlowData && flowTradeCount >= FLOW_MIN_TRADES && flowPremium >= FLOW_MIN_PREMIUM) {
      const quality = (flowTradeCount >= FLOW_HIGH_TRADES && flowPremium >= FLOW_HIGH_PREMIUM) ? 'high' : 'low';
      result.push({ name: 'Options Flow', shortName: 'Flow', status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral', value: `${callRatio.toFixed(0)}% calls`, shortValue: `${callRatio.toFixed(0)}%C`, quality });
    } else if (hasFlowData && flowTradeCount > 0) {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: 'no_data', value: `${callRatio.toFixed(0)}% (thin)`, shortValue: 'thin', quality: 'none' });
    } else {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 2. VOLUME PRESSURE
    if (volumePressure !== undefined && volumePressure !== null && !isNaN(volumePressure) && volumePressure !== 0) {
      result.push({ name: 'Volume Pressure', shortName: 'Vol', status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral', value: `${volumePressure > 0 ? '+' : ''}${volumePressure.toFixed(0)}%`, shortValue: `${volumePressure > 0 ? '+' : ''}${volumePressure.toFixed(0)}%`, quality: 'high' });
    } else {
      result.push({ name: 'Volume Pressure', shortName: 'Vol', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 3. DARK POOL
    const dpPrintCount = darkPoolStats?.printCount || 0;
    const dpBullish = darkPoolStats?.bullishPct;
    const dpTotalValue = darkPoolStats?.totalValue || (darkPoolStats?.bullishValue || 0) + (darkPoolStats?.bearishValue || 0) || 0;
    const hasDpData = dpPrintCount > 0 && dpBullish !== undefined && dpBullish !== null;
    if (hasDpData && dpPrintCount >= DP_MIN_PRINTS) {
      const quality = (dpPrintCount >= DP_HIGH_PRINTS && dpTotalValue >= DP_HIGH_VALUE) ? 'high' : 'low';
      result.push({ name: 'Dark Pool', shortName: 'DP', status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral', value: dpBullish < 45 ? `${(100 - dpBullish).toFixed(0)}% sell` : `${dpBullish.toFixed(0)}% buy`, shortValue: dpBullish < 45 ? `${(100 - dpBullish).toFixed(0)}%↓` : `${dpBullish.toFixed(0)}%↑`, quality });
    } else if (hasDpData && dpPrintCount > 0) {
      result.push({ name: 'Dark Pool', shortName: 'DP', status: 'no_data', value: `${dpPrintCount}p (thin)`, shortValue: 'thin', quality: 'none' });
    } else {
      result.push({ name: 'Dark Pool', shortName: 'DP', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 4. GEX
    result.push({ name: 'GEX Position', shortName: 'GEX', status: priceVsGexFlip === 'above' ? 'bullish' : 'bearish', value: priceVsGexFlip === 'above' ? 'Above flip' : 'Below flip', shortValue: priceVsGexFlip === 'above' ? '+γ' : '−γ', quality: 'high' });

    // 5. VWAP
    if (vwap && currentPrice && vwap > 0) {
      const vwapDist = ((currentPrice - vwap) / vwap) * 100;
      const bps = Math.round(Math.abs(vwapDist) * 100);
      result.push({ name: 'VWAP Position', shortName: 'VWAP', status: vwapDist > 0.1 ? 'bullish' : vwapDist < -0.1 ? 'bearish' : 'neutral', value: `${vwapDist >= 0 ? '+' : ''}${vwapDist.toFixed(2)}%`, shortValue: `${vwapDist < 0 ? '-' : '+'}${bps}bp`, quality: 'high' });
    } else {
      result.push({ name: 'VWAP Position', shortName: 'VWAP', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 6. RELATIVE STRENGTH
    if (!isIndex && relativeStrength?.rsVsSpy !== undefined) {
      const rs = relativeStrength.rsVsSpy;
      const regime = relativeStrength.regime;
      const isStrong = regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM' || rs > 0.5;
      const isWeak = regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM' || rs < -0.5;
      result.push({ name: 'Relative Strength', shortName: 'RS', status: isStrong ? 'bullish' : isWeak ? 'bearish' : 'neutral', value: `${rs >= 0 ? '+' : ''}${rs.toFixed(1)} vs SPY`, shortValue: `${rs >= 0 ? '+' : ''}${rs.toFixed(1)}`, quality: 'high' });
    } else if (isIndex) {
      result.push({ name: 'Relative Strength', shortName: 'RS', status: 'no_data', value: 'Index', shortValue: '—', quality: 'none' });
    } else {
      result.push({ name: 'Relative Strength', shortName: 'RS', status: 'no_data', value: 'No data', shortValue: '—', quality: 'none' });
    }

    // 7. ML
    if (mlPrediction?.direction) {
      const dir = mlPrediction.direction.toLowerCase();
      const prob = mlPrediction.probability || mlPrediction.confidence || 0;
      const probPct = prob > 1 ? prob : Math.round(prob * 100);
      const isBullish = dir === 'bullish' || dir === 'up' || dir === 'long';
      const isBearish = dir === 'bearish' || dir === 'down' || dir === 'short';
      result.push({ name: 'ML Prediction', shortName: 'ML', status: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral', value: `${isBullish ? '↑' : isBearish ? '↓' : '—'} ${probPct}%`, shortValue: `${isBullish ? '↑' : isBearish ? '↓' : '—'}${probPct}%`, quality: 'high' });
    } else {
      result.push({ name: 'ML Prediction', shortName: 'ML', status: 'no_data', value: isClosed ? 'Closed' : 'Loading', shortValue: '—', quality: 'none' });
    }

    return result;
  }, [flowStats, darkPoolStats, volumePressure, priceVsGexFlip, currentPrice, vwap, relativeStrength, mlPrediction, isClosed, isIndex]);

  // ── Verdict ─────────────────────────────────────────────────

  const score = useMemo(() => {
    const qualityActive = signals.filter(s => s.status !== 'no_data' && s.quality !== 'none');
    const bullish = qualityActive.filter(s => s.status === 'bullish').length;
    const bearish = qualityActive.filter(s => s.status === 'bearish').length;
    const total = qualityActive.length;
    const spread = bullish - bearish;
    let label: string, color: string;
    if (total < 2)        { label = 'LOW DATA'; color = '#555'; }
    else if (spread >= 4) { label = 'STRONG BULL'; color = K.green; }
    else if (spread >= 2) { label = 'BULLISH'; color = K.green; }
    else if (spread >= 1) { label = 'LEAN BULL'; color = K.green; }
    else if (spread <= -4){ label = 'STRONG BEAR'; color = K.red; }
    else if (spread <= -2){ label = 'BEARISH'; color = K.red; }
    else if (spread <= -1){ label = 'LEAN BEAR'; color = K.red; }
    else                  { label = 'NEUTRAL'; color = K.yellow; }
    return { bullish, bearish, total, label, color };
  }, [signals]);

  // ══════════════════════════════════════════════════════════════
  //  AGGREGATED UNUSUAL SIGNALS — the moat
  // ══════════════════════════════════════════════════════════════

  const aggSignals = useMemo((): AggSignal[] => {
    const result: AggSignal[] = [];

    // ── 1. SWEEP CLUSTERS ──
    // Group sweeps by strike, detect ≥2 at same strike
    if (trades?.length) {
      const sweeps = trades.filter(t =>
        (t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep)
        && (t.premium || 0) >= 5000  // filter junk sweeps under $5K
      );

      if (sweeps.length > 0) {
        const byStrike: Record<string, { count: number; totalPrem: number; cp: string; strikes: number[] }> = {};
        for (const s of sweeps) {
          const key = `${s.strike}-${s.callPut}`;
          if (!byStrike[key]) byStrike[key] = { count: 0, totalPrem: 0, cp: s.callPut, strikes: [] };
          byStrike[key].count++;
          byStrike[key].totalPrem += s.premium || 0;
        }

        // Report clusters (≥2 sweeps at same strike)
        for (const [key, data] of Object.entries(byStrike)) {
          if (data.count >= 2) {
            const strike = key.split('-')[0];
            result.push({
              id: `sweep-cluster-${key}`,
              icon: '🔥',
              type: 'SWEEP CLUSTER',
              typeBg: K.cyanDim, typeColor: K.cyan,
              text: `$${strike}${data.cp} ×${data.count} sweeps`,
              detail: fmtK(data.totalPrem),
              isBullish: data.cp === 'C',
            });
          }
        }

        // If any sweeps exist but no clusters, report total sweep activity
        if (result.filter(r => r.type === 'SWEEP CLUSTER').length === 0 && sweeps.length >= 2) {
          const totalSweepPrem = sweeps.reduce((s, t) => s + (t.premium || 0), 0);
          const sweepCalls = sweeps.filter(s => s.callPut === 'C').length;
          const sweepPuts = sweeps.length - sweepCalls;
          result.push({
            id: 'sweep-activity',
            icon: '⚡',
            type: 'SWEEP ACTIVITY',
            typeBg: K.cyanDim, typeColor: K.cyan,
            text: `${sweeps.length} sweeps (${sweepCalls}C/${sweepPuts}P)`,
            detail: fmtK(totalSweepPrem),
            isBullish: sweepCalls > sweepPuts,
          });
        }
      }
    }

    // ── 2. FLOW MOMENTUM ──
    // Check call/put premium ratio — report if extreme
    if (trades?.length >= 3) {
      const callPrem = trades.filter(t => t.callPut === 'C').reduce((s, t) => s + (t.premium || 0), 0);
      const putPrem = trades.filter(t => t.callPut === 'P').reduce((s, t) => s + (t.premium || 0), 0);
      const totalPrem = callPrem + putPrem;

      if (totalPrem > 0) {
        const callPct = (callPrem / totalPrem) * 100;
        if (callPct >= 75) {
          result.push({
            id: 'flow-momentum-bull',
            icon: '📈',
            type: 'CALL DOMINANCE',
            typeBg: K.greenDim, typeColor: K.green,
            text: `${callPct.toFixed(0)}% call premium`,
            detail: `${fmtK(callPrem)} vs ${fmtK(putPrem)}`,
            isBullish: true,
          });
        } else if (callPct <= 25) {
          result.push({
            id: 'flow-momentum-bear',
            icon: '📉',
            type: 'PUT DOMINANCE',
            typeBg: K.redDim, typeColor: K.red,
            text: `${(100 - callPct).toFixed(0)}% put premium`,
            detail: `${fmtK(putPrem)} vs ${fmtK(callPrem)}`,
            isBullish: false,
          });
        }
      }
    }

    // ── 3. DP ACCUMULATION / DISTRIBUTION ──
    // Group prints by price level (within $0.25), detect clusters
    if (prints?.length >= 2) {
      const priceBuckets: Record<string, { count: number; totalValue: number; avgPrice: number; prices: number[] }> = {};

      for (const p of prints) {
        // Round to nearest $0.25 for clustering
        const bucketPrice = Math.round(p.price * 4) / 4;
        const key = bucketPrice.toFixed(2);
        if (!priceBuckets[key]) priceBuckets[key] = { count: 0, totalValue: 0, avgPrice: 0, prices: [] };
        priceBuckets[key].count++;
        priceBuckets[key].totalValue += p.value || (p.price * p.size);
        priceBuckets[key].prices.push(p.price);
      }

      // Report price clusters (≥2 prints near same level)
      const clusters = Object.entries(priceBuckets)
        .filter(([, data]) => data.count >= 2)
        .sort(([, a], [, b]) => b.totalValue - a.totalValue);

      if (clusters.length > 0) {
        const [priceKey, data] = clusters[0]; // Top cluster
        const avgPrice = data.prices.reduce((a, b) => a + b, 0) / data.prices.length;
        const isAboveVwap = vwap ? avgPrice >= vwap : true;
        result.push({
          id: `dp-cluster-${priceKey}`,
          icon: '🏦',
          type: isAboveVwap ? 'DP ACCUMULATION' : 'DP DISTRIBUTION',
          typeBg: isAboveVwap ? K.greenDim : K.redDim,
          typeColor: isAboveVwap ? K.green : K.red,
          text: `×${data.count} prints near $${avgPrice.toFixed(2)}`,
          detail: fmtK(data.totalValue),
          isBullish: isAboveVwap,
        });
      }

      // Overall DP summary if no clusters
      if (clusters.length === 0 && prints.length >= 3) {
        const totalValue = prints.reduce((s, p) => s + (p.value || p.price * p.size), 0);
        const aboveVwapCount = vwap ? prints.filter(p => p.price >= vwap).length : prints.length;
        const aboveVwapPct = Math.round((aboveVwapCount / prints.length) * 100);
        result.push({
          id: 'dp-summary',
          icon: '🏦',
          type: aboveVwapPct >= 60 ? 'DP BUYING' : aboveVwapPct <= 40 ? 'DP SELLING' : 'DP MIXED',
          typeBg: aboveVwapPct >= 60 ? K.greenDim : aboveVwapPct <= 40 ? K.redDim : K.yellowDim,
          typeColor: aboveVwapPct >= 60 ? K.green : aboveVwapPct <= 40 ? K.red : K.yellow,
          text: `${aboveVwapPct}% above VWAP — ${prints.length} prints`,
          detail: fmtK(totalValue),
          isBullish: aboveVwapPct >= 60,
        });
      }
    }

    // ── 4. PREMIUM SPIKE ──
    // Detect single trade > 2× average premium
    if (trades?.length >= 5) {
      const premiums = trades.map(t => t.premium || 0).filter(p => p > 0);
      const avgPrem = premiums.reduce((a, b) => a + b, 0) / premiums.length;

      const spikes = trades.filter(t => (t.premium || 0) > avgPrem * 2 && (t.premium || 0) > 10000);
      if (spikes.length > 0) {
        const biggest = spikes.sort((a, b) => (b.premium || 0) - (a.premium || 0))[0];
        const multiple = Math.round((biggest.premium || 0) / avgPrem);
        result.push({
          id: `spike-${biggest.id || biggest.timestampMs}`,
          icon: '💥',
          type: 'PREMIUM SPIKE',
          typeBg: K.yellowDim, typeColor: K.yellow,
          text: `$${biggest.strike}${biggest.callPut} — ${multiple}× avg size`,
          detail: fmtK(biggest.premium || 0),
          isBullish: biggest.callPut === 'C',
        });
      }
    }

    // ── 5. DIRECTIONAL PRESSURE ──
    // If 80%+ of all premium is one direction, that's a signal
    if (trades?.length >= 5) {
      const totalCallPrem = trades.filter(t => t.callPut === 'C').reduce((s, t) => s + (t.premium || 0), 0);
      const totalPutPrem = trades.filter(t => t.callPut === 'P').reduce((s, t) => s + (t.premium || 0), 0);
      const total = totalCallPrem + totalPutPrem;

      if (total > 0) {
        const callPct = (totalCallPrem / total) * 100;
        // Only show if we didn't already show CALL/PUT DOMINANCE
        const hasDominance = result.some(r => r.type === 'CALL DOMINANCE' || r.type === 'PUT DOMINANCE');
        if (!hasDominance && (callPct >= 65 || callPct <= 35)) {
          const isBull = callPct >= 65;
          result.push({
            id: 'directional-pressure',
            icon: isBull ? '🟢' : '🔴',
            type: isBull ? 'CALL PRESSURE' : 'PUT PRESSURE',
            typeBg: isBull ? K.greenDim : K.redDim,
            typeColor: isBull ? K.green : K.red,
            text: `${isBull ? callPct.toFixed(0) : (100 - callPct).toFixed(0)}% ${isBull ? 'call' : 'put'} flow — ${trades.length} trades`,
            detail: fmtK(isBull ? totalCallPrem : totalPutPrem),
            isBullish: isBull,
          });
        }
      }
    }

    // ── 6. QUIET MARKET ──
    // If nothing unusual detected, say so explicitly
    if (result.length === 0) {
      if (trades?.length || prints?.length) {
        result.push({
          id: 'quiet',
          icon: '😴',
          type: 'QUIET',
          typeBg: 'rgba(255,255,255,0.04)', typeColor: 'rgba(255,255,255,0.3)',
          text: `No unusual activity — ${trades?.length || 0} trades, ${prints?.length || 0} DP prints`,
          detail: 'Normal flow',
          isBullish: true,
        });
      }
    }

    return result;
  }, [trades, prints, vwap]);

  // ── Pip colors ──────────────────────────────────────────────

  const pips = useMemo(() => signals.map(s => {
    if (s.status === 'bullish') return 'bull';
    if (s.status === 'bearish') return 'bear';
    if (s.status === 'neutral') return 'neutral';
    return 'empty';
  }), [signals]);

  const scrollDuration = useMemo(() => {
    const count = aggSignals.length;
    return count <= 2 ? 20 : count <= 4 ? 30 : 40;
  }, [aggSignals.length]);

  // ── Session label ───────────────────────────────────────────

  const activityLabel = isLive ? 'LIVE' : isPre ? 'PRE' : 'SESSION';
  const activityLabelColor = isLive ? 'rgba(0,229,255,0.6)' : isPre ? 'rgba(251,191,36,0.5)' : 'rgba(255,255,255,0.2)';

  // ── Render ──────────────────────────────────────────────────

  return (
    <div style={{
      background: K.cardBg,
      border: `1px solid ${K.border}`,
      borderRadius: 10,
      overflow: 'hidden',
      fontFamily: K.font,
    }}>
      {/* ═══ ROW 1: Compressed Confluence Signals ═══ */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '8px 14px', gap: 2,
        borderBottom: `1px solid ${K.borderSubtle}`,
      }}>
        {/* Bias badge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 12px', borderRadius: 6,
          fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
          marginRight: 8, flexShrink: 0,
          background: `${score.color}18`, border: `1px solid ${score.color}35`, color: score.color,
        }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: score.color, boxShadow: `0 0 6px ${score.color}70` }} />
          {score.label}
        </div>

        {/* Signal pills */}
        {signals.map((s, i) => {
          const dotColor = DOT_COLORS[s.status];
          const isActive = s.status !== 'no_data';
          return (
            <div key={i} title={`${s.name}: ${s.value}${s.quality === 'low' ? ' (thin data)' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 4,
                fontSize: 10, fontWeight: 600,
                background: 'rgba(255,255,255,0.03)',
                cursor: 'default', whiteSpace: 'nowrap' as const,
              }}>
              <div style={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: dotColor, opacity: isActive ? 1 : 0.3,
                boxShadow: isActive ? `0 0 4px ${dotColor}50` : 'none',
              }} />
              <span style={{ color: K.textMuted, fontWeight: 500 }}>{s.shortName}</span>
              <span style={{ fontWeight: 700, color: isActive ? dotColor : K.textMuted }}>{s.shortValue}</span>
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        {/* Score pips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {pips.map((p, i) => (
              <div key={i} style={{
                width: 4, height: 14, borderRadius: 2,
                background: p === 'bull' ? 'rgba(0,220,130,0.5)' : p === 'bear' ? 'rgba(255,71,87,0.5)' : p === 'neutral' ? 'rgba(251,191,36,0.35)' : 'rgba(255,255,255,0.08)',
              }} />
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: K.textMuted }}>
            <span style={{ color: K.green, fontWeight: 700 }}>{score.bullish}</span>{' bull '}
            <span style={{ color: K.red, fontWeight: 700 }}>{score.bearish}</span>{' bear'}
          </div>
        </div>

        {/* Session chip */}
        {isClosed && <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, background: K.redDim, color: K.red, border: '1px solid rgba(255,71,87,0.15)', flexShrink: 0 }}>CLOSED</div>}
        {isLive && <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, background: K.greenDim, color: K.green, border: '1px solid rgba(0,220,130,0.15)', flexShrink: 0 }}>LIVE</div>}
        {isPre && <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, letterSpacing: 0.5, background: K.yellowDim, color: K.yellow, border: '1px solid rgba(251,191,36,0.12)', flexShrink: 0 }}>PRE</div>}
      </div>

      {/* ═══ ROW 2: Aggregated Unusual Signals ═══ */}
      <div
        style={{
          display: 'flex', alignItems: 'center',
          padding: '6px 14px', gap: 8,
          overflow: 'hidden',
        }}
        onMouseEnter={() => setIsPaused(true)}
        onMouseLeave={() => setIsPaused(false)}
      >
        {/* Session-aware label */}
        <div style={{
          fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
          color: activityLabelColor,
          textTransform: 'uppercase' as const,
          flexShrink: 0, paddingRight: 8,
          borderRight: `1px solid ${K.border}`,
          minWidth: 42,
        }}>
          {activityLabel}
        </div>

        {/* Scrolling aggregated signals */}
        {aggSignals.length > 0 ? (
          <div style={{
            flex: 1, overflow: 'hidden', position: 'relative' as const,
            maskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 2%, black 98%, transparent)',
          }}>
            <div style={{
              display: 'flex', gap: 12, width: 'max-content',
              animation: aggSignals.length > 2 ? `confluenceScroll ${scrollDuration}s linear infinite` : 'none',
              animationPlayState: isPaused ? 'paused' : 'running',
            }}>
              {/* Render twice for loop if scrolling */}
              {(aggSignals.length > 2 ? [...aggSignals, ...aggSignals] : aggSignals).map((sig, i) => (
                <div key={`${sig.id}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '3px 12px', borderRadius: 5,
                  fontSize: 11, fontWeight: 500,
                  whiteSpace: 'nowrap' as const, flexShrink: 0,
                  background: 'rgba(255,255,255,0.02)',
                  border: `1px solid ${K.borderSubtle}`,
                }}>
                  <span style={{ fontSize: 12 }}>{sig.icon}</span>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
                    padding: '1px 5px', borderRadius: 2,
                    background: sig.typeBg, color: sig.typeColor,
                  }}>{sig.type}</span>
                  <span style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {sig.text}
                  </span>
                  <span style={{ fontWeight: 700, color: sig.isBullish ? K.green : K.red }}>
                    {sig.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: K.textMuted, fontStyle: 'italic' }}>
            No data for activity analysis
          </span>
        )}
      </div>

      <style>{`
        @keyframes confluenceScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
