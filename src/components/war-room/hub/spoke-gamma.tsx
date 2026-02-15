'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { TRADING_THEME, CHART_DEFAULTS, COLORS } from '@/lib/echarts-theme';
import type { GexStrike } from '@/types/flow';

interface SpokeGammaProps {
  gexByStrike: GexStrike[];
  currentPrice: number;
  callWall: number;
  putWall: number;
  maxGamma: number;
}

export function SpokeGamma({ gexByStrike, currentPrice, callWall, putWall, maxGamma }: SpokeGammaProps) {
  const chartOption = useMemo(() => {
    if (!gexByStrike || gexByStrike.length === 0) {
      return null;
    }

    // Sort strikes ascending
    const sorted = [...gexByStrike].sort((a, b) => a.strike - b.strike);
    // Only show strikes within a reasonable range of current price (+/- 5%)
    const range = currentPrice * 0.05;
    const filtered = sorted.filter(s => Math.abs(s.strike - currentPrice) <= range);

    if (filtered.length === 0) {
      return null;
    }

    return {
      ...CHART_DEFAULTS,
      grid: { top: 10, right: 60, bottom: 24, left: 60 },
      tooltip: {
        ...TRADING_THEME.tooltip,
        trigger: 'axis',
        formatter: (params: any) => {
          const param = params[0];
          const strike = parseFloat(param.name.replace('$', ''));
          const strikeData = filtered.find(s => s.strike === strike);
          if (!strikeData) return '';
          return `<div>
            <div style="font-weight:bold; margin-bottom:4px">Strike: $${strike}</div>
            <div>Call GEX: $${(strikeData.callGex / 1000000).toFixed(2)}M</div>
            <div>Put GEX: $${(strikeData.putGex / 1000000).toFixed(2)}M</div>
            <div>Net GEX: $${(strikeData.netGex / 1000000).toFixed(2)}M</div>
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
        data: filtered.map(s => `$${s.strike}`),
        ...TRADING_THEME.categoryAxis,
        axisLabel: {
          color: (value: string) => {
            const price = parseFloat(value.replace('$', ''));
            if (price === callWall) return COLORS.green;
            if (price === putWall) return COLORS.red;
            if (price === maxGamma) return COLORS.cyan;
            return '#4a6070';
          },
          fontWeight: (value: string) => {
            const price = parseFloat(value.replace('$', ''));
            if ([callWall, putWall, maxGamma].includes(price)) return 700;
            return 400;
          },
        },
      },
      series: [
        {
          name: 'Call GEX',
          type: 'bar',
          data: filtered.map(s => s.callGex || s.callPremium || 0),
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(0,230,118,0.2)' },
                { offset: 1, color: 'rgba(0,230,118,0.7)' },
              ],
            },
            borderRadius: [0, 3, 3, 0],
          },
          markLine: {
            data: [
              { yAxis: callWall, name: 'CALL WALL', lineStyle: { color: COLORS.green, type: 'dashed', width: 2 } },
              { yAxis: maxGamma, name: 'MAX γ', lineStyle: { color: COLORS.cyan, type: 'dashed', width: 2 } },
              { yAxis: currentPrice, name: 'PRICE', lineStyle: { color: '#ffffff', type: 'dashed', width: 2 } },
              { yAxis: putWall, name: 'PUT WALL', lineStyle: { color: COLORS.red, type: 'dashed', width: 2 } },
            ],
            label: { show: true, position: 'end', color: '#8b99b0', fontSize: 9 },
          },
        },
        {
          name: 'Put GEX',
          type: 'bar',
          data: filtered.map(s => -(s.putGex || s.putPremium || 0)),
          itemStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: 'rgba(255,82,82,0.7)' },
                { offset: 1, color: 'rgba(255,82,82,0.2)' },
              ],
            },
            borderRadius: [3, 0, 0, 3],
          },
        },
      ],
    };
  }, [gexByStrike, currentPrice, callWall, putWall, maxGamma]);

  return (
    <div>
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
          No GEX strike data available
        </div>
      )}

      {/* Key levels summary */}
      <div className="flex flex-wrap gap-2 mt-4 justify-center">
        <span className="px-3 py-1.5 rounded text-[10px] font-bold"
          style={{ background: COLORS.glowGreen, color: COLORS.green }}>
          CALL WALL ${callWall}
        </span>
        <span className="px-3 py-1.5 rounded text-[10px] font-bold"
          style={{ background: COLORS.glowCyan, color: COLORS.cyan }}>
          MAX γ ${maxGamma}
        </span>
        <span className="px-3 py-1.5 rounded text-[10px] font-bold text-white"
          style={{ background: 'rgba(255,255,255,0.1)' }}>
          PRICE ${currentPrice.toFixed(2)}
        </span>
        <span className="px-3 py-1.5 rounded text-[10px] font-bold"
          style={{ background: COLORS.glowRed, color: COLORS.red }}>
          PUT WALL ${putWall}
        </span>
      </div>
    </div>
  );
}
