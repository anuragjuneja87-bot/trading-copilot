'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';

/* ════════════════════════════════════════════════════════════════
   TRAFFIC LIGHT BAR — 7 Signal Confluence Strip
   
   Flow | Volume | Dark Pool | GEX | VWAP | Relative Strength | ML
   
   Each signal: green (bullish), yellow (neutral), red (bearish), dim (no data).
   Overall verdict computed from signal count.
   
   v2: Improved sizing & contrast for readability
   ════════════════════════════════════════════════════════════════ */

interface Signal {
  name: string;
  shortName: string;
  status: 'bullish' | 'bearish' | 'neutral' | 'no_data';
  value: string;
}

interface TrafficLightBarProps {
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
}

const DOT_COLORS: Record<string, string> = {
  bullish: '#26a69a',
  bearish: '#ef5350',
  neutral: '#ffc107',
  no_data: '#444',
};

export function ConfluenceIndicator({
  flowStats, darkPoolStats, volumePressure, priceVsGexFlip,
  currentPrice, vwap, relativeStrength, mlPrediction, ticker, marketSession,
}: TrafficLightBarProps) {

  const isClosed = marketSession === 'closed' || marketSession === 'after-hours';
  const isIndex = ['SPY', 'QQQ', 'IWM', 'DIA'].includes(ticker?.toUpperCase());

  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];

    // ── 1. OPTIONS FLOW ──
    const callRatio = flowStats?.callRatio;
    const flowTradeCount = flowStats?.tradeCount || flowStats?.totalTrades || 0;
    const hasFlowData = callRatio !== undefined && callRatio !== null && flowTradeCount > 0;
    if (hasFlowData) {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral', value: `${callRatio}% calls` });
    } else {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    // ── 2. VOLUME PRESSURE ──
    if (volumePressure !== undefined && volumePressure !== null && !isNaN(volumePressure) && volumePressure !== 0) {
      result.push({ name: 'Volume Pressure', shortName: 'Volume', status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral', value: `${volumePressure > 0 ? '+' : ''}${volumePressure}%` });
    } else {
      result.push({ name: 'Volume Pressure', shortName: 'Volume', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    // ── 3. DARK POOL ──
    const dpPrintCount = darkPoolStats?.printCount || 0;
    const dpBullish = darkPoolStats?.bullishPct;
    const hasDpData = dpPrintCount > 0 && dpBullish !== undefined && dpBullish !== null;
    if (hasDpData) {
      result.push({ name: 'Dark Pool', shortName: 'Dark Pool', status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral', value: dpBullish < 45 ? `${(100 - dpBullish).toFixed(0)}% sell` : `${dpBullish.toFixed(0)}% buy` });
    } else {
      result.push({ name: 'Dark Pool', shortName: 'Dark Pool', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    // ── 4. GEX POSITION ──
    result.push({ name: 'GEX Position', shortName: 'GEX', status: priceVsGexFlip === 'above' ? 'bullish' : 'bearish', value: priceVsGexFlip === 'above' ? 'Above flip' : 'Below flip' });

    // ── 5. VWAP POSITION ──
    if (vwap && currentPrice && vwap > 0) {
      const vwapDist = ((currentPrice - vwap) / vwap) * 100;
      result.push({ name: 'VWAP Position', shortName: 'VWAP', status: vwapDist > 0.1 ? 'bullish' : vwapDist < -0.1 ? 'bearish' : 'neutral', value: `${vwapDist >= 0 ? '+' : ''}${vwapDist.toFixed(2)}%` });
    } else {
      result.push({ name: 'VWAP Position', shortName: 'VWAP', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    // ── 6. RELATIVE STRENGTH ──
    if (!isIndex && relativeStrength?.rsVsSpy !== undefined) {
      const rs = relativeStrength.rsVsSpy;
      const regime = relativeStrength.regime;
      const isStrong = regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM' || rs > 0.5;
      const isWeak = regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM' || rs < -0.5;
      result.push({ name: 'Relative Strength', shortName: 'RS', status: isStrong ? 'bullish' : isWeak ? 'bearish' : 'neutral', value: `${rs >= 0 ? '+' : ''}${rs.toFixed(1)} vs SPY` });
    } else if (isIndex) {
      result.push({ name: 'Relative Strength', shortName: 'RS', status: 'no_data', value: 'Index' });
    } else {
      result.push({ name: 'Relative Strength', shortName: 'RS', status: 'no_data', value: 'No data' });
    }

    // ── 7. ML PREDICTION ──
    if (mlPrediction?.direction) {
      const dir = mlPrediction.direction.toLowerCase();
      const prob = mlPrediction.probability || mlPrediction.confidence || 0;
      const probPct = prob > 1 ? prob : Math.round(prob * 100);
      const isBullish = dir === 'bullish' || dir === 'up' || dir === 'long';
      const isBearish = dir === 'bearish' || dir === 'down' || dir === 'short';
      result.push({ name: 'ML Prediction', shortName: 'ML', status: isBullish ? 'bullish' : isBearish ? 'bearish' : 'neutral', value: `${isBullish ? '↑' : isBearish ? '↓' : '—'} ${probPct}%` });
    } else {
      result.push({ name: 'ML Prediction', shortName: 'ML', status: 'no_data', value: isClosed ? 'Closed' : 'Loading' });
    }

    return result;
  }, [flowStats, darkPoolStats, volumePressure, priceVsGexFlip, currentPrice, vwap, relativeStrength, mlPrediction, isClosed, isIndex]);

  const score = useMemo(() => {
    const active = signals.filter((s: Signal) => s.status !== 'no_data');
    const bullish = active.filter((s: Signal) => s.status === 'bullish').length;
    const bearish = active.filter((s: Signal) => s.status === 'bearish').length;
    const total = active.length;
    const spread = bullish - bearish;
    
    let label: string;
    let color: string;
    if (total < 3) { label = 'LOW DATA'; color = '#555'; }
    else if (spread >= 4) { label = 'STRONG BULLISH'; color = '#26a69a'; }
    else if (spread >= 2) { label = 'BULLISH'; color = '#26a69a'; }
    else if (spread >= 1) { label = 'LEAN BULLISH'; color = '#26a69a'; }
    else if (spread <= -4) { label = 'STRONG BEARISH'; color = '#ef5350'; }
    else if (spread <= -2) { label = 'BEARISH'; color = '#ef5350'; }
    else if (spread <= -1) { label = 'LEAN BEARISH'; color = '#ef5350'; }
    else { label = 'NEUTRAL'; color = '#ffc107'; }
    
    return { bullish, bearish, neutral: total - bullish - bearish, label, color };
  }, [signals]);

  return (
    <div
      className="overflow-hidden flex items-center gap-1.5 px-4 py-2.5"
      style={{ background: COLORS.cardBg, borderBottom: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Overall verdict badge */}
      <div className="flex items-center gap-2 mr-2 px-3.5 py-2 rounded-lg flex-shrink-0"
        style={{ background: `${score.color}18`, border: `1px solid ${score.color}35` }}>
        <div className="w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: score.color, boxShadow: `0 0 8px ${score.color}70` }} />
        <span className="text-xs font-bold tracking-wide" style={{ color: score.color }}>
          {score.label}
        </span>
      </div>

      <div className="w-px h-8 mx-1.5 flex-shrink-0" style={{ background: 'rgba(42,46,57,0.8)' }} />

      {/* Signal lights */}
      <div className="flex items-center gap-4 flex-1 justify-center">
        {signals.map((signal: Signal, i: number) => {
          const dotColor = DOT_COLORS[signal.status];
          const isActive = signal.status !== 'no_data';
          return (
            <div key={i} className="flex items-center gap-2 group" title={`${signal.name}: ${signal.value}`}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 transition-all"
                style={{
                  background: dotColor,
                  opacity: isActive ? 1 : 0.3,
                  boxShadow: isActive ? `0 0 8px ${dotColor}60` : 'none',
                }} />
              <div className="flex flex-col leading-none">
                <span className="text-[11px] font-semibold uppercase tracking-wide"
                  style={{ color: isActive ? 'rgba(230,233,240,0.95)' : 'rgba(209,212,220,0.35)' }}>
                  {signal.shortName}
                </span>
                <span className="text-[10.5px] font-medium mt-0.5"
                  style={{ color: isActive ? dotColor : 'rgba(209,212,220,0.25)' }}>
                  {signal.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="w-px h-8 mx-1.5 flex-shrink-0" style={{ background: 'rgba(42,46,57,0.8)' }} />

      {/* Score summary */}
      <div className="flex items-center gap-3.5 flex-shrink-0 ml-1">
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold" style={{ color: '#26a69a' }}>{score.bullish}</span>
          <span className="text-[11px] font-medium" style={{ color: 'rgba(209,212,220,0.5)' }}>bull</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-sm font-bold" style={{ color: '#ef5350' }}>{score.bearish}</span>
          <span className="text-[11px] font-medium" style={{ color: 'rgba(209,212,220,0.5)' }}>bear</span>
        </div>
        {isClosed && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ color: '#ffc107', background: 'rgba(255,193,7,0.12)' }}>
            CLOSED
          </span>
        )}
      </div>
    </div>
  );
}
