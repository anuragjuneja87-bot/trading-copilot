'use client';

import { useMemo, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import ReactECharts from 'echarts-for-react';
import type { EnhancedFlowStats, EnhancedOptionTrade } from '@/types/flow';
import type { Timeframe } from '@/components/war-room/timeframe-selector';
import { formatCurrency } from '@/lib/format';

// Safety check
if (!COLORS) {
  console.error('[OptionsFlowPanel] COLORS is undefined!');
}

interface FlowPanelProps {
  stats: EnhancedFlowStats | null;
  trades: EnhancedOptionTrade[];
  loading: boolean;
  error: string | null;
  avgDailyFlow?: number; // Add this - fetch from historical data or use constant
  timeframe?: Timeframe;
  timeframeRange?: {
    from: number;
    to: number;
    label: string;
    isMarketClosed: boolean;
    tradingDay?: string;
  };
  currentPrice?: number;
  vwap?: number | null;
}

type ChartType = 'premium' | 'delta';

export function OptionsFlowPanel({ 
  stats, 
  trades, 
  loading, 
  error, 
  avgDailyFlow = 2000000,
  timeframe = '15m',
  timeframeRange,
  currentPrice,
  vwap,
}: FlowPanelProps) {
  const [chartType, setChartType] = useState<ChartType>('premium');
  
  // Flow volume context
  const flowVsAvg = useMemo(() => {
    if (!stats || !avgDailyFlow || avgDailyFlow === 0) return null;
    const ratio = Math.abs(stats.netDeltaAdjustedFlow || 0) / avgDailyFlow;
    return {
      ratio,
      label: ratio < 0.1 ? 'VERY LOW' : ratio < 0.5 ? 'LOW' : ratio < 1 ? 'MODERATE' : ratio < 2 ? 'HIGH' : 'VERY HIGH',
      bgColor: ratio < 0.1 ? 'bg-red-500/30' : ratio < 0.5 ? 'bg-orange-500/30' : ratio < 1 ? 'bg-gray-500/30' : ratio < 2 ? 'bg-green-500/30' : 'bg-cyan-500/30',
      textColor: ratio < 0.1 ? 'text-red-300' : ratio < 0.5 ? 'text-orange-300' : ratio < 1 ? 'text-gray-300' : ratio < 2 ? 'text-green-300' : 'text-cyan-300',
    };
  }, [stats, avgDailyFlow]);

  // Guard against undefined stats
  if (!stats && !loading && !error) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        No data available
      </div>
    );
  }

  // Derived values
  const regime = stats?.regime || 'NEUTRAL';
  const callRatio = stats?.callRatio || 50;
  const putRatio = stats?.putRatio || 50;
  
  // Badge logic - match hero verdict
  const flowBias = putRatio >= 60 ? 'BEARISH' : callRatio >= 60 ? 'BULLISH' : 'NEUTRAL';
  const flowBiasColor = flowBias === 'BULLISH' ? (COLORS?.green || '#00e676') : 
                        flowBias === 'BEARISH' ? (COLORS?.red || '#ff5252') : (COLORS?.yellow || '#ffc107');
  
  // Get timeframe label
  const timeframeLabel = timeframeRange?.label || 'Current';
  
  const formatDelta = (delta: number) => {
    const sign = delta >= 0 ? '+' : '';
    if (Math.abs(delta) >= 1000000) return `${sign}$${(delta / 1000000).toFixed(1)}M`;
    if (Math.abs(delta) >= 1000) return `${sign}$${(delta / 1000).toFixed(0)}K`;
    return `${sign}$${delta.toFixed(0)}`;
  };

  // Find top trade (by premium or smart money score)
  const topTrade = useMemo(() => {
    if (!trades.length) return null;
    return trades.reduce((best, t) => 
      (t.smartMoneyScore || 0) > (best.smartMoneyScore || 0) ? t : best
    , trades[0]);
  }, [trades]);

  // Detect latest crossover from flow time series
  const latestCrossover = useMemo(() => {
    if (!stats?.flowTimeSeries || stats.flowTimeSeries.length < 2) return null;
    
    const data = stats.flowTimeSeries;
    let cumulativeCall = 0;
    let cumulativePut = 0;
    const callData: number[] = [];
    const putData: number[] = [];
    const timeLabels: string[] = [];
    
    data.forEach(d => {
      cumulativeCall += d.callPremium || 0;
      cumulativePut += d.putPremium || 0;
      callData.push(cumulativeCall);
      putData.push(cumulativePut);
      timeLabels.push(d.time || '');
    });
    
    // Detect crossovers
    for (let i = callData.length - 1; i >= 1; i--) {
      const prevCallAbove = callData[i-1] > putData[i-1];
      const currCallAbove = callData[i] > putData[i];
      
      if (!prevCallAbove && currCallAbove) {
        return { time: timeLabels[i], type: 'bullish' as const, index: i };
      } else if (prevCallAbove && !currCallAbove) {
        return { time: timeLabels[i], type: 'bearish' as const, index: i };
      }
    }
    
    return null;
  }, [stats?.flowTimeSeries]);

  return (
    <div 
      className="rounded-xl p-3 flex flex-col h-full max-h-full overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
            Options Flow
          </h3>
          {/* Timeframe label */}
          {timeframeRange && (
            <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">
              {timeframeLabel}
            </span>
          )}
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={{ background: `${flowBiasColor}20`, color: flowBiasColor }}
          >
            {flowBias}
          </span>
          {/* Latest Crossover Indicator */}
          {latestCrossover && (
            <span 
              className="px-2 py-0.5 rounded text-[10px] font-semibold flex items-center gap-1"
              style={{ 
                background: latestCrossover.type === 'bullish' ? 'rgba(0,230,118,0.15)' : 'rgba(255,82,82,0.15)',
                color: latestCrossover.type === 'bullish' ? '#00e676' : '#ff5252',
              }}
            >
              {latestCrossover.type === 'bullish' ? '🔺' : '🔻'} {latestCrossover.type === 'bullish' ? 'Bullish' : 'Bearish'} crossover at {latestCrossover.time}
            </span>
          )}
        </div>
      </div>

      {/* Key Stats Row */}
      <div className="grid grid-cols-4 gap-2 mb-2 text-center">
        <StatBox 
          label="Net Δ Flow" 
          value={formatCurrency(stats?.netDeltaAdjustedFlow || 0, { compact: true, showSign: true })}
          color={(stats?.netDeltaAdjustedFlow || 0) >= 0 ? COLORS.green : COLORS.red}
          subtext={flowVsAvg ? `${flowVsAvg.label} vs avg` : undefined}
          subtextColor={flowVsAvg?.textColor}
          subtextBgColor={flowVsAvg?.bgColor}
          highlight
        />
        <StatBox 
          label="Call/Put" 
          value={`${stats?.callRatio || 50}/${stats?.putRatio || 50}`}
          color="#fff"
        />
        <StatBox 
          label="Sweeps" 
          value={`${((stats?.sweepRatio || 0) * 100).toFixed(0)}%`}
          color={(stats?.sweepRatio || 0) > 0.3 ? COLORS.cyan : '#888'}
        />
        <StatBox 
          label="Unusual" 
          value={stats?.unusualCount?.toString() || '0'}
          color={(stats?.unusualCount || 0) > 5 ? COLORS.yellow : '#888'}
        />
      </div>

      {/* Chart */}
      <div className="h-[200px] overflow-hidden">
        {loading ? (
          <LoadingState />
        ) : error ? (
          <ErrorState message={error} />
        ) : (stats?.flowTimeSeries && stats.flowTimeSeries.length > 1) ? (
          // Use the time series from stats (preferred)
          <FlowChart 
            data={stats.flowTimeSeries} 
            chartType={chartType}
          />
        ) : trades.length > 0 ? (
          // Fall back to computing from trades
          <FlowChartFromTrades trades={trades} chartType={chartType} />
        ) : (
          <EmptyState message="No flow data available" />
        )}
      </div>

      {/* Top Trade */}
      {topTrade && (
        <div 
          className="mt-2 p-2 rounded-lg flex items-center justify-between"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">🎯 Top:</span>
            <span 
              className="text-xs font-mono font-semibold"
              style={{ color: topTrade.callPut === 'C' ? COLORS.green : COLORS.red }}
            >
              ${topTrade.strike} {topTrade.callPut}
            </span>
            {topTrade.isSweep && (
              <span className="px-1 py-0.5 rounded text-[9px] font-bold bg-cyan-500/20 text-cyan-400">
                SWEEP
              </span>
            )}
            <span className="text-[10px] text-gray-400">
              Score: {topTrade.smartMoneyScore || 0}/10
            </span>
          </div>
          <span className="text-xs font-mono text-gray-400">
            ${((topTrade.premium || 0) / 1000).toFixed(0)}K
          </span>
        </div>
      )}
    </div>
  );
}

