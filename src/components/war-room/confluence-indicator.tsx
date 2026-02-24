'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';

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
    
    // 1. Options Flow - check if we actually have meaningful data
    const callRatio = flowStats?.callRatio;
    const flowTradeCount = flowStats?.tradeCount || flowStats?.totalTrades || 0;
    const hasFlowData = callRatio !== undefined && callRatio !== null && flowTradeCount > 0;
    
    if (hasFlowData) {
      result.push({
        name: 'Options Flow',
        status: callRatio >= 60 ? 'bullish' : callRatio <= 40 ? 'bearish' : 'neutral',
        value: `${callRatio}% calls`,
      });
    } else {
      result.push({
        name: 'Options Flow',
        status: 'no_data',
        value: 'No data',
      });
    }
    
    // 2. Volume Pressure
    if (volumePressure !== undefined && volumePressure !== null && !isNaN(volumePressure)) {
      result.push({
        name: 'Volume',
        status: volumePressure > 20 ? 'bullish' : volumePressure < -20 ? 'bearish' : 'neutral',
        value: `${volumePressure > 0 ? '+' : ''}${volumePressure}%`,
      });
    } else {
      result.push({
        name: 'Volume',
        status: 'no_data',
        value: 'No data',
      });
    }
    
    // 3. Dark Pool - CRITICAL: check printCount, not just bullishPct
    const dpPrintCount = darkPoolStats?.printCount || 0;
    const dpBullish = darkPoolStats?.bullishPct;
    const hasDpData = dpPrintCount > 0 && dpBullish !== undefined && dpBullish !== null;
    
    if (hasDpData) {
      const dpBearish = 100 - dpBullish;
      result.push({
        name: 'Dark Pool',
        status: dpBullish > 55 ? 'bullish' : dpBullish < 45 ? 'bearish' : 'neutral',
        value: dpBullish < 45 ? `${dpBearish.toFixed(0)}% bearish` : `${dpBullish.toFixed(0)}% bullish`,
      });
    } else {
      result.push({
        name: 'Dark Pool',
        status: 'no_data',
        value: 'No prints',
      });
    }
    
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
    // Only count signals that have actual data
    const activeSignals = signals.filter(s => s.status !== 'no_data');
    const bullish = activeSignals.filter(s => s.status === 'bullish').length;
    const bearish = activeSignals.filter(s => s.status === 'bearish').length;
    const noData = signals.filter(s => s.status === 'no_data').length;
    return { bullish, bearish, total: activeSignals.length, noData };
  }, [signals]);
  
  // Bias based on active signals only
  const overallBias = confluenceScore.total < 3 ? 'LOW DATA' :
                      confluenceScore.bullish >= 4 ? 'STRONG BULLISH' :
                      confluenceScore.bullish >= 3 ? 'LEAN BULLISH' :
                      confluenceScore.bearish >= 4 ? 'STRONG BEARISH' :
                      confluenceScore.bearish >= 3 ? 'LEAN BEARISH' : 'MIXED';
  
  const biasColor = overallBias.includes('BULLISH') ? COLORS.green :
                    overallBias.includes('BEARISH') ? COLORS.red : COLORS.yellow;

  const getSignalColor = (status: string) => {
    switch (status) {
      case 'bullish': return COLORS.green;
      case 'bearish': return COLORS.red;
      case 'neutral': return COLORS.yellow;
      case 'no_data': return '#555';
      default: return '#555';
    }
  };

  return (
    <div 
      className="rounded-xl p-4"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
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
              background: getSignalColor(signal.status),
              opacity: signal.status === 'no_data' ? 0.4 : 1,
            }}
            title={`${signal.name}: ${signal.value}`}
          />
        ))}
      </div>
      
      {/* Score */}
      <div className="text-center text-sm text-gray-200 mb-4">
        <span style={{ color: COLORS.green }} className="font-semibold">{confluenceScore.bullish} bullish</span>
        {' / '}
        <span style={{ color: COLORS.red }} className="font-semibold">{confluenceScore.bearish} bearish</span>
        {' / '}
        <span className="font-semibold">
          {confluenceScore.total - confluenceScore.bullish - confluenceScore.bearish} neutral
        </span>
        {confluenceScore.noData > 0 && (
          <>
            {' / '}
            <span className="font-semibold text-gray-400">{confluenceScore.noData} no data</span>
          </>
        )}
      </div>
      
      {/* Signal list */}
      <div className="mt-4 space-y-2">
        {signals.map((signal, i) => (
          <div key={i} className="flex items-center justify-between text-sm">
            <span className="text-gray-200 font-medium">{signal.name}</span>
            <div className="flex items-center gap-2">
              <span 
                className="font-semibold"
                style={{ color: signal.status === 'no_data' ? '#666' : '#d1d5db' }}
              >
                {signal.value}
              </span>
              <div
                className="w-3 h-3 rounded-full"
                style={{
                  background: getSignalColor(signal.status),
                  opacity: signal.status === 'no_data' ? 0.4 : 1,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
