'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';

interface Signal {
  name: string;
  status: 'bullish' | 'bearish' | 'neutral';
  value: string;
}

interface ConfluenceIndicatorProps {
  flowStats: any;
  darkPoolStats: any;
  volumePressure: number;
  priceVsGexFlip: 'above' | 'below';
  priceChange: number;
}

export function ConfluenceIndicator({
  flowStats,
  darkPoolStats,
  volumePressure,
  priceVsGexFlip,
  priceChange,
}: ConfluenceIndicatorProps) {
  
  const signals = useMemo((): Signal[] => {
    const result: Signal[] = [];
    
    // 1. Options Flow
    const callRatio = flowStats?.callRatio || 50;
    result.push({
      name: 'Options Flow',
      status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral',
      value: `${callRatio}% calls`,
    });
    
    // 2. Volume Pressure
    result.push({
      name: 'Volume',
      status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral',
      value: `${volumePressure > 0 ? '+' : ''}${volumePressure}%`,
    });
    
    // 3. Dark Pool
    const dpBullish = darkPoolStats?.bullishPct || 50;
    result.push({
      name: 'Dark Pool',
      status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral',
      value: `${dpBullish}% bullish`,
    });
    
    // 4. GEX Position
    result.push({
      name: 'GEX Position',
      status: priceVsGexFlip === 'above' ? 'bullish' : 'bearish',
      value: priceVsGexFlip === 'above' ? 'Above flip' : 'Below flip',
    });
    
    // 5. Price Action
    result.push({
      name: 'Price Action',
      status: priceChange > 0.3 ? 'bullish' : priceChange < -0.3 ? 'bearish' : 'neutral',
      value: `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%`,
    });
    
    return result;
  }, [flowStats, darkPoolStats, volumePressure, priceVsGexFlip, priceChange]);
  
  const confluenceScore = useMemo(() => {
    const bullish = signals.filter(s => s.status === 'bullish').length;
    const bearish = signals.filter(s => s.status === 'bearish').length;
    return { bullish, bearish, total: signals.length };
  }, [signals]);
  
  const overallBias = confluenceScore.bullish >= 4 ? 'STRONG BULLISH' :
                      confluenceScore.bullish >= 3 ? 'LEAN BULLISH' :
                      confluenceScore.bearish >= 4 ? 'STRONG BEARISH' :
                      confluenceScore.bearish >= 3 ? 'LEAN BEARISH' : 'MIXED';
  
  const biasColor = overallBias.includes('BULLISH') ? COLORS.green :
                    overallBias.includes('BEARISH') ? COLORS.red : COLORS.yellow;

  return (
    <div 
      className="rounded-xl p-4"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
          Signal Confluence
        </h3>
        <div 
          className="px-3 py-1.5 rounded text-xs font-bold"
          style={{ background: `${biasColor}20`, color: biasColor }}
        >
          {overallBias}
        </div>
      </div>
      
      {/* Signal dots row */}
      <div className="flex items-center justify-center gap-3 mb-4">
        {signals.map((signal, i) => (
          <div
            key={i}
            className="w-5 h-5 rounded-full"
            style={{
              background: signal.status === 'bullish' ? COLORS.green :
                         signal.status === 'bearish' ? COLORS.red : COLORS.yellow,
            }}
            title={`${signal.name}: ${signal.value}`}
          />
        ))}
      </div>
      
      {/* Score */}
      <div className="text-center text-sm text-gray-400 mb-4">
        <span style={{ color: COLORS.green }} className="font-semibold">{confluenceScore.bullish} bullish</span>
        {' / '}
        <span style={{ color: COLORS.red }} className="font-semibold">{confluenceScore.bearish} bearish</span>
        {' / '}
        <span className="font-semibold">{signals.length - confluenceScore.bullish - confluenceScore.bearish} neutral</span>
      </div>
      
      {/* Signal list */}
      <div className="mt-4 space-y-2">
        {signals.map((signal, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-400 font-medium">{signal.name}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-300 font-semibold">{signal.value}</span>
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  background: signal.status === 'bullish' ? COLORS.green :
                             signal.status === 'bearish' ? COLORS.red : COLORS.yellow,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
