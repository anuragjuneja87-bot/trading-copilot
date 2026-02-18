'use client';

import { useMemo, useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import ReactECharts from 'echarts-for-react';
import type { GexStrike } from '@/types/flow';

interface GammaLevelsPanelProps {
  ticker: string;
  gexByStrike: GexStrike[];
  currentPrice?: number;
}

export function GammaLevelsPanel({ ticker, gexByStrike, currentPrice }: GammaLevelsPanelProps) {
  // Fetch levels from API (single source of truth)
  const [apiLevels, setApiLevels] = useState<{
    callWall: number | null;
    putWall: number | null;
    maxGamma: number | null;
    gexFlip: number | null;
  } | null>(null);

  useEffect(() => {
    const fetchLevels = async () => {
      try {
        const res = await fetch(`/api/market/levels/${ticker}`);
        const json = await res.json();
        if (json.success && json.data) {
          setApiLevels({
            callWall: json.data.callWall,
            putWall: json.data.putWall,
            maxGamma: json.data.maxGamma,
            gexFlip: json.data.gexFlip,
          });
        }
      } catch (err) {
        console.error('[GammaLevelsPanel] Failed to fetch levels:', err);
      }
    };
    fetchLevels();
    const interval = setInterval(fetchLevels, 30000);
    return () => clearInterval(interval);
  }, [ticker]);

  // Use API levels for header cards (single source of truth)
  const callWall = apiLevels?.callWall || null;
  const putWall = apiLevels?.putWall || null;
  const maxGamma = apiLevels?.maxGamma || null;
  const gexFlip = apiLevels?.gexFlip || null;
  
  // Find GEX flip point from chart data (for visualization only)
  const sortedByStrike = [...gexByStrike].sort((a, b) => a.strike - b.strike);

  // Calculate Net GEX (total call GEX - total put GEX)
  const netGex = useMemo(() => {
    const totalCallGex = gexByStrike.reduce((sum, g) => sum + (g.callGex || 0), 0);
    const totalPutGex = gexByStrike.reduce((sum, g) => sum + (g.putGex || 0), 0);
    return totalCallGex - totalPutGex;
  }, [gexByStrike]);

  // GEX position indicator
  const gexPosition = useMemo(() => {
    const isPositive = netGex >= 0;
    const formatted = Math.abs(netGex) >= 1000000 
      ? `$${(Math.abs(netGex) / 1000000).toFixed(1)}M`
      : `$${(Math.abs(netGex) / 1000).toFixed(0)}K`;
    return {
      value: netGex,
      formatted: `${isPositive ? '+' : '-'}${formatted}`,
      label: isPositive ? 'POSITIVE GAMMA' : 'NEGATIVE GAMMA',
      color: isPositive ? COLORS.green : COLORS.red,
      icon: isPositive ? '📈' : '📉',
    };
  }, [netGex]);

  // Pin zone detection (using API levels)
  const isPinZone = useMemo(() => {
    if (!callWall || !putWall || !currentPrice) return false;
    const diff = Math.abs(callWall - putWall);
    const avg = (callWall + putWall) / 2;
    return (diff / avg) < 0.02; // Within 2%
  }, [callWall, putWall, currentPrice]);

  // Prepare chart data - filter strikes within 15% of current price
  const chartData = useMemo(() => {
    if (gexByStrike.length === 0 || !currentPrice) return sortedByStrike.slice(0, 20);
    
    const priceRange = currentPrice * 0.15; // 15% range
    const minStrike = currentPrice - priceRange;
    const maxStrike = currentPrice + priceRange;
    
    return sortedByStrike.filter(g => g.strike >= minStrike && g.strike <= maxStrike);
  }, [sortedByStrike, gexByStrike.length, currentPrice]);

  // Calculate x-axis min/max for proper centering
  const xAxisRange = useMemo(() => {
    if (chartData.length === 0) return { min: -5000000, max: 5000000 };
    
    const allValues: number[] = [];
    chartData.forEach(g => {
      allValues.push(g.callGex || 0);
      allValues.push(-(g.putGex || 0));
    });
    
    const maxAbs = Math.max(...allValues.map(Math.abs));
    const padding = maxAbs * 0.1; // 10% padding
    
    return {
      min: -(maxAbs + padding),
      max: maxAbs + padding,
    };
  }, [chartData]);

  // Calculate Net GEX by strike for the shift chart
  const netGexByStrike = useMemo(() => {
    if (gexByStrike.length === 0) return [];
    return sortedByStrike.map(g => ({
      strike: g.strike,
      netGex: (g.callGex || 0) - (g.putGex || 0),
    }));
  }, [sortedByStrike, gexByStrike.length]);

  // Create time series data for GEX shift (simulated - would need historical data for real implementation)
  // For now, we'll show Net GEX by strike as a proxy
  const gexShiftData = useMemo(() => {
    if (gexByStrike.length === 0) return [];
    // This is a placeholder - in production, this would fetch historical GEX data
    // For now, we'll create a simple distribution showing Net GEX across strikes
    const timeSlots = ['9:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '1:00', '1:30', '2:00', '2:30', '3:00', '3:30', '4:00'];
    const totalNetGex = netGex;
    
    // Simulate gradual change (in production, use real historical data)
    return timeSlots.map((time, idx) => {
      // Simulate GEX building up over time (simple linear interpolation)
      const progress = idx / (timeSlots.length - 1);
      const simulatedNetGex = totalNetGex * progress;
      return {
        time,
        netGex: simulatedNetGex,
      };
    });
  }, [netGex, gexByStrike.length]);

  // Early return after all hooks
  if (gexByStrike.length === 0) {
    return (
      <div 
        className="rounded-xl p-3 flex items-center justify-center h-full"
        style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
      >
        <span className="text-gray-500 text-xs">No GEX data available</span>
      </div>
    );
  }

  // Main bar chart option (top 65%)
  const barChartOption = {
    grid: { top: 10, right: 10, bottom: '38%', left: 50 },
    xAxis: {
      type: 'value',
      min: xAxisRange.min,
      max: xAxisRange.max,
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      splitNumber: 5,
      axisLabel: { 
        fontSize: 12,
        color: '#888',
        formatter: (value: number) => {
          if (value === 0) return '$0';
          const millions = value / 1000000;
          if (Math.abs(millions) >= 1) {
            return `$${millions.toFixed(0)}M`;
          }
          const thousands = value / 1000;
          return `$${thousands.toFixed(0)}K`;
        }
      },
    },
    yAxis: {
      type: 'category',
      data: chartData.map(g => `$${g.strike}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 12, color: '#666' },
    },
    series: [
      {
        name: 'Call GEX',
        type: 'bar',
        data: chartData.map(g => g.callGex || 0),
        itemStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#00e676' },
              { offset: 1, color: '#00bcd4' }
            ]
          },
          borderRadius: [0, 2, 2, 0] 
        },
      },
      {
        name: 'Put GEX',
        type: 'bar',
        data: chartData.map(g => -(g.putGex || 0)),
        itemStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 1, y2: 0,
            colorStops: [
              { offset: 0, color: '#ff5252' },
              { offset: 1, color: '#ff1744' }
            ]
          },
          borderRadius: [2, 0, 0, 2] 
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
    },
    // Mark line for current price (vertical line on category axis)
    markLine: {
      silent: true,
      data: currentPrice && chartData.length > 0 ? (() => {
        // Find the closest strike to current price
        let closestIndex = 0;
        let minDiff = Math.abs(chartData[0].strike - currentPrice);
        
        chartData.forEach((g, idx) => {
          const diff = Math.abs(g.strike - currentPrice);
          if (diff < minDiff) {
            minDiff = diff;
            closestIndex = idx;
          }
        });
        
        // Only show line if we're reasonably close (within 2% of a strike)
        if (minDiff < currentPrice * 0.02) {
          return [{
            yAxis: closestIndex,
            lineStyle: { color: '#00bcd4', type: 'dashed', width: 2 }, 
            label: { 
              show: true,
              position: 'end',
              formatter: 'Price',
              color: '#00bcd4',
              fontSize: 10,
            },
          }];
        }
        return [];
      })() : [],
    },
  };

  // GEX shift line chart option (bottom 35%)
  const shiftChartOption = {
    grid: { top: 5, right: 10, bottom: 25, left: 50 },
    xAxis: {
      type: 'category',
      data: gexShiftData.map(d => d.time),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { 
        fontSize: 11, 
        color: '#666',
        rotate: gexShiftData.length > 8 ? 45 : 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { 
        lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' },
        show: true,
      },
      axisLabel: { 
        fontSize: 12, 
        color: '#666',
        formatter: (v: number) => {
          const abs = Math.abs(v);
          if (abs >= 1000000) return `$${(v/1000000).toFixed(1)}M`;
          if (abs >= 1000) return `$${(v/1000).toFixed(0)}K`;
          return `$${v}`;
        }
      },
    },
    series: [
      {
        name: 'Net GEX',
        type: 'line',
        data: gexShiftData.map(d => d.netGex),
        smooth: true,
        symbol: 'none',
        lineStyle: { 
          color: netGex >= 0 ? '#00e676' : '#ff5252',
          width: 3 
        },
        areaStyle: {
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: netGex >= 0 
              ? [
                  { offset: 0, color: 'rgba(0,230,118,0.2)' },
                  { offset: 1, color: 'rgba(0,230,118,0)' }
                ]
              : [
                  { offset: 0, color: 'rgba(255,82,82,0.2)' },
                  { offset: 1, color: 'rgba(255,82,82,0)' }
                ]
          }
        },
        markLine: {
          silent: true,
          symbol: 'none',
          data: [{ yAxis: 0 }],
          lineStyle: { color: 'rgba(255,255,255,0.3)', type: 'dashed', width: 1 },
          label: { show: false },
        },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 10 },
      formatter: (params: any) => {
        const p = params[0];
        const value = p.value;
        const formatted = Math.abs(value) >= 1000000 
          ? `$${(value/1000000).toFixed(2)}M`
          : `$${(value/1000).toFixed(0)}K`;
        return `
          <div style="font-weight:bold">${p.name}</div>
          <div style="color:${value >= 0 ? '#00e676' : '#ff5252'}">Net GEX: ${formatted}</div>
        `;
      },
    },
  };

  return (
    <div 
      className="rounded-xl p-3 flex flex-col h-full max-h-full overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider">
            Gamma Exposure
          </h3>
          {/* Always show "Current" */}
          <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">
            Current
          </span>
        </div>
        {/* GEX Position Indicator */}
        <div 
          className="flex items-center gap-1 px-3 py-2 rounded text-base font-bold"
          style={{ 
            background: `${gexPosition.color}20`,
            color: gexPosition.color,
          }}
        >
          <span>{gexPosition.icon}</span>
          <span className="font-mono">{gexPosition.formatted}</span>
          <span className="text-gray-400">|</span>
          <span>{gexPosition.label}</span>
        </div>
      </div>

      {/* Pin Zone Alert */}
      {isPinZone && callWall && putWall && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-purple-500/50 mb-3">
          <span className="text-lg">📍</span>
          <div>
            <span className="text-sm font-bold text-purple-400">PIN ZONE DETECTED</span>
            <span className="text-xs text-gray-400 ml-2">
              Call Wall (${callWall.toFixed(0)}) ≈ Put Wall (${putWall.toFixed(0)}) — Expect price magnet effect
            </span>
          </div>
        </div>
      )}

      {/* Key Levels Summary */}
      <div className="grid grid-cols-4 gap-1 mb-2 text-center">
        <LevelBadge label="Call Wall" value={callWall} color={COLORS.red} isPin={isPinZone} />
        <LevelBadge label="Max Γ" value={maxGamma} color={COLORS.cyan} />
        <LevelBadge label="GEX Flip" value={gexFlip} color="#a855f7" />
        <LevelBadge label="Put Wall" value={putWall} color={COLORS.green} isPin={isPinZone} />
      </div>

      {/* Charts - Split Layout */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Top 55%: Bar Chart */}
        <div className="h-[200px] overflow-hidden">
          <ReactECharts option={barChartOption} style={{ height: '100%', width: '100%' }} />
        </div>
        
        {/* Bottom 35%: GEX Shift Chart */}
        <div className="h-[150px] overflow-hidden border-t" style={{ borderColor: COLORS.cardBorder }}>
          <ReactECharts option={shiftChartOption} style={{ height: '100%', width: '100%' }} />
        </div>
      </div>
      
      {/* Chart Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[9px] flex-shrink-0">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: 'linear-gradient(to right, #00e676, #00bcd4)' }} />
          <span className="text-gray-500">Call GEX</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-sm" style={{ background: 'linear-gradient(to right, #ff5252, #ff1744)' }} />
          <span className="text-gray-500">Put GEX</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-white" />
          <span className="text-gray-500">Current Price</span>
        </div>
      </div>
    </div>
  );
}

function LevelBadge({ label, value, color, isPin }: { label: string; value: number | null; color: string; isPin?: boolean }) {
  return (
    <div className={`p-3 rounded text-center ${isPin ? 'bg-purple-500/20 ring-1 ring-purple-500/50' : ''}`} style={{ background: isPin ? undefined : 'rgba(255,255,255,0.02)' }}>
      <div className="text-sm text-gray-400 mb-1 uppercase">{label}</div>
      <div className="text-2xl font-bold font-mono flex items-center justify-center gap-1" style={{ color }}>
        {value ? `$${value.toFixed(0)}` : '—'}
        {isPin && <span className="text-purple-400 text-sm">📍</span>}
      </div>
    </div>
  );
}
