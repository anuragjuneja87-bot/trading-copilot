'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';

/* ════════════════════════════════════════════════════════════════
   TRAFFIC LIGHT BAR — Horizontal signal strip
   
   Shows 5 signals as colored dots with labels.
   Trader lands on the page → instantly sees green/red/yellow lights.
   Replaces the vertical sidebar confluence indicator.
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
  priceChange: number;
  marketSession?: 'pre-market' | 'open' | 'after-hours' | 'closed';
}

const DOT_COLORS: Record<string, string> = {
  bullish: '#26a69a',
  bearish: '#ef5350',
  neutral: '#ffc107',
  no_data: '#333',
};

export function ConfluenceIndicator({
  flowStats,
  darkPoolStats,
  volumePressure,
  priceVsGexFlip,
  priceChange,
  marketSession,
}: TrafficLightBarProps) {

  const isClosed = marketSession === 'closed' || marketSession === 'after-hours';

  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];

    const callRatio = flowStats?.callRatio;
    const flowTradeCount = flowStats?.tradeCount || flowStats?.totalTrades || 0;
    const hasFlowData = callRatio !== undefined && callRatio !== null && flowTradeCount > 0;

    if (hasFlowData) {
      result.push({
        name: 'Options Flow',
        shortName: 'Flow',
        status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral',
        value: `${callRatio}% calls`,
      });
    } else {
      result.push({ name: 'Options Flow', shortName: 'Flow', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    if (volumePressure !== undefined && volumePressure !== null && !isNaN(volumePressure) && volumePressure !== 0) {
      result.push({
        name: 'Volume Pressure',
        shortName: 'Volume',
        status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral',
        value: `${volumePressure > 0 ? '+' : ''}${volumePressure}%`,
      });
    } else {
      result.push({ name: 'Volume Pressure', shortName: 'Volume', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    const dpPrintCount = darkPoolStats?.printCount || 0;
    const dpBullish = darkPoolStats?.bullishPct;
    const hasDpData = dpPrintCount > 0 && dpBullish !== undefined && dpBullish !== null;

    if (hasDpData) {
      result.push({
        name: 'Dark Pool',
        shortName: 'Dark Pool',
        status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral',
        value: dpBullish < 45 ? `${(100 - dpBullish).toFixed(0)}% sell` : `${dpBullish.toFixed(0)}% buy`,
      });
    } else {
      result.push({ name: 'Dark Pool', shortName: 'Dark Pool', status: 'no_data', value: isClosed ? 'Closed' : 'No data' });
    }

    result.push({
      name: 'GEX Position',
      shortName: 'GEX',
      status: priceVsGexFlip === 'above' ? 'bullish' : 'bearish',
      value: priceVsGexFlip === 'above' ? 'Above flip' : 'Below flip',
    });

    result.push({
      name: 'Price Action',
      shortName: 'Price',
      status: priceChange > 0.3 ? 'bullish' : priceChange < -0.3 ? 'bearish' : 'neutral',
      value: `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
    });

    return result;
  }, [flowStats, darkPoolStats, volumePressure, priceVsGexFlip, priceChange, isClosed]);

  const score = useMemo(() => {
    const active = signals.filter((s: Signal) => s.status !== 'no_data');
    const bullish = active.filter((s: Signal) => s.status === 'bullish').length;
    const bearish = active.filter((s: Signal) => s.status === 'bearish').length;
    const total = active.length;
    const spread = bullish - bearish;
    
    let label: string;
    let color: string;
    if (total < 3) { label = 'LOW DATA'; color = '#555'; }
    else if (spread >= 3) { label = 'STRONG BULLISH'; color = '#26a69a'; }
    else if (spread >= 1) { label = 'LEAN BULLISH'; color = '#26a69a'; }
    else if (spread <= -3) { label = 'STRONG BEARISH'; color = '#ef5350'; }
    else if (spread <= -1) { label = 'LEAN BEARISH'; color = '#ef5350'; }
    else { label = 'NEUTRAL'; color = '#ffc107'; }
    
    return { bullish, bearish, neutral: total - bullish - bearish, label, color };
  }, [signals]);

  return (
    <div
      className="rounded-lg overflow-hidden flex items-center gap-1 px-4 py-2.5"
      style={{
        background: COLORS.cardBg,
        border: `1px solid ${COLORS.cardBorder}`,
      }}
    >
      {/* Overall verdict badge */}
      <div
        className="flex items-center gap-2 mr-3 px-3 py-1.5 rounded-md flex-shrink-0"
        style={{
          background: `${score.color}15`,
          border: `1px solid ${score.color}30`,
        }}
      >
        <div
          className="w-2.5 h-2.5 rounded-full animate-pulse"
          style={{ background: score.color, boxShadow: `0 0 6px ${score.color}60` }}
        />
        <span className="text-xs font-bold tracking-wide" style={{ color: score.color }}>
          {score.label}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-7 mx-1 flex-shrink-0" style={{ background: 'rgba(42,46,57,0.6)' }} />

      {/* Signal lights */}
      <div className="flex items-center gap-4 flex-1 justify-center">
        {signals.map((signal: Signal, i: number) => {
          const dotColor = DOT_COLORS[signal.status];
          const isActive = signal.status !== 'no_data';

          return (
            <div
              key={i}
              className="flex items-center gap-2 group"
              title={`${signal.name}: ${signal.value}`}
            >
              {/* Traffic light dot */}
              <div
                className="w-3.5 h-3.5 rounded-full flex-shrink-0 transition-all"
                style={{
                  background: dotColor,
                  opacity: isActive ? 1 : 0.25,
                  boxShadow: isActive ? `0 0 6px ${dotColor}50` : 'none',
                }}
              />
              {/* Label + value */}
              <div className="flex flex-col leading-none">
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: isActive ? 'rgba(209,212,220,0.8)' : 'rgba(209,212,220,0.3)' }}
                >
                  {signal.shortName}
                </span>
                <span
                  className="text-[9px] font-medium mt-0.5"
                  style={{ color: isActive ? `${dotColor}cc` : 'rgba(209,212,220,0.2)' }}
                >
                  {signal.value}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Divider */}
      <div className="w-px h-7 mx-1 flex-shrink-0" style={{ background: 'rgba(42,46,57,0.6)' }} />

      {/* Score summary */}
      <div className="flex items-center gap-3 flex-shrink-0 ml-2">
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold" style={{ color: '#26a69a' }}>{score.bullish}</span>
          <span className="text-[9px]" style={{ color: 'rgba(209,212,220,0.3)' }}>bull</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-xs font-bold" style={{ color: '#ef5350' }}>{score.bearish}</span>
          <span className="text-[9px]" style={{ color: 'rgba(209,212,220,0.3)' }}>bear</span>
        </div>
        {isClosed && (
          <span className="text-[9px] font-medium px-1.5 py-0.5 rounded" style={{ color: '#ffc107', background: 'rgba(255,193,7,0.1)' }}>
            CLOSED
          </span>
        )}
      </div>
    </div>
  );
}
