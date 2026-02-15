'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { GexStrike } from '@/types/flow';

interface NetGexChartProps {
  gexByStrike: GexStrike[];
  currentPrice: number;
}

export function NetGexChart({ gexByStrike, currentPrice }: NetGexChartProps) {
  const chartOption = useMemo(() => {
    if (!gexByStrike || gexByStrike.length === 0) {
      return null;
    }

    const range = currentPrice * 0.05;
    const filtered = [...gexByStrike]
      .filter(s => Math.abs(s.strike - currentPrice) <= range)
      .sort((a, b) => a.strike - b.strike);

    if (filtered.length === 0) return null;

    const netGexData = filtered.map(s => s.netGex || (s.callGex - s.putGex));

    return {
      ...CHART_DEFAULTS,
      grid: { top: 30, right: 20, bottom: 30, left: 60 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        formatter: (params: any) => {
          const p = params[0];
          const net = p?.value || 0;
          return `<div>
            <div style="font-weight:bold; margin-bottom:2px">${p?.name}</div>
            <div style="color:${net >= 0 ? COLORS.green : COLORS.red}; font-weight:bold">
              Net GEX: ${net >= 0 ? '+' : ''}${(net / 1e6).toFixed(2)}M
            </div>
            <div style="color:#4a6070; font-size:10px; margin-top:2px">
              ${net >= 0 ? '↕ Mean-reverting zone (dealer long gamma)' : '→ Trending zone (dealer short gamma)'}
            </div>
          </div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: filtered.map(s => `$${s.strike}`),
        ...TRADING_THEME.categoryAxis,
        boundaryGap: false,
        axisLabel: {
          ...TRADING_THEME.categoryAxis.axisLabel,
          interval: Math.max(0, Math.floor(filtered.length / 10) - 1),
        },
      },
      yAxis: {
        type: 'value',
        ...TRADING_THEME.valueAxis,
        axisLabel: {
          ...TRADING_THEME.valueAxis.axisLabel,
          formatter: (v: number) => `${(v / 1e6).toFixed(1)}M`,
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      },
      markLine: {
        silent: true,
        symbol: 'none',
        data: [{ yAxis: 0 }],
        lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' },
        label: { show: false },
      },
      series: [{
        name: 'Net GEX',
        type: 'line',
        data: netGexData,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: COLORS.cyan },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(0,230,118,0.2)' },
              { offset: 0.5, color: 'rgba(0,230,118,0.1)' },
              { offset: 0.5, color: 'rgba(255,82,82,0.1)' },
              { offset: 1, color: 'rgba(255,82,82,0.2)' },
            ],
          },
        },
      }],
      visualMap: {
        show: false,
        pieces: [
          { gte: 0, color: COLORS.green },
          { lt: 0, color: COLORS.red },
        ],
        seriesIndex: 0,
      },
    };
  }, [gexByStrike, currentPrice]);

  if (!chartOption) return null;

  return (
    <ReactECharts
      option={chartOption}
      style={{ height: '280px', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
