'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { EnhancedFlowStats } from '@/types/flow';

interface FlowDashboardProps {
  stats: EnhancedFlowStats;
  isDemoMode?: boolean;
}

export function FlowDashboard({ stats, isDemoMode }: FlowDashboardProps) {
  const chartOption = useMemo(() => {
    if (!stats.flowTimeSeries || stats.flowTimeSeries.length === 0) {
      return null;
    }

    return {
      ...CHART_DEFAULTS,
      grid: { top: 50, right: 60, bottom: 60, left: 60 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(0,229,255,0.3)' } },
      },
      legend: {
        data: ['Call Premium', 'Put Premium', 'Net Flow (CDAF)'],
        ...TRADING_THEME.legend,
        top: 10,
        right: 0,
      },
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: 0,
          start: 0,
          end: 100,
          height: 20,
          bottom: 5,
          borderColor: 'rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(255,255,255,0.02)',
          fillerColor: 'rgba(0,229,255,0.08)',
          handleStyle: { color: '#00e5ff' },
          textStyle: { color: '#4a6070', fontSize: 9 },
          dataBackground: {
            lineStyle: { color: 'rgba(0,229,255,0.3)' },
            areaStyle: { color: 'rgba(0,229,255,0.05)' },
          },
        },
      ],
      xAxis: {
        type: 'category',
        data: stats.flowTimeSeries.map(d => {
          // Handle both time (string) and timeMs (number) formats
          let date: Date;
          if (d.timeMs) {
            date = new Date(d.timeMs);
          } else if (typeof d.time === 'string') {
            date = new Date(d.time);
          } else if (typeof d.time === 'number') {
            date = new Date(d.time);
          } else {
            return '';
          }
          
          // Check if date is valid
          if (isNaN(date.getTime())) {
            return '';
          }
          
          return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }),
        ...TRADING_THEME.categoryAxis,
        boundaryGap: false,
      },
      yAxis: [
        {
          type: 'value',
          name: 'Premium ($)',
          nameTextStyle: { color: '#4a6070', fontSize: 10 },
          ...TRADING_THEME.valueAxis,
          axisLabel: {
            ...TRADING_THEME.valueAxis.axisLabel,
            formatter: (v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}K`,
          },
        },
        {
          type: 'value',
          name: 'CDAF',
          nameTextStyle: { color: '#4a6070', fontSize: 10 },
          ...TRADING_THEME.valueAxis,
          splitLine: { show: false },
          axisLabel: {
            ...TRADING_THEME.valueAxis.axisLabel,
            formatter: (v: number) => v >= 0 ? `+${(v/1000000).toFixed(1)}M` : `${(v/1000000).toFixed(1)}M`,
          },
        },
      ],
      series: [
        {
          name: 'Call Premium',
          type: 'bar',
          stack: 'premium',
          data: stats.flowTimeSeries.map(d => d.callPremium),
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,230,118,0.6)' },
                { offset: 1, color: 'rgba(0,230,118,0.1)' },
              ],
            },
            borderRadius: [2, 2, 0, 0],
          },
          emphasis: { itemStyle: { color: '#00e676' } },
        },
        {
          name: 'Put Premium',
          type: 'bar',
          stack: 'premium',
          data: stats.flowTimeSeries.map(d => -d.putPremium), // negative for visual
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,82,82,0.1)' },
                { offset: 1, color: 'rgba(255,82,82,0.6)' },
              ],
            },
            borderRadius: [0, 0, 2, 2],
          },
          emphasis: { itemStyle: { color: '#ff5252' } },
        },
        {
          name: 'Net Flow (CDAF)',
          type: 'line',
          yAxisIndex: 1,
          data: stats.flowTimeSeries.map(d => d.cumulativeCDAF),
          smooth: true,
          showSymbol: false,
          lineStyle: {
            width: 2,
            color: '#00e5ff',
            shadowColor: 'rgba(0,229,255,0.4)',
            shadowBlur: 8,
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,229,255,0.15)' },
                { offset: 1, color: 'rgba(0,229,255,0)' },
              ],
            },
          },
        },
      ],
    };
  }, [stats.flowTimeSeries]);

  const donutOption = useMemo(() => ({
    tooltip: { ...TRADING_THEME.tooltip },
    series: [{
      type: 'pie',
      radius: ['55%', '80%'],
      center: ['50%', '50%'],
      data: [
        { value: stats.callPremium, name: 'Calls', itemStyle: { color: COLORS.green } },
        { value: stats.putPremium, name: 'Puts', itemStyle: { color: COLORS.red } },
      ],
      label: { show: false },
      emphasis: {
        label: { show: true, fontWeight: 'bold', color: '#e0e6f0', fontSize: 12 },
      },
      itemStyle: {
        borderColor: '#060810',
        borderWidth: 2,
      },
    }],
  }), [stats.callPremium, stats.putPremium]);

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Call/Put Ratio */}
        <div className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            CALL/PUT RATIO
          </div>
          <div className="text-lg font-bold mb-1.5"
            style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
            {stats.callRatio.toFixed(1)}% / {stats.putRatio.toFixed(1)}%
          </div>
          <div className="flex h-1.5 w-full rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div style={{ width: `${stats.callRatio}%`, background: COLORS.green }} className="rounded-l-full" />
            <div style={{ width: `${stats.putRatio}%`, background: COLORS.red }} className="rounded-r-full" />
          </div>
        </div>

        {/* Total Premium */}
        <div className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            TOTAL PREMIUM
          </div>
          <div className="text-lg font-bold"
            style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
            ${(stats.totalPremium / 1e6).toFixed(1)}M
          </div>
        </div>

        {/* Net CDAF */}
        <div className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            NET CDAF
          </div>
          <div className="text-lg font-bold"
            style={{
              fontFamily: "'Oxanium', monospace",
              color: stats.netDeltaAdjustedFlow >= 0 ? COLORS.green : COLORS.red,
            }}>
            {stats.netDeltaAdjustedFlow >= 0 ? '+' : ''}${(stats.netDeltaAdjustedFlow / 1e6).toFixed(1)}M
          </div>
        </div>

        {/* Sweep Ratio */}
        <div className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            SWEEP RATIO
          </div>
          <div className="text-lg font-bold"
            style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
            {(stats.sweepRatio * 100).toFixed(0)}%
          </div>
        </div>

        {/* Unusual Trades */}
        <div className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            UNUSUAL TRADES
          </div>
          <div className="text-lg font-bold"
            style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
            {stats.unusualCount}
          </div>
        </div>

        {/* Flow Regime */}
        <div className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-1.5"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            FLOW REGIME
          </div>
          <span className="text-xs font-bold px-2 py-0.5 rounded"
            style={{
              background: stats.regime === 'RISK_ON' ? COLORS.glowGreen
                : stats.regime === 'RISK_OFF' ? COLORS.glowRed
                : 'rgba(255,193,7,0.1)',
              color: stats.regime === 'RISK_ON' ? COLORS.green
                : stats.regime === 'RISK_OFF' ? COLORS.red
                : COLORS.yellow,
            }}>
            {stats.regime}
          </span>
        </div>
      </div>

      {/* Chart Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Main Flow Chart */}
        <div className="lg:col-span-3 rounded-xl p-4"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-3"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            FLOW TIME SERIES
            {isDemoMode && (
              <span className="ml-2 px-1.5 py-0.5 rounded text-[8px]"
                style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107' }}>
                DEMO
              </span>
            )}
          </div>
          {chartOption ? (
            <ReactECharts
              option={chartOption}
              style={{ height: '400px' }}
              notMerge={true}
              lazyUpdate={true}
            />
          ) : (
            <div className="flex items-center justify-center h-96 text-[11px] text-[#4a6070]">
              No flow time series data available
            </div>
          )}
        </div>

        {/* Donut Chart */}
        <div className="lg:col-span-1 rounded-xl p-4 flex flex-col items-center justify-center"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="text-[9px] uppercase tracking-wider mb-3"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            CALL/PUT SPLIT
          </div>
          <ReactECharts
            option={donutOption}
            style={{ height: '180px', width: '180px' }}
            notMerge={true}
            lazyUpdate={true}
          />
          <div className="mt-3 text-center">
            <div className="flex items-center gap-2 justify-center mb-1">
              <div className="w-2 h-2 rounded-full" style={{ background: COLORS.green }} />
              <span className="text-[10px] text-[#8b99b0]">Calls: ${(stats.callPremium / 1e6).toFixed(1)}M</span>
            </div>
            <div className="flex items-center gap-2 justify-center">
              <div className="w-2 h-2 rounded-full" style={{ background: COLORS.red }} />
              <span className="text-[10px] text-[#8b99b0]">Puts: ${(stats.putPremium / 1e6).toFixed(1)}M</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
