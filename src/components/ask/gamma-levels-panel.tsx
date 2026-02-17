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

  // Pin zone detection (using API levels)
  const isPinZone = useMemo(() => {
    if (!callWall || !putWall || !currentPrice) return false;
    const diff = Math.abs(callWall - putWall);
    const avg = (callWall + putWall) / 2;
    return (diff / avg) < 0.02; // Within 2%
  }, [callWall, putWall, currentPrice]);

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

  // Prepare chart data
  const chartData = sortedByStrike.slice(0, 20); // Top 20 strikes

  const option = {
    grid: { top: 10, right: 10, bottom: 25, left: 50 },
    xAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { 
        fontSize: 8, 
        color: '#666',
        formatter: (v: number) => `$${(v/1000000).toFixed(0)}M`
      },
    },
    yAxis: {
      type: 'category',
      data: chartData.map(g => `$${g.strike}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 8, color: '#666' },
    },
    series: [
      {
        name: 'Call GEX',
        type: 'bar',
        data: chartData.map(g => g.callGex || 0),
        itemStyle: { color: COLORS.green, borderRadius: [0, 2, 2, 0] },
      },
      {
        name: 'Put GEX',
        type: 'bar',
        data: chartData.map(g => -(g.putGex || 0)),
        itemStyle: { color: COLORS.red, borderRadius: [2, 0, 0, 2] },
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
    },
    // Mark lines for key levels
    markLine: {
      silent: true,
      data: [
        ...(callWall ? [{ xAxis: callWall, lineStyle: { color: COLORS.green, type: 'dashed' }, label: { show: false } }] : []),
        ...(putWall ? [{ xAxis: putWall, lineStyle: { color: COLORS.red, type: 'dashed' }, label: { show: false } }] : []),
        ...(gexFlip ? [{ xAxis: gexFlip, lineStyle: { color: '#a855f7', type: 'dashed' }, label: { show: false } }] : []),
        ...(currentPrice ? [{ xAxis: currentPrice, lineStyle: { color: COLORS.cyan, type: 'solid', width: 2 }, label: { show: false } }] : []),
      ],
    },
  };

  return (
    <div 
      className="rounded-xl p-3 flex flex-col h-full"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center gap-2 mb-2 flex-shrink-0">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Gamma Exposure
        </h3>
        {/* Always show "Current" */}
        <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">
          Current
        </span>
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

      {/* Chart */}
      <div className="flex-1 min-h-0">
        <ReactECharts option={option} style={{ height: '100%' }} />
      </div>
      
      {/* Chart Legend */}
      <div className="flex items-center justify-center gap-4 mt-2 text-[9px]">
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-green-500 rounded-sm" />
          <span className="text-gray-500">Call GEX</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 bg-red-500 rounded-sm" />
          <span className="text-gray-500">Put GEX</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-0.5 bg-cyan-500" />
          <span className="text-gray-500">Current Price</span>
        </div>
      </div>
    </div>
  );
}

function LevelBadge({ label, value, color, isPin }: { label: string; value: number | null; color: string; isPin?: boolean }) {
  return (
    <div className={`p-1 rounded text-center ${isPin ? 'bg-purple-500/20 ring-1 ring-purple-500/50' : ''}`} style={{ background: isPin ? undefined : 'rgba(255,255,255,0.02)' }}>
      <div className="text-[8px] text-gray-500 uppercase">{label}</div>
      <div className="text-xs font-bold font-mono flex items-center justify-center gap-1" style={{ color }}>
        {value ? `$${value.toFixed(0)}` : '—'}
        {isPin && <span className="text-purple-400 text-xs">📍</span>}
      </div>
    </div>
  );
}
