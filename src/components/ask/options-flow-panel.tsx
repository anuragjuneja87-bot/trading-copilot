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
  const regimeColor = regime === 'RISK_ON' ? (COLORS?.green || '#00e676') : 
                      regime === 'RISK_OFF' ? (COLORS?.red || '#ff5252') : (COLORS?.yellow || '#ffc107');
  
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

  return (
    <div 
      className="rounded-xl p-3 flex flex-col h-full"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
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
            style={{ background: `${regimeColor}20`, color: regimeColor }}
          >
            {regime === 'RISK_ON' ? 'BULLISH' : regime === 'RISK_OFF' ? 'BEARISH' : 'NEUTRAL'}
          </span>
        </div>
        
        {/* Chart Type Toggle */}
        <div className="flex rounded overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => setChartType('premium')}
            className="px-2 py-0.5 text-[9px] font-semibold"
            style={{
              background: chartType === 'premium' ? 'rgba(0,229,255,0.2)' : 'transparent',
              color: chartType === 'premium' ? COLORS.cyan : '#666',
            }}
          >
            Premium
          </button>
          <button
            onClick={() => setChartType('delta')}
            className="px-2 py-0.5 text-[9px] font-semibold"
            style={{
              background: chartType === 'delta' ? 'rgba(0,229,255,0.2)' : 'transparent',
              color: chartType === 'delta' ? COLORS.cyan : '#666',
            }}
          >
            Δ-Adj
          </button>
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
          color={COLORS.white}
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
      <div className="flex-1 min-h-0">
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
      <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
      {subtext && (
        <div className={`text-[10px] font-medium px-2 py-0.5 rounded mt-1 inline-block ${subtextBgColor || ''}`} style={{ color: subtextColor || '#666' }}>
          {subtext}
        </div>
      )}
    </div>
  );
}

function FlowChart({ 
  data, 
  chartType 
}: { 
  data: any[];
  chartType: 'premium' | 'delta';
}) {
  // Debug: Log incoming data
  console.log('[FlowChart] Data received:', {
    length: data?.length,
    sample: data?.slice(0, 3),
  });

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
            <div className="text-lg font-bold text-green-400">
              ${((d.callPremium || 0) / 1000).toFixed(0)}K
            </div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-gray-500">Puts</div>
            <div className="text-lg font-bold text-red-400">
              ${((d.putPremium || 0) / 1000).toFixed(0)}K
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Multiple data points - render chart
  const times = data.map(d => d.time || '');
  
  const option = useMemo(() => ({
    grid: { top: 10, right: 10, bottom: 35, left: 55 },
    xAxis: {
      type: 'category',
      data: times,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisTick: { show: false },
      axisLabel: { 
        fontSize: 9, 
        color: '#666',
        rotate: times.length > 6 ? 45 : 0,
        interval: 0, // Show all labels
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { 
        fontSize: 9, 
        color: '#666',
        formatter: (v: number) => {
          const abs = Math.abs(v);
          if (abs >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
          if (abs >= 1000) return `$${(v / 1000).toFixed(0)}K`;
          return `$${v}`;
        }
      },
    },
    series: chartType === 'premium' ? [
      {
        name: 'Calls',
        type: 'bar',
        data: data.map(d => d.callPremium || 0),
        itemStyle: { color: '#00e676', borderRadius: [3, 3, 0, 0] },
        barMaxWidth: 40,
      },
      {
        name: 'Puts',
        type: 'bar',
        data: data.map(d => -(d.putPremium || 0)),
        itemStyle: { color: '#ff5252', borderRadius: [0, 0, 3, 3] },
        barMaxWidth: 40,
      },
    ] : [
      {
        name: 'Cumulative Flow',
        type: 'line',
        data: data.map(d => d.cumulativeCDAF || d.netFlow || 0),
        smooth: true,
        lineStyle: { color: '#00e5ff', width: 2 },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,229,255,0.3)' },
              { offset: 1, color: 'rgba(0,229,255,0)' },
            ],
          },
        },
        symbol: 'circle',
        symbolSize: 4,
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
    },
  }), [data, chartType]);

  return <ReactECharts option={option} style={{ height: '100%' }} />;
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
    // Group trades by time (30-min buckets)
    const buckets = new Map<string, { callPremium: number; putPremium: number; cumulativeCDAF: number }>();
    let runningCDAF = 0;
    
    // Sort trades by timestamp
    const sorted = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);
    
    sorted.forEach(trade => {
      const date = new Date(trade.timestampMs);
      // Round to 30 min bucket
      date.setMinutes(Math.floor(date.getMinutes() / 30) * 30, 0, 0);
      const key = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      
      const existing = buckets.get(key) || { callPremium: 0, putPremium: 0, cumulativeCDAF: 0 };
      
      if (trade.callPut === 'C') {
        existing.callPremium += trade.premium;
      } else {
        existing.putPremium += trade.premium;
      }
      
      runningCDAF += trade.deltaAdjustedPremium || 0;
      existing.cumulativeCDAF = runningCDAF;
      
      buckets.set(key, existing);
    });
    
    // Convert to array and sort by time
    return Array.from(buckets.entries())
      .map(([time, data]) => ({
        time,
        callPremium: data.callPremium,
        putPremium: data.putPremium,
        cumulativeCDAF: data.cumulativeCDAF,
      }))
      .sort((a, b) => {
        // Sort by time string (simple string comparison works for HH:MM format)
        return a.time.localeCompare(b.time);
      });
  }, [trades]);

  if (chartData.length === 0) {
    return <EmptyState message="No chart data" />;
  }

  // Use same chart options as FlowChart
  return <FlowChart data={chartData} chartType={chartType} />;
}
