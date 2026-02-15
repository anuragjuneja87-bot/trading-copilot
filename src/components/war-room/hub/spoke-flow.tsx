'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { EnhancedOptionTrade, EnhancedFlowStats } from '@/types/flow';

interface SpokeFlowProps {
  trades: EnhancedOptionTrade[];
  stats: EnhancedFlowStats;
}

export function SpokeFlow({ trades, stats }: SpokeFlowProps) {
  const chartOption = useMemo(() => {
    if (!stats.flowTimeSeries || stats.flowTimeSeries.length === 0) {
      return null;
    }

    return {
      ...CHART_DEFAULTS,
      grid: { top: 40, right: 50, bottom: 24, left: 50 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        axisPointer: { type: 'cross', lineStyle: { color: 'rgba(0,229,255,0.3)' } },
      },
      legend: {
        data: ['Call Premium', 'Put Premium', 'Net Flow (CDAF)'],
        ...TRADING_THEME.legend,
        top: 0,
        right: 0,
      },
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
          nameTextStyle: { color: '#4a6070', fontSize: 9 },
          ...TRADING_THEME.valueAxis,
          axisLabel: {
            ...TRADING_THEME.valueAxis.axisLabel,
            formatter: (v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(1)}M` : `$${(v/1000).toFixed(0)}K`,
          },
        },
        {
          type: 'value',
          name: 'CDAF',
          nameTextStyle: { color: '#4a6070', fontSize: 9 },
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

  // Filter and sort by smartMoneyScore descending
  const topTrades = useMemo(() =>
    trades
      .filter(t => t.isUnusual || t.smartMoneyScore >= 6)
      .sort((a, b) => b.smartMoneyScore - a.smartMoneyScore)
      .slice(0, 5),
    [trades]
  );

  return (
    <div>
      {/* Header stats bar */}
      <div className="flex items-center gap-4 mb-3 text-[10px]"
        style={{ fontFamily: "'Oxanium', monospace" }}>
        <div className="flex items-center gap-2">
          <span className="text-[#4a6070]">Call/Put:</span>
          <span className="text-white font-bold">{stats.callRatio.toFixed(1)}%</span>
          <span className="text-[#4a6070]">/</span>
          <span className="text-white font-bold">{stats.putRatio.toFixed(1)}%</span>
          <div className="w-16 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full flex">
              <div className="h-full" style={{ width: `${stats.callRatio}%`, background: COLORS.green }} />
              <div className="h-full" style={{ width: `${stats.putRatio}%`, background: COLORS.red }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#4a6070]">Sweep:</span>
          <span className="text-white font-bold">{(stats.sweepRatio * 100).toFixed(0)}%</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#4a6070]">Unusual:</span>
          <span className="text-white font-bold">{stats.unusualCount}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[#4a6070]">Regime:</span>
          <span
            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
            style={{
              background: stats.regime === 'RISK_ON' ? COLORS.glowGreen
                : stats.regime === 'RISK_OFF' ? COLORS.glowRed
                : 'rgba(255,193,7,0.1)',
              color: stats.regime === 'RISK_ON' ? COLORS.green
                : stats.regime === 'RISK_OFF' ? COLORS.red
                : COLORS.yellow,
            }}
          >
            {stats.regime}
          </span>
        </div>
      </div>

      {/* Chart */}
      {chartOption ? (
        <ReactECharts
          option={chartOption}
          style={{ height: '280px' }}
          notMerge={true}
          lazyUpdate={true}
        />
      ) : (
        <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
          No flow time series data available
        </div>
      )}

      {/* Top unusual trades table */}
      {topTrades.length > 0 && (
        <div className="mt-4">
          <div className="text-[9px] uppercase tracking-wider mb-2"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            TOP UNUSUAL TRADES
          </div>
          <div className="space-y-1.5">
            {topTrades.map((trade, i) => (
              <div
                key={i}
                className="flex items-center justify-between px-3 py-2 rounded text-[10px]"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.03)',
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                <div className="flex items-center gap-3">
                  <span className="text-white font-bold">
                    ${trade.strike} {trade.expiry.split('T')[0].slice(5)}
                  </span>
                  <span
                    className="px-1.5 py-0.5 rounded text-[8px] font-bold"
                    style={{
                      background: trade.callPut === 'C' ? COLORS.glowGreen : COLORS.glowRed,
                      color: trade.callPut === 'C' ? COLORS.green : COLORS.red,
                    }}
                  >
                    {trade.callPut}
                  </span>
                  {trade.isSweep && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                      style={{ background: COLORS.glowCyan, color: COLORS.cyan }}>
                      SWEEP
                    </span>
                  )}
                  {trade.tradeType === 'BLOCK' && (
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                      style={{ background: 'rgba(255,193,7,0.1)', color: COLORS.yellow }}>
                      BLOCK
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-[#8b99b0]">
                    ${(trade.premium / 1000).toFixed(0)}K
                  </span>
                  <div className="flex gap-0.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <span
                        key={j}
                        className="text-[8px]"
                        style={{ color: j < trade.smartMoneyScore ? COLORS.cyan : '#2a4a5a' }}
                      >
                        ●
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
