'use client';

import { useMemo, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import type { EnhancedOptionTrade } from '@/types/flow';
import type { DarkPoolPrint } from '@/types/darkpool';

/* ════════════════════════════════════════════════════════════════
   CONFLUENCE INDICATOR v3 — Stacked: Signals + Activity Ticker

   Row 1: Compressed signal pills with quality gating (same logic)
   Row 2: Scrolling unusual activity feed — sweeps, blocks, whales,
          dark pool prints, unusual OI

   Data accuracy:
   - Signals use parent-provided stats (timeframe-filtered)
   - Activity ticker merges option trades + DP prints, filtered to
     unusual activity only, sorted by recency
   ════════════════════════════════════════════════════════════════ */

interface Signal {
  name: string;
  shortName: string;
  status: 'bullish' | 'bearish' | 'neutral' | 'no_data';
  value: string;
  shortValue: string;
  quality: 'high' | 'low' | 'none';
}

interface ActivityAlert {
  id: string;
  type: 'SWEEP' | 'BLOCK' | 'WHALE' | 'DP' | 'UNUSUAL';
  label: string;
  expiry?: string;
  premium: number;
  premiumLabel: string;
  isBullish: boolean;
  timestampMs: number;
  timeLabel: string;
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
const ACTIVITY_MIN_PREMIUM = 50000;
const ACTIVITY_MIN_DP_VALUE = 100000;
const WHALE_SIZE = 500;
const WHALE_PREMIUM = 500000;

function fmtK(v: number): string {
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtTimeShort(ms: number): string {
  const d = new Date(ms);
  let h = d.getHours();
  const m = d.getMinutes();
  const ampm = h >= 12 ? 'p' : 'a';
  h = h % 12 || 12;
  return `${h}:${m.toString().padStart(2, '0')}${ampm}`;
}

export function ConfluenceIndicator({
  flowStats, darkPoolStats, volumePressure, priceVsGexFlip,
  currentPrice, vwap, relativeStrength, mlPrediction, ticker,
  marketSession, trades = [], prints = [],
}: ConfluenceIndicatorProps) {

  const isClosed = marketSession === 'closed' || marketSession === 'after-hours';
  const isIndex = ['SPY', 'QQQ', 'IWM', 'DIA'].includes(ticker?.toUpperCase());
  const [isPaused, setIsPaused] = useState(false);

  // ── Build signals (same quality-gated logic as v2) ──────────

  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];

    // 1. OPTIONS FLOW
    const callRatio = flowStats?.callRatio;
    const flowTradeCount = flowStats?.tradeCount || flowStats?.totalTrades || 0;
    const flowPremium = (flowStats?.callPremium || 0) + (flowStats?.putPremium || 0) || flowStats?.totalPremium || 0;
    const hasFlowData = callRatio !== undefined && callRatio !== null && flowTradeCount > 0;

    if (hasFlowData && flowTradeCount >= FLOW_MIN_TRADES && flowPremium >= FLOW_MIN_PREMIUM) {
      const quality = (flowTradeCount >= FLOW_HIGH_TRADES && flowPremium >= FLOW_HIGH_PREMIUM) ? 'high' : 'low';
      result.push({
        name: 'Options Flow', shortName: 'Flow',
        status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral',
        value: `${callRatio.toFixed(0)}% calls`, shortValue: `${callRatio.toFixed(0)}%C`,
        quality,
      });
    } else if (hasFlowData && flowTradeCount > 0) {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: 'no_data', value: `${callRatio.toFixed(0)}% (thin)`, shortValue: 'thin', quality: 'none' });
    } else {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 2. VOLUME PRESSURE
    if (volumePressure !== undefined && volumePressure !== null && !isNaN(volumePressure) && volumePressure !== 0) {
      result.push({
        name: 'Volume Pressure', shortName: 'Vol',
        status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral',
        value: `${volumePressure > 0 ? '+' : ''}${volumePressure.toFixed(0)}%`,
        shortValue: `${volumePressure > 0 ? '+' : ''}${volumePressure.toFixed(0)}%`,
        quality: 'high',
      });
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
      result.push({
        name: 'Dark Pool', shortName: 'DP',
        status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral',
        value: dpBullish < 45 ? `${(100 - dpBullish).toFixed(0)}% sell` : `${dpBullish.toFixed(0)}% buy`,
        shortValue: dpBullish < 45 ? `${(100 - dpBullish).toFixed(0)}%↓` : `${dpBullish.toFixed(0)}%↑`,
        quality,
      });
    } else if (hasDpData && dpPrintCount > 0) {
      result.push({ name: 'Dark Pool', shortName: 'DP', status: 'no_data', value: `${dpPrintCount}p (thin)`, shortValue: 'thin', quality: 'none' });
    } else {
      result.push({ name: 'Dark Pool', shortName: 'DP', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 4. GEX POSITION
    result.push({
      name: 'GEX Position', shortName: 'GEX',
      status: priceVsGexFlip === 'above' ? 'bullish' : 'bearish',
      value: priceVsGexFlip === 'above' ? 'Above flip' : 'Below flip',
      shortValue: priceVsGexFlip === 'above' ? '+γ' : '−γ',
      quality: 'high',
    });

    // 5. VWAP
    if (vwap && currentPrice && vwap > 0) {
      const vwapDist = ((currentPrice - vwap) / vwap) * 100;
      const bps = Math.round(Math.abs(vwapDist) * 100);
      result.push({
        name: 'VWAP Position', shortName: 'VWAP',
        status: vwapDist > 0.1 ? 'bullish' : vwapDist < -0.1 ? 'bearish' : 'neutral',
        value: `${vwapDist >= 0 ? '+' : ''}${vwapDist.toFixed(2)}%`,
        shortValue: `${vwapDist < 0 ? '-' : '+'}${bps}bp`,
        quality: 'high',
      });
    } else {
      result.push({ name: 'VWAP Position', shortName: 'VWAP', status: 'no_data', value: isClosed ? 'Closed' : 'No data', shortValue: '—', quality: 'none' });
    }

    // 6. RELATIVE STRENGTH
    if (!isIndex && relativeStrength?.rsVsSpy !== undefined) {
      const rs = relativeStrength.rsVsSpy;
      const regime = relativeStrength.regime;
      const isStrong = regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM' || rs > 0.5;
      const isWeak = regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM' || rs < -0.5;
      result.push({
        name: 'Relative Strength', shortName: 'RS',
        status: isStrong ? 'bullish' : isWeak ? 'bearish' : 'neutral',
        value: `${rs >= 0 ? '+' : ''}${rs.toFixed(1)} vs SPY`,
        shortValue: `${rs >= 0 ? '+' : ''}${rs.toFixed(1)}`,
        quality: 'high',
      });
    } else if (isIndex) {
      result.push({ name: 'Relative Strength', shortName: 'RS', status: 'no_data', value: 'Index', shortValue: '—', quality: 'none' });
    } else {
      result.push({ name: 'Relative Strength', shortName: 'RS', status: 'no_data', value: 'No data', shortValue: '—', quality: 'none' });
    }

    // 7. ML PREDICTION
    if (mlPrediction?.direction) {
      const dir = mlPrediction.direction.toLowerCase();
      const prob = mlPrediction.probability || mlPrediction.confidence || 0;
      const probPct = prob > 1 ? prob : Math.round(prob * 100);
      const isBullish = dir === 'bullish' || dir === 'up' || dir === 'long';
      const isBearish = dir === 'bearish' || dir === 'down' || dir === 'short';
      result.push({
        name: 'ML Prediction', shortName: 'ML',
        status: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral',
        value: `${isBullish ? '↑' : isBearish ? '↓' : '—'} ${probPct}%`,
        shortValue: `${isBullish ? '↑' : isBearish ? '↓' : '—'}${probPct}%`,
        quality: 'high',
      });
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

  // ── Build unusual activity feed ─────────────────────────────

  const activityFeed = useMemo((): ActivityAlert[] => {
    const alerts: ActivityAlert[] = [];

    if (trades?.length) {
      for (const t of trades) {
        const premium = t.premium || 0;
        if (premium < ACTIVITY_MIN_PREMIUM) continue;

        const isSweep = t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep;
        const isWhale = (t.size >= WHALE_SIZE) || (premium >= WHALE_PREMIUM);
        const isUnusualOI = t.isUnusual || (t.openInterest > 0 && t.size > t.openInterest * 5);
        const isBlock = premium >= 100000 && !isSweep;

        let type: ActivityAlert['type'];
        if (isSweep)            type = 'SWEEP';
        else if (isWhale)       type = 'WHALE';
        else if (isUnusualOI)   type = 'UNUSUAL';
        else if (isBlock)       type = 'BLOCK';
        else continue;

        alerts.push({
          id: `opt-${t.id || t.sequenceNumber || t.timestampMs}`,
          type,
          label: `$${t.strike}${t.callPut}`,
          expiry: t.expiry ? t.expiry.slice(5) : undefined,
          premium,
          premiumLabel: fmtK(premium),
          isBullish: t.callPut === 'C',
          timestampMs: t.timestampMs || new Date(t.timestamp).getTime(),
          timeLabel: t.timestampMs ? fmtTimeShort(t.timestampMs) : '',
        });
      }
    }

    if (prints?.length) {
      for (const p of prints) {
        const value = p.value || (p.price * p.size);
        if (value < ACTIVITY_MIN_DP_VALUE) continue;

        alerts.push({
          id: `dp-${p.id || p.timestampMs}`,
          type: 'DP',
          label: `${p.size.toLocaleString()} @$${p.price.toFixed(2)}`,
          premium: value,
          premiumLabel: fmtK(value),
          isBullish: p.side === 'BULLISH' || (vwap ? p.price >= vwap : true),
          timestampMs: p.timestampMs || new Date(p.timestamp).getTime(),
          timeLabel: p.timestampMs ? fmtTimeShort(p.timestampMs) : '',
        });
      }
    }

    alerts.sort((a, b) => b.timestampMs - a.timestampMs);
    return alerts.slice(0, 20);
  }, [trades, prints, vwap]);

  const scrollDuration = useMemo(() => {
    const count = activityFeed.length;
    return count <= 3 ? 15 : count <= 8 ? 30 : 45;
  }, [activityFeed.length]);

  const pips = useMemo(() => signals.map(s => {
    if (s.status === 'bullish') return 'bull';
    if (s.status === 'bearish') return 'bear';
    if (s.status === 'neutral') return 'neutral';
    return 'empty';
  }), [signals]);

  const typeBadge = (type: ActivityAlert['type']): React.CSSProperties => {
    const m: Record<string, { bg: string; c: string }> = {
      SWEEP:   { bg: K.cyanDim,    c: K.cyan },
      BLOCK:   { bg: K.purpleDim,  c: K.purple },
      WHALE:   { bg: K.yellowDim,  c: K.yellow },
      DP:      { bg: K.greenDim,   c: K.green },
      UNUSUAL: { bg: K.redDim,     c: K.red },
    };
    const s = m[type] || m.BLOCK;
    return {
      fontSize: 8, fontWeight: 700, letterSpacing: 0.5,
      padding: '1px 5px', borderRadius: 2,
      background: s.bg, color: s.c, whiteSpace: 'nowrap' as const,
    };
  };

  const hasActivity = activityFeed.length > 0;

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
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          padding: '4px 12px', borderRadius: 6,
          fontWeight: 800, fontSize: 11, letterSpacing: 0.5,
          marginRight: 8, flexShrink: 0,
          background: `${score.color}18`,
          border: `1px solid ${score.color}35`,
          color: score.color,
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: score.color,
            boxShadow: `0 0 6px ${score.color}70`,
          }} />
          {score.label}
        </div>

        {signals.map((s, i) => {
          const dotColor = DOT_COLORS[s.status];
          const isActive = s.status !== 'no_data';
          return (
            <div key={i}
              title={`${s.name}: ${s.value}${s.quality === 'low' ? ' (thin data)' : ''}`}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 4,
                fontSize: 10, fontWeight: 600,
                background: 'rgba(255,255,255,0.03)',
                cursor: 'default', whiteSpace: 'nowrap' as const,
              }}
            >
              <div style={{
                width: 5, height: 5, borderRadius: '50%', flexShrink: 0,
                background: dotColor,
                opacity: isActive ? 1 : 0.3,
                boxShadow: isActive ? `0 0 4px ${dotColor}50` : 'none',
              }} />
              <span style={{ color: K.textMuted, fontWeight: 500 }}>{s.shortName}</span>
              <span style={{ fontWeight: 700, color: isActive ? dotColor : K.textMuted }}>
                {s.shortValue}
              </span>
            </div>
          );
        })}

        <div style={{ flex: 1 }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 4, flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 3 }}>
            {pips.map((p, i) => (
              <div key={i} style={{
                width: 4, height: 14, borderRadius: 2,
                background:
                  p === 'bull' ? 'rgba(0,220,130,0.5)' :
                  p === 'bear' ? 'rgba(255,71,87,0.5)' :
                  p === 'neutral' ? 'rgba(251,191,36,0.35)' :
                  'rgba(255,255,255,0.08)',
              }} />
            ))}
          </div>
          <div style={{ fontSize: 10, fontWeight: 600, color: K.textMuted }}>
            <span style={{ color: K.green, fontWeight: 700 }}>{score.bullish}</span>
            {' bull '}
            <span style={{ color: K.red, fontWeight: 700 }}>{score.bearish}</span>
            {' bear'}
          </div>
        </div>

        {isClosed && (
          <div style={{
            padding: '3px 8px', borderRadius: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            background: K.redDim, color: K.red,
            border: '1px solid rgba(255,71,87,0.15)',
            flexShrink: 0,
          }}>CLOSED</div>
        )}
        {marketSession === 'open' && (
          <div style={{
            padding: '3px 8px', borderRadius: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            background: K.greenDim, color: K.green,
            border: '1px solid rgba(0,220,130,0.15)',
            flexShrink: 0,
          }}>LIVE</div>
        )}
        {marketSession === 'pre-market' && (
          <div style={{
            padding: '3px 8px', borderRadius: 4,
            fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
            background: K.yellowDim, color: K.yellow,
            border: '1px solid rgba(251,191,36,0.12)',
            flexShrink: 0,
          }}>PRE</div>
        )}
      </div>

      {/* ═══ ROW 2: Unusual Activity Ticker ═══ */}
      {hasActivity ? (
        <div
          style={{
            display: 'flex', alignItems: 'center',
            padding: '6px 14px', gap: 6,
            overflow: 'hidden',
          }}
          onMouseEnter={() => setIsPaused(true)}
          onMouseLeave={() => setIsPaused(false)}
        >
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
            color: 'rgba(0,229,255,0.5)',
            textTransform: 'uppercase' as const,
            flexShrink: 0, paddingRight: 6,
            borderRight: `1px solid ${K.border}`,
          }}>LIVE</div>

          <div style={{
            flex: 1, overflow: 'hidden', position: 'relative' as const,
            maskImage: 'linear-gradient(to right, transparent, black 3%, black 97%, transparent)',
            WebkitMaskImage: 'linear-gradient(to right, transparent, black 3%, black 97%, transparent)',
          }}>
            <div style={{
              display: 'flex', gap: 8, width: 'max-content',
              animation: `confluenceScroll ${scrollDuration}s linear infinite`,
              animationPlayState: isPaused ? 'paused' : 'running',
            }}>
              {[...activityFeed, ...activityFeed].map((alert, i) => (
                <div key={`${alert.id}-${i}`} style={{
                  display: 'flex', alignItems: 'center', gap: 5,
                  padding: '3px 10px', borderRadius: 4,
                  fontSize: 10, fontWeight: 500,
                  whiteSpace: 'nowrap' as const, flexShrink: 0,
                  cursor: 'pointer',
                  background: 'rgba(255,255,255,0.025)',
                  border: `1px solid ${K.borderSubtle}`,
                }}>
                  <span style={typeBadge(alert.type)}>
                    {alert.type === 'DP' ? 'DP PRINT' : alert.type}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,0.6)' }}>
                    <strong style={{ color: K.textPrimary, fontWeight: 700 }}>{alert.label}</strong>
                    {alert.expiry && <span style={{ marginLeft: 3 }}>{alert.expiry}</span>}
                  </span>
                  <span style={{ fontWeight: 700, color: alert.isBullish ? K.green : K.red }}>
                    {alert.premiumLabel}
                  </span>
                  {alert.timeLabel && (
                    <span style={{ color: K.textMuted, fontSize: 9 }}>{alert.timeLabel}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center',
          padding: '5px 14px', gap: 6,
        }}>
          <div style={{
            fontSize: 8, fontWeight: 700, letterSpacing: 1.5,
            color: 'rgba(255,255,255,0.15)',
            textTransform: 'uppercase' as const,
            flexShrink: 0, paddingRight: 6,
            borderRight: `1px solid ${K.border}`,
          }}>LIVE</div>
          <span style={{ fontSize: 10, color: K.textMuted, fontStyle: 'italic' }}>
            No unusual activity detected — awaiting sweeps, blocks, or whale prints
          </span>
        </div>
      )}

      <style>{`
        @keyframes confluenceScroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}
