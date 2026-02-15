'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { DarkPoolPrint, DarkPoolStats } from '@/types/darkpool';

interface SpokeDarkPoolProps {
  prints: DarkPoolPrint[];
  stats: DarkPoolStats | null;
}

export function SpokeDarkPool({ prints, stats }: SpokeDarkPoolProps) {
  const chartOption = useMemo(() => {
    if (!prints || prints.length === 0) {
      return null;
    }

    const scatterData = prints.map(p => ({
      value: [
        new Date(p.timestamp).getTime(),
        p.price,
        p.value,        // bubble size
        p.side,          // for color
        p.significance,  // for tooltip
      ],
      itemStyle: {
        color: p.side === 'BULLISH' ? 'rgba(0,230,118,0.6)'
             : p.side === 'BEARISH' ? 'rgba(255,82,82,0.6)'
             : 'rgba(139,153,176,0.3)',
        borderColor: p.side === 'BULLISH' ? '#00e676'
                 : p.side === 'BEARISH' ? '#ff5252'
                 : '#4a6070',
        borderWidth: p.significance >= 4 ? 2 : 1,
        shadowBlur: p.significance >= 4 ? 10 : 0,
        shadowColor: p.side === 'BULLISH' ? 'rgba(0,230,118,0.3)'
                 : p.side === 'BEARISH' ? 'rgba(255,82,82,0.3)'
                 : 'transparent',
      },
    }));

    // Calculate bubble size range
    const maxValue = Math.max(...prints.map(p => p.value), 1);

    return {
      ...CHART_DEFAULTS,
      grid: { top: 10, right: 12, bottom: 30, left: 50 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        formatter: (params: any) => {
          const [time, price, value, side, sig] = params.value;
          return `<div>
            <div style="color:${side === 'BULLISH' ? COLORS.green : side === 'BEARISH' ? COLORS.red : COLORS.muted}; font-weight:bold">${side}</div>
            <div>Price: $${price.toFixed(2)}</div>
            <div>Value: $${(value / 1000000).toFixed(2)}M</div>
            <div>Significance: ${'●'.repeat(sig)}${'○'.repeat(5 - sig)}</div>
            <div style="color:#4a6070">${new Date(time).toLocaleTimeString()}</div>
          </div>`;
        },
      },
      xAxis: {
        type: 'time',
        ...TRADING_THEME.categoryAxis,
        axisLabel: {
          ...TRADING_THEME.categoryAxis.axisLabel,
          formatter: (value: number) => new Date(value).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        },
      },
      yAxis: {
        type: 'value',
        ...TRADING_THEME.valueAxis,
        axisLabel: {
          ...TRADING_THEME.valueAxis.axisLabel,
          formatter: (v: number) => `$${v.toFixed(0)}`,
        },
        scale: true,
      },
      series: [{
        type: 'scatter',
        data: scatterData,
        symbolSize: (data: any) => {
          const val = data[2];
          // Scale: min 6px, max 40px
          return Math.max(6, Math.min(40, (val / maxValue) * 40));
        },
      }],
    };
  }, [prints]);

  if (!stats) {
    return (
      <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
        No dark pool prints detected
      </div>
    );
  }

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-3 text-[10px]"
        style={{ fontFamily: "'Oxanium', monospace" }}>
        <div className="flex items-center gap-2">
          <span className="text-[#4a6070]">Total Value:</span>
          <span className="text-white font-bold">
            ${stats.totalValue >= 1000000 ? `${(stats.totalValue / 1000000).toFixed(1)}M` : `${(stats.totalValue / 1000).toFixed(0)}K`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#4a6070]">Prints:</span>
          <span className="text-white font-bold">{stats.printCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#4a6070]">Regime:</span>
          <span
            className="px-2 py-0.5 rounded text-[9px] font-bold uppercase"
            style={{
              background: stats.regime === 'ACCUMULATION' ? COLORS.glowGreen
                : stats.regime === 'DISTRIBUTION' ? COLORS.glowRed
                : 'rgba(255,193,7,0.1)',
              color: stats.regime === 'ACCUMULATION' ? COLORS.green
                : stats.regime === 'DISTRIBUTION' ? COLORS.red
                : COLORS.yellow,
            }}
          >
            {stats.regime}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <div className="w-24 h-1.5 rounded-full overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <div className="h-full flex">
              <div className="h-full" style={{ width: `${stats.bullishPct}%`, background: COLORS.green }} />
              <div className="h-full" style={{ width: `${stats.bearishPct}%`, background: COLORS.red }} />
            </div>
          </div>
          <span className="text-[#4a6070] text-[9px]">
            {stats.bullishPct.toFixed(0)}% / {stats.bearishPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Chart */}
      {chartOption ? (
        <ReactECharts
          option={chartOption}
          style={{ height: '250px' }}
          notMerge={true}
          lazyUpdate={true}
        />
      ) : (
        <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
          No dark pool prints detected
        </div>
      )}
    </div>
  );
}
