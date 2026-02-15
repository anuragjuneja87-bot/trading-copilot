'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { DarkPoolPrint } from '@/types/darkpool';

interface DPBubbleChartProps {
  prints: DarkPoolPrint[];
}

export function DPBubbleChart({ prints }: DPBubbleChartProps) {
  const chartOption = useMemo(() => {
    if (!prints || prints.length === 0) {
      return null;
    }

    const maxValue = Math.max(...prints.map(p => p.value), 1);

    return {
      ...CHART_DEFAULTS,
      grid: { top: 20, right: 20, bottom: 50, left: 60 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        formatter: (params: any) => {
          const [time, price, value, side, sig, ticker] = params.value;
          const sigDots = '●'.repeat(sig) + '○'.repeat(5 - sig);
          return `<div style="min-width:160px">
            <div style="font-weight:bold; color:${side === 'BULLISH' ? COLORS.green : side === 'BEARISH' ? COLORS.red : COLORS.muted}; margin-bottom:4px">${ticker} — ${side}</div>
            <div style="display:flex; justify-content:space-between"><span style="color:#4a6070">Price</span><span>$${price.toFixed(2)}</span></div>
            <div style="display:flex; justify-content:space-between"><span style="color:#4a6070">Value</span><span>$${(value / 1e6).toFixed(2)}M</span></div>
            <div style="display:flex; justify-content:space-between"><span style="color:#4a6070">Significance</span><span>${sigDots}</span></div>
            <div style="color:#4a6070; margin-top:4px; font-size:10px">${new Date(time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
          </div>`;
        },
      },
      xAxis: {
        type: 'time',
        ...TRADING_THEME.categoryAxis,
        axisLabel: {
          ...TRADING_THEME.categoryAxis.axisLabel,
          formatter: (val: number) => new Date(val).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        },
      },
      yAxis: {
        type: 'value',
        ...TRADING_THEME.valueAxis,
        scale: true,
        axisLabel: {
          ...TRADING_THEME.valueAxis.axisLabel,
          formatter: (v: number) => `$${v.toFixed(0)}`,
        },
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
        },
      ],
      series: [{
        type: 'scatter',
        data: prints.map(p => ({
          value: [p.timestampMs, p.price, p.value, p.side, p.significance, p.ticker],
          itemStyle: {
            color: p.side === 'BULLISH' ? 'rgba(0,230,118,0.5)'
              : p.side === 'BEARISH' ? 'rgba(255,82,82,0.5)'
              : 'rgba(139,153,176,0.25)',
            borderColor: p.side === 'BULLISH' ? '#00e676'
              : p.side === 'BEARISH' ? '#ff5252'
              : '#4a6070',
            borderWidth: p.significance >= 4 ? 2 : 1,
            shadowBlur: p.significance >= 4 ? 12 : 0,
            shadowColor: p.side === 'BULLISH' ? 'rgba(0,230,118,0.4)'
              : p.side === 'BEARISH' ? 'rgba(255,82,82,0.4)'
              : 'transparent',
          },
        })),
        symbolSize: (data: number[]) => {
          const val = data[2];
          return Math.max(8, Math.min(50, (val / maxValue) * 50));
        },
      }],
    };
  }, [prints]);

  if (!chartOption) {
    return (
      <div className="flex items-center justify-center h-[450px] text-[11px] text-[#4a6070]">
        No dark pool prints to display
      </div>
    );
  }

  return (
    <ReactECharts
      option={chartOption}
      style={{ height: '450px', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
