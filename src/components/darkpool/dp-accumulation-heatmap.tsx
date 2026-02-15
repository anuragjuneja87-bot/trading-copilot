'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { PriceLevel } from '@/types/darkpool';

interface DPHeatmapProps {
  priceLevels: PriceLevel[];
  currentPrice?: number;
}

export function DPAccumulationHeatmap({ priceLevels, currentPrice }: DPHeatmapProps) {
  const chartOption = useMemo(() => {
    if (!priceLevels || priceLevels.length === 0) {
      return null;
    }

    // Sort by price descending (highest price at top)
    const sorted = [...priceLevels]
      .sort((a, b) => b.price - a.price)
      .slice(0, 20); // Top 20 levels

    return {
      ...CHART_DEFAULTS,
      grid: { top: 10, right: 20, bottom: 24, left: 70 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const bullish = params[0];
          const bearish = params[1];
          const price = bullish?.name || '';
          const bVal = Math.abs(bullish?.value || 0);
          const sVal = Math.abs(bearish?.value || 0);
          const total = bVal + sVal;
          return `<div style="min-width:160px">
            <div style="font-weight:bold; margin-bottom:4px">${price}</div>
            <div style="display:flex; justify-content:space-between"><span style="color:${COLORS.green}">● Bullish</span><span>$${(bVal / 1e6).toFixed(2)}M</span></div>
            <div style="display:flex; justify-content:space-between"><span style="color:${COLORS.red}">● Bearish</span><span>$${(sVal / 1e6).toFixed(2)}M</span></div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px"><span style="color:#8b99b0">Total</span><span style="font-weight:bold">$${(total / 1e6).toFixed(2)}M</span></div>
          </div>`;
        },
      },
      xAxis: {
        type: 'value',
        ...TRADING_THEME.valueAxis,
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: sorted.map(l => `$${l.price.toFixed(2)}`),
        ...TRADING_THEME.categoryAxis,
        axisLabel: {
          color: (value: string) => {
            if (!currentPrice) return '#8b99b0';
            const p = parseFloat(value.replace('$', ''));
            if (Math.abs(p - currentPrice) < currentPrice * 0.001) return COLORS.cyan;
            return '#8b99b0';
          },
          fontSize: 10,
          fontFamily: "'Oxanium', monospace",
          fontWeight: (value: string) => {
            if (!currentPrice) return 400;
            const p = parseFloat(value.replace('$', ''));
            if (Math.abs(p - currentPrice) < currentPrice * 0.001) return 700;
            return 400;
          },
        },
      },
      series: [
        {
          name: 'Bullish',
          type: 'bar',
          stack: 'total',
          data: sorted.map(l => l.bullishValue),
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(0,230,118,0.3)' },
                { offset: 1, color: 'rgba(0,230,118,0.7)' },
              ],
            },
            borderRadius: [0, 3, 3, 0],
          },
        },
        {
          name: 'Bearish',
          type: 'bar',
          stack: 'total',
          data: sorted.map(l => l.bearishValue),
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(255,82,82,0.3)' },
                { offset: 1, color: 'rgba(255,82,82,0.7)' },
              ],
            },
            borderRadius: [0, 3, 3, 0],
          },
        },
      ],
    };
  }, [priceLevels, currentPrice]);

  if (!chartOption) {
    return (
      <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
        No accumulation zones detected
      </div>
    );
  }

  return (
    <ReactECharts
      option={chartOption}
      style={{ height: `${Math.max(250, Math.min(priceLevels.length, 20) * 28)}px`, width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
