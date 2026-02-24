'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';

/* ════════════════════════════════════════════════════════════════
   AI SIGNAL ENGINE — Replaces "Signal Confluence"
   
   Directly maps to candle colors on the YodhaChart:
   - Green candles = AI sees bullish confluence
   - Orange candles = AI sees mixed/crossover signals  
   - Red candles = AI sees bearish confluence
   
   This is the "why" behind the colored candles.
   ════════════════════════════════════════════════════════════════ */

interface Signal {
  name: string;
  status: 'bullish' | 'bearish' | 'neutral' | 'no_data';
  value: string;
}

interface ConfluenceIndicatorProps {
  flowStats: any;
  darkPoolStats: any;
  volumePressure: number;
  priceVsGexFlip: 'above' | 'below';
  priceChange: number;
  marketSession?: 'pre-market' | 'open' | 'after-hours' | 'closed';
}

// Match the exact candle color palette from yodha-chart
const CANDLE_COLORS = {
  strongBull: '#26a69a',
  bull:       '#1b8a7a',
  crossover:  '#ff9800',
  bear:       '#c94442',
  strongBear: '#ef5350',
};

export function ConfluenceIndicator({
  flowStats,
  darkPoolStats,
  volumePressure,
  priceVsGexFlip,
  priceChange,
  marketSession,
}: ConfluenceIndicatorProps) {
  
  const isClosed = marketSession === 'closed' || marketSession === 'after-hours';
  
  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];
    
    const callRatio = flowStats?.callRatio;
    const flowTradeCount = flowStats?.tradeCount || flowStats?.totalTrades || 0;
    const hasFlowData = callRatio !== undefined && callRatio !== null && flowTradeCount > 0;
    
    if (hasFlowData) {
      result.push({
        name: 'Options Flow',
        status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral',
        value: isClosed ? `${callRatio}% calls (close)` : `${callRatio}% calls`,
      });
    } else {
      result.push({ name: 'Options Flow', status: 'no_data', value: isClosed ? 'Market closed' : 'No data' });
    }
    
    if (volumePressure !== undefined && volumePressure !== null && !isNaN(volumePressure) && volumePressure !== 0) {
      result.push({
        name: 'Volume',
        status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral',
        value: isClosed ? `${volumePressure > 0 ? '+' : ''}${volumePressure}% (close)` : `${volumePressure > 0 ? '+' : ''}${volumePressure}%`,
      });
    } else {
      result.push({ name: 'Volume', status: 'no_data', value: isClosed ? 'Market closed' : 'No data' });
    }
    
    const dpPrintCount = darkPoolStats?.printCount || 0;
    const dpBullish = darkPoolStats?.bullishPct;
    const hasDpData = dpPrintCount > 0 && dpBullish !== undefined && dpBullish !== null;
    
    if (hasDpData) {
      const dpBearish = 100 - dpBullish;
      result.push({
        name: 'Dark Pool',
        status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral',
        value: dpBullish < 45 
          ? `${dpBearish.toFixed(0)}% bearish${isClosed ? ' (close)' : ''}`
          : `${dpBullish.toFixed(0)}% bullish${isClosed ? ' (close)' : ''}`,
      });
    } else {
      result.push({ name: 'Dark Pool', status: 'no_data', value: isClosed ? 'Market closed' : 'No prints' });
    }
    
    result.push({
      name: 'GEX Position',
      status: priceVsGexFlip === 'above' ? 'bullish' : 'bearish',
      value: priceVsGexFlip === 'above' ? 'Above flip' : 'Below flip',
    });
    
    result.push({
      name: 'Price Action',
      status: priceChange > 0.3 ? 'bullish' : priceChange < -0.3 ? 'bearish' : 'neutral',
      value: `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
    });
    
    return result;
  }, [flowStats, darkPoolStats, volumePressure, priceVsGexFlip, priceChange, isClosed]);
  
  const confluenceScore = useMemo(() => {
    const activeSignals = signals.filter(s => s.status !== 'no_data');
    const bullish = activeSignals.filter(s => s.status === 'bullish').length;
    const bearish = activeSignals.filter(s => s.status === 'bearish').length;
    const noData = signals.filter(s => s.status === 'no_data').length;
    return { bullish, bearish, total: activeSignals.length, noData };
  }, [signals]);
  
  // Compute the candle color this would produce
  const { overallBias, candleColor, candleLabel } = useMemo(() => {
    const { bullish, bearish, total } = confluenceScore;
    if (total < 3) return { overallBias: 'LOW DATA', candleColor: '#555', candleLabel: 'Insufficient' };
    const spread = bullish - bearish;
    if (spread >= 3) return { overallBias: 'STRONG BULLISH', candleColor: CANDLE_COLORS.strongBull, candleLabel: 'Strong Bull' };
    if (spread >= 1) return { overallBias: 'LEAN BULLISH', candleColor: CANDLE_COLORS.bull, candleLabel: 'Bull' };
    if (spread <= -3) return { overallBias: 'STRONG BEARISH', candleColor: CANDLE_COLORS.strongBear, candleLabel: 'Strong Bear' };
    if (spread <= -1) return { overallBias: 'LEAN BEARISH', candleColor: CANDLE_COLORS.bear, candleLabel: 'Bear' };
    return { overallBias: 'CROSSOVER', candleColor: CANDLE_COLORS.crossover, candleLabel: 'Crossover' };
  }, [confluenceScore]);

  const getSignalColor = (status: string) => {
    switch (status) {
      case 'bullish': return CANDLE_COLORS.strongBull;
      case 'bearish': return CANDLE_COLORS.strongBear;
      case 'neutral': return CANDLE_COLORS.crossover;
      default: return '#333';
    }
  };

  return (
    <div 
      className="rounded-xl overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* ── AI HEADER ── */}
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full animate-pulse" 
              style={{ background: candleColor, boxShadow: `0 0 6px ${candleColor}80` }} />
            <h3 className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: 'rgba(209,212,220,0.6)' }}>
              AI Signal Engine
            </h3>
          </div>
          <div className="px-2.5 py-1 rounded text-[10px] font-bold"
            style={{ background: `${candleColor}20`, color: candleColor, border: `1px solid ${candleColor}30` }}>
            {overallBias}
          </div>
        </div>
        <div className="text-[9px] pl-4" style={{ color: 'rgba(209,212,220,0.25)' }}>
          {isClosed ? 'Showing last session signals' : 'Pressure scoring drives candle colors'}
        </div>
      </div>
      
      {/* ── How Candle Colors Work (honest explainer) ── */}
      <div className="mx-4 mb-3 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(42,46,57,0.5)' }}>
        <div className="flex items-center gap-2 mb-2">
          <span style={{ fontSize: 11 }}>🧠</span>
          <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'rgba(209,212,220,0.7)' }}>
            Candle Colors = Pressure Score
          </span>
        </div>
        <div className="text-[10px] leading-relaxed mb-2.5" style={{ color: 'rgba(209,212,220,0.4)' }}>
          Unlike traditional charts, every candle color is computed by scoring real-time pressure signals:
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 mb-2.5">
          {[
            { icon: '📊', label: 'VWAP Position' },
            { icon: '📈', label: 'Price Action' },
            { icon: '🔊', label: 'Volume Spikes' },
            { icon: '📉', label: 'Trend Momentum' },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <span style={{ fontSize: 9 }}>{item.icon}</span>
              <span className="text-[9px] font-medium" style={{ color: 'rgba(209,212,220,0.5)' }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-4 pt-2" style={{ borderTop: '1px solid rgba(42,46,57,0.4)' }}>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: CANDLE_COLORS.strongBull }} />
            <span className="text-[9px]" style={{ color: 'rgba(209,212,220,0.45)' }}>Bullish</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: CANDLE_COLORS.crossover }} />
            <span className="text-[9px]" style={{ color: 'rgba(209,212,220,0.45)' }}>Crossover</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div style={{ width: 10, height: 10, borderRadius: 2, background: CANDLE_COLORS.strongBear }} />
            <span className="text-[9px]" style={{ color: 'rgba(209,212,220,0.45)' }}>Bearish</span>
          </div>
        </div>
      </div>
      
      {/* ── Signal dots ── */}
      <div className="flex items-center justify-center gap-3 mb-3 px-4">
        {signals.map((signal, i) => (
          <div key={i} className="w-4 h-4 rounded-full"
            style={{
              background: getSignalColor(signal.status),
              opacity: signal.status === 'no_data' ? 0.25 : 0.9,
              boxShadow: signal.status !== 'no_data' ? `0 0 4px ${getSignalColor(signal.status)}40` : 'none',
            }}
            title={`${signal.name}: ${signal.value}`} />
        ))}
      </div>
      
      {/* ── Score ── */}
      <div className="text-center text-[11px] mb-3 px-4" style={{ color: 'rgba(209,212,220,0.6)' }}>
        <span style={{ color: CANDLE_COLORS.strongBull }} className="font-semibold">{confluenceScore.bullish} bullish</span>
        {' / '}
        <span style={{ color: CANDLE_COLORS.strongBear }} className="font-semibold">{confluenceScore.bearish} bearish</span>
        {' / '}
        <span className="font-semibold" style={{ color: CANDLE_COLORS.crossover }}>
          {confluenceScore.total - confluenceScore.bullish - confluenceScore.bearish} neutral
        </span>
        {confluenceScore.noData > 0 && (
          <span className="text-gray-500"> / {confluenceScore.noData} no data</span>
        )}
      </div>
      
      {/* ── Signal list ── */}
      <div className="px-4 pb-3 space-y-1.5">
        {signals.map((signal, i) => (
          <div key={i} className="flex items-center justify-between text-[11px]">
            <span style={{ color: 'rgba(209,212,220,0.7)' }} className="font-medium">{signal.name}</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold"
                style={{ color: signal.status === 'no_data' ? '#555' : 'rgba(209,212,220,0.85)' }}>
                {signal.value}
              </span>
              <div className="w-2.5 h-2.5 rounded-full"
                style={{ background: getSignalColor(signal.status), opacity: signal.status === 'no_data' ? 0.3 : 1 }} />
            </div>
          </div>
        ))}
      </div>
      
      {/* ── Footer ── */}
      <div className="px-4 pb-3 pt-2 border-t" style={{ borderColor: 'rgba(42,46,57,0.4)' }}>
        <div className="text-[8px] leading-relaxed" style={{ color: 'rgba(209,212,220,0.25)' }}>
          Candle colors score VWAP position, price action, volume spikes &amp; trend momentum in real-time. 
          Signal confluence above shows the broader market picture from all 5 data sources.
        </div>
      </div>
    </div>
  );
}