function StatBox({ 
  label, 
  value, 
  color, 
  highlight,
  subtext,
  subtextColor,
  subtextBgColor,
}: { 
  label: string; 
  value: string; 
  color: string;
  highlight?: boolean;
  subtext?: string;
  subtextColor?: string;
  subtextBgColor?: string;
}) {
  return (
    <div 
      className="p-1.5 rounded"
      style={{ 
        background: highlight ? `${color}10` : 'rgba(255,255,255,0.02)',
        border: highlight ? `1px solid ${color}30` : 'none',
      }}
    >
      <div className="text-[9px] text-gray-500 uppercase">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
      {subtext && (
        <div className={`text-[10px] font-medium px-2 py-0.5 rounded mt-1 inline-block ${subtextBgColor || ''}`} style={{ color: subtextColor || '#666' }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

// Crossover detection function
function detectCrossovers(callData: number[], putData: number[], timeLabels: string[]) {
  const crossovers: Array<{time: string, type: 'bullish' | 'bearish', index: number, callValue: number, putValue: number}> = [];
  
  for (let i = 1; i < callData.length; i++) {
    const prevCallAbove = callData[i-1] > putData[i-1];
    const currCallAbove = callData[i] > putData[i];
    
    if (!prevCallAbove && currCallAbove) {
      crossovers.push({ 
        time: timeLabels[i], 
        type: 'bullish', 
        index: i,
        callValue: callData[i],
        putValue: putData[i],
      });
    } else if (prevCallAbove && !currCallAbove) {
      crossovers.push({ 
        time: timeLabels[i], 
        type: 'bearish', 
        index: i,
        callValue: callData[i],
        putValue: putData[i],
      });
    }
  }
  return crossovers;
}

function FlowChart({ 
  data, 
  chartType 
}: { 
  data: any[];
  chartType: 'premium' | 'delta';
}) {
  // If data is empty or has only 1 point, show message
  if (!data || data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        No time series data
      </div>
    );
  }

  // If only 1 data point, show it differently
  if (data.length === 1) {
    const d = data[0];
    return (
      <div className="h-full flex flex-col items-center justify-center gap-2">
        <div className="text-xs text-gray-400">{d.time || 'Single bucket'}</div>
        <div className="flex gap-4">
          <div className="text-center">
            <div className="text-[10px] text-gray-500">Calls</div>
            <div className="text-2xl font-bold text-green-400">
              ${((d.callPremium || 0) / 1000).toFixed(0)}K
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500">Puts</div>
            <div className="text-2xl font-bold text-red-400">
              ${((d.putPremium || 0) / 1000).toFixed(0)}K
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Transform data to cumulative values
  const chartData = useMemo(() => {
    let cumulativeCall = 0;
    let cumulativePut = 0;
    let cumulativeNetFlow = 0;
    
    const callData: number[] = [];
    const putData: number[] = [];
    const netFlowData: number[] = [];
    const timeLabels: string[] = [];
    
    data.forEach(d => {
      cumulativeCall += d.callPremium || 0;
      cumulativePut += d.putPremium || 0;
      cumulativeNetFlow += (d.deltaAdjustedPremium || d.netFlow || 0);
      
      callData.push(cumulativeCall);
      putData.push(cumulativePut);
      netFlowData.push(cumulativeNetFlow);
      timeLabels.push(d.time || '');
    });
    
    // Detect crossovers
    const crossovers = detectCrossovers(callData, putData, timeLabels);
    
    // Prepare crossover scatter points
    const crossoverPoints = crossovers.map(c => ({
      value: [c.index, c.callValue],
      itemStyle: {
        color: c.type === 'bullish' ? '#00e676' : '#ff5252',
      },
      symbol: 'triangle',
      symbolSize: 12,
    }));
    
    return {
      timeLabels,
      callData,
      putData,
      netFlowData,
      crossovers,
      crossoverPoints,
    };
  }, [data]);

  const option = useMemo(() => ({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        let result = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`;
        params.forEach((p: any) => {
          const value = Math.abs(p.value);
          const formatted = value >= 1000000 
            ? `$${(value / 1000000).toFixed(1)}M`
            : value >= 1000 
            ? `$${(value / 1000).toFixed(0)}K`
            : `$${value.toFixed(0)}`;
          result += `<div style="color:${p.color}">${p.seriesName}: ${formatted}</div>`;
        });
        return result;
      },
    },
    legend: {
      data: ['Calls', 'Puts', 'Net Flow'],
      textStyle: { color: '#888', fontSize: 12 },
      top: 5,
      right: 10,
    },
    grid: { top: 35, right: 15, bottom: 25, left: 50 },
    xAxis: {
      type: 'category',
      data: chartData.timeLabels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { 
        fontSize: 11, 
        color: '#666',
        rotate: chartData.timeLabels.length > 6 ? 45 : 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      axisLabel: { 
        fontSize: 12, 
        color: '#666',
        formatter: (v: number) => {
          const abs = Math.abs(v);
          if (abs >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
          if (abs >= 1000) return `$${(v / 1000).toFixed(0)}K`;
          return `$${v}`;
        }
      },
    },
    series: [
      {
        name: 'Calls',
        type: 'line',
        data: chartData.callData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00e676', width: 3 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,230,118,0.3)' },
              { offset: 1, color: 'rgba(0,230,118,0)' }
            ]
          }
        },
      },
      {
        name: 'Puts',
        type: 'line',
        data: chartData.putData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#ff5252', width: 3 },
      },
      {
        name: 'Net Flow',
        type: 'line',
        data: chartData.netFlowData,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#00bcd4', width: 1, type: 'dashed' },
      },
      // Crossover markers
      {
        name: 'Crossovers',
        type: 'scatter',
        data: chartData.crossoverPoints,
        symbol: 'triangle',
        symbolSize: 12,
        z: 10,
        tooltip: {
          formatter: (params: any) => {
            const crossover = chartData.crossovers.find((c, i) => chartData.crossoverPoints[i]?.value[0] === params.value[0]);
            if (crossover) {
              return `<div style="font-weight:bold">${crossover.type === 'bullish' ? '🔺 Bullish' : '🔻 Bearish'} Crossover</div>
                      <div>Time: ${crossover.time}</div>
                      <div style="color:#00e676">Calls: $${(crossover.callValue / 1000).toFixed(0)}K</div>
                      <div style="color:#ff5252">Puts: $${(crossover.putValue / 1000).toFixed(0)}K</div>`;
            }
            return '';
          },
        },
      },
    ],
  }), [chartData]);

  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}

function LoadingState() {
  return (
    <div className="h-full flex items-center justify-center text-gray-500 text-xs">
      <div className="animate-pulse">Loading flow data...</div>
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-red-400 text-xs">
      {message}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-gray-500 text-xs">
      {message}
    </div>
  );
}

// Add a component that processes trades into chart format
function FlowChartFromTrades({ 
  trades, 
  chartType 
}: { 
  trades: EnhancedOptionTrade[]; 
  chartType: 'premium' | 'delta';
}) {
  const chartData = useMemo(() => {
    // Group trades by time (15-min buckets for better granularity)
    const buckets = new Map<string, { callPremium: number; putPremium: number; netFlow: number }>();
    
    // Sort trades by timestamp
    const sorted = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);
    
    sorted.forEach(trade => {
      const date = new Date(trade.timestampMs);
      // Round to 15 min bucket
      date.setMinutes(Math.floor(date.getMinutes() / 15) * 15, 0, 0);
      const key = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      
      const existing = buckets.get(key) || { callPremium: 0, putPremium: 0, netFlow: 0 };
      
      if (trade.callPut === 'C') {
        existing.callPremium += trade.premium || 0;
      } else {
        existing.putPremium += trade.premium || 0;
      }
      
      existing.netFlow += trade.deltaAdjustedPremium || 0;
      
      buckets.set(key, existing);
    });
    
    // Convert to array and sort by time
    return Array.from(buckets.entries())
      .map(([time, data]) => ({
        time,
        callPremium: data.callPremium,
        putPremium: data.putPremium,
        netFlow: data.netFlow,
      }))
      .sort((a, b) => {
        // Sort by time string (simple string comparison works for HH:MM format)
        return a.time.localeCompare(b.time);
      });
  }, [trades]);

  if (chartData.length === 0) {
    return <EmptyState message="No chart data" />;
  }

  // Use same chart options as FlowChart (now always uses dual-line format)
  return <FlowChart data={chartData} chartType={chartType} />;
}
