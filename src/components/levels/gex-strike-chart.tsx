'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { GexStrike } from '@/types/flow';

interface GexStrikeChartProps {
  gexByStrike: GexStrike[];
  currentPrice: number;
  callWall: number;
  putWall: number;
  maxGamma: number;
}

export function GexStrikeChart({ gexByStrike, currentPrice, callWall, putWall, maxGamma }: GexStrikeChartProps) {
  const chartOption = useMemo(() => {
    if (!gexByStrike || gexByStrike.length === 0) {
      return null;
    }

    // Sort strikes ascending, filter to ±5% of current price
    const range = currentPrice * 0.05;
    const filtered = [...gexByStrike]
      .filter(s => Math.abs(s.strike - currentPrice) <= range)
      .sort((a, b) => a.strike - b.strike);

    if (filtered.length === 0) return null;

    const strikes = filtered.map(s => `$${s.strike}`);

    return {
      ...CHART_DEFAULTS,
      grid: { top: 20, right: 30, bottom: 30, left: 80 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: any) => {
          const strike = params[0]?.name || '';
          const callVal = params[0]?.value || 0;
          const putVal = Math.abs(params[1]?.value || 0);
          const net = callVal - putVal;
          const price = parseFloat(strike.replace('$', ''));
          const isKeyLevel = [callWall, putWall, maxGamma].some(l =>
            Math.abs(price - l) < 0.01
          );
          return `<div style="min-width:180px">
            <div style="font-weight:bold; margin-bottom:4px; ${isKeyLevel ? 'color:#00e5ff' : ''}">${strike} ${isKeyLevel ? '★' : ''}</div>
            <div style="display:flex; justify-content:space-between"><span style="color:${COLORS.green}">● Call GEX</span><span>${(callVal / 1e6).toFixed(2)}M</span></div>
            <div style="display:flex; justify-content:space-between"><span style="color:${COLORS.red}">● Put GEX</span><span>${(putVal / 1e6).toFixed(2)}M</span></div>
            <div style="display:flex; justify-content:space-between; margin-top:4px; border-top:1px solid rgba(255,255,255,0.1); padding-top:4px">
              <span style="color:#8b99b0">Net GEX</span>
              <span style="font-weight:bold; color:${net >= 0 ? COLORS.green : COLORS.red}">${net >= 0 ? '+' : ''}${(net / 1e6).toFixed(2)}M</span>
            </div>
          </div>`;
        },
      },
      xAxis: {
        type: 'value',
        ...TRADING_THEME.valueAxis,
        axisLabel: {
          ...TRADING_THEME.valueAxis.axisLabel,
          formatter: (v: number) => {
            const abs = Math.abs(v);
            return abs >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : `${(v / 1e3).toFixed(0)}K`;
          },
        },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      },
      yAxis: {
        type: 'category',
        data: strikes,
        ...TRADING_THEME.categoryAxis,
        axisLabel: {
          fontSize: 10,
          fontFamily: "'Oxanium', monospace",
          formatter: (value: string) => {
            const price = parseFloat(value.replace('$', ''));
            // Add marker for key levels
            if (Math.abs(price - callWall) < 0.01) return `${value}  ▸ CALL WALL`;
            if (Math.abs(price - putWall) < 0.01) return `${value}  ▸ PUT WALL`;
            if (Math.abs(price - maxGamma) < 0.01) return `${value}  ▸ MAX γ`;
            if (Math.abs(price - currentPrice) < (currentPrice * 0.002)) return `${value}  ◈ PRICE`;
            return value;
          },
          color: (value: string) => {
            const price = parseFloat(value.replace('$', ''));
            if (Math.abs(price - callWall) < 0.01) return COLORS.green;
            if (Math.abs(price - putWall) < 0.01) return COLORS.red;
            if (Math.abs(price - maxGamma) < 0.01) return COLORS.cyan;
            if (Math.abs(price - currentPrice) < (currentPrice * 0.002)) return '#ffffff';
            return '#4a6070';
          },
        },
      },
      series: [
        {
          name: 'Call GEX',
          type: 'bar',
          data: filtered.map(s => s.callGex),
          itemStyle: {
            color: (params: any) => {
              const strike = filtered[params.dataIndex].strike;
              const isCallWall = Math.abs(strike - callWall) < 0.01;
              return {
                type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: isCallWall ? 'rgba(0,230,118,0.4)' : 'rgba(0,230,118,0.15)' },
                  { offset: 1, color: isCallWall ? 'rgba(0,230,118,0.9)' : 'rgba(0,230,118,0.6)' },
                ],
              };
            },
            borderRadius: [0, 4, 4, 0],
          },
        },
        {
          name: 'Put GEX',
          type: 'bar',
          data: filtered.map(s => -s.putGex), // Negative so bars go left
          itemStyle: {
            color: (params: any) => {
              const strike = filtered[params.dataIndex].strike;
              const isPutWall = Math.abs(strike - putWall) < 0.01;
              return {
                type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
                colorStops: [
                  { offset: 0, color: isPutWall ? 'rgba(255,82,82,0.9)' : 'rgba(255,82,82,0.6)' },
                  { offset: 1, color: isPutWall ? 'rgba(255,82,82,0.4)' : 'rgba(255,82,82,0.15)' },
                ],
              };
            },
            borderRadius: [4, 0, 0, 4],
          },
        },
      ],
    };
  }, [gexByStrike, currentPrice, callWall, putWall, maxGamma]);

  if (!chartOption) {
    return (
      <div className="flex items-center justify-center h-[500px] text-[11px] text-[#4a6070]">
        No GEX data available for this ticker
      </div>
    );
  }

  return (
    <ReactECharts
      option={chartOption}
      style={{ height: '500px', width: '100%' }}
      notMerge={true}
      lazyUpdate={true}
    />
  );
}
