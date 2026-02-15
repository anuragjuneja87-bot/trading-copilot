'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { GexStrike } from '@/types/flow';

interface OIDistributionChartProps {
  gexByStrike: GexStrike[];
  currentPrice: number;
}

export function OIDistributionChart({ gexByStrike, currentPrice }: OIDistributionChartProps) {
  const chartOption = useMemo(() => {
    if (!gexByStrike || gexByStrike.length === 0) {
      return null;
    }

    const range = currentPrice * 0.05;
    const filtered = [...gexByStrike]
      .filter(s => Math.abs(s.strike - currentPrice) <= range)
      .sort((a, b) => a.strike - b.strike);

    if (filtered.length === 0) return null;

    return {
      ...CHART_DEFAULTS,
      grid: { top: 20, right: 20, bottom: 30, left: 50 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        formatter: (params: any) => {
          const strike = params[0]?.name;
          const callOI = params[0]?.value || 0;
          const putOI = Math.abs(params[1]?.value || 0);
          const ratio = putOI > 0 ? (callOI / putOI).toFixed(2) : 'N/A';
          return `<div>
            <div style="font-weight:bold; margin-bottom:4px">${strike}</div>
            <div style="display:flex; justify-content:space-between; gap:16px">
              <span style="color:${COLORS.green}">Call OI: ${(callOI).toLocaleString()}</span>
            </div>
            <div style="display:flex; justify-content:space-between; gap:16px">
              <span style="color:${COLORS.red}">Put OI: ${(putOI).toLocaleString()}</span>
            </div>
            <div style="margin-top:4px; color:#8b99b0">C/P Ratio: ${ratio}</div>
          </div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: filtered.map(s => `$${s.strike}`),
        ...TRADING_THEME.categoryAxis,
        axisLabel: {
          ...TRADING_THEME.categoryAxis.axisLabel,
          interval: Math.max(0, Math.floor(filtered.length / 10) - 1),
          rotate: 45,
        },
      },
      yAxis: {
        type: 'value',
        ...TRADING_THEME.valueAxis,
        axisLabel: {
          ...TRADING_THEME.valueAxis.axisLabel,
          formatter: (v: number) => `${(Math.abs(v) / 1e3).toFixed(0)}K`,
        },
      },
      series: [
        {
          name: 'Call OI',
          type: 'bar',
          data: filtered.map(s => s.callOI),
          itemStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(0,230,118,0.7)' },
                { offset: 1, color: 'rgba(0,230,118,0.2)' },
              ],
            },
            borderRadius: [3, 3, 0, 0],
          },
        },
        {
          name: 'Put OI',
          type: 'bar',
          data: filtered.map(s => -s.putOI), // Negative for downward bars
          itemStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(255,82,82,0.2)' },
                { offset: 1, color: 'rgba(255,82,82,0.7)' },
              ],
            },
            borderRadius: [0, 0, 3, 3],
          },
        },
      ],
    };
  }, [gexByStrike, currentPrice]);

  if (!chartOption) return null;

  return (
    <ReactECharts
      option={chartOption}
      style={{ height: '300px', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
