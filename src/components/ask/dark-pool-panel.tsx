'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import ReactECharts from 'echarts-for-react';

// Safety check
if (!COLORS) {
  console.error('[DarkPoolPanel] COLORS is undefined!');
}

import { DataSourceBadge } from '@/components/war-room/data-source-badge';

interface DarkPoolPanelProps {
  prints: any[];
  stats: any;
  loading: boolean;
  error: string | null;
  currentPrice: number;
  vwap: number | null;
  timeframeRange?: {
    from: number;
    to: number;
    label: string;
    isMarketClosed: boolean;
    tradingDay?: string;
  };
  meta?: {
    isMarketClosed?: boolean;
    tradingDay?: string;
    dataFrom?: string;
    dataTo?: string;
  };
}

export function DarkPoolPanel({ 
  prints, 
  stats, 
  loading, 
  error,
  currentPrice,
  vwap,
  timeframeRange,
  meta,
}: DarkPoolPanelProps) {
  // Guard against undefined stats
  if (!stats && !loading) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        No data available
      </div>
    );
  }

  const regime = stats?.regime || 'NEUTRAL';
  const regimeColor = regime === 'ACCUMULATION' ? COLORS.green : 
                      regime === 'DISTRIBUTION' ? COLORS.red : COLORS.yellow;

  // Calculate if dark pool activity is above or below VWAP
  const avgDpPrice = useMemo(() => {
    if (!prints.length) return null;
    const totalValue = prints.reduce((sum, p) => sum + (p.value || p.price * p.size), 0);
    const totalShares = prints.reduce((sum, p) => sum + p.size, 0);
    return totalShares > 0 ? totalValue / totalShares : null;
  }, [prints]);

  const dpVsVwap = useMemo(() => {
    if (!avgDpPrice || !vwap) return null;
    return avgDpPrice > vwap ? 'ABOVE' : 'BELOW';
  }, [avgDpPrice, vwap]);

  const formatValue = (v: number) => {
    if (v >= 1000000000) return `$${(v / 1000000000).toFixed(1)}B`;
    if (v >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
    if (v >= 1000) return `$${(v / 1000).toFixed(0)}K`;
    return `$${v}`;
  };

  return (
    <div 
      className="rounded-xl p-3 flex flex-col h-full"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Dark Pool
          </h3>
          {/* Timeframe + Market Status */}
          {timeframeRange && (
            <span className={`text-[10px] px-2 py-0.5 rounded ${
              timeframeRange.isMarketClosed 
                ? 'text-yellow-500 bg-yellow-500/10' 
                : 'text-gray-500 bg-white/5'
            }`}>
              {timeframeRange.isMarketClosed 
                ? `⚠️ ${timeframeRange.tradingDay || timeframeRange.label}` 
                : timeframeRange.label
              }
            </span>
          )}
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={{ background: `${regimeColor}20`, color: regimeColor }}
          >
            {regime}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* VWAP Indicator */}
          {dpVsVwap && (
            <div 
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
              style={{ 
                background: dpVsVwap === 'ABOVE' ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)',
                color: dpVsVwap === 'ABOVE' ? COLORS.green : COLORS.red,
              }}
            >
              {dpVsVwap === 'ABOVE' ? '↑' : '↓'} VWAP
            </div>
          )}
        </div>
      </div>

      {/* Key Stats */}
      <div className="grid grid-cols-3 gap-2 mb-2 text-center">
        <StatBox 
          label="Volume" 
          value={formatValue(stats?.totalValue || 0)}
          color={COLORS.white}
        />
        <StatBox 
          label="Bullish" 
          value={`${stats?.bullishPct || 0}%`}
          color={(stats?.bullishPct || 0) > 50 ? COLORS.green : COLORS.red}
        />
        <StatBox 
          label="Prints" 
          value={prints.length.toString()}
          color="#888"
        />
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            Loading...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400 text-xs">
            {error}
          </div>
        ) : prints.length > 0 ? (
          <DarkPoolChart prints={prints} vwap={vwap} />
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs text-center">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm">No dark pool prints</div>
            <div className="text-xs text-gray-600 mt-1">
              {timeframeRange?.isMarketClosed 
                ? `Market was closed. Showing ${timeframeRange.tradingDay} data.`
                : `No block trades in selected timeframe.`
              }
            </div>
          </div>
        )}
      </div>

      {/* Top Prints List */}
      {prints.length > 0 && (
        <div className="mt-2 space-y-1 max-h-20 overflow-y-auto">
          {prints.slice(0, 3).map((print, i) => (
            <div 
              key={i}
              className="flex items-center justify-between p-1.5 rounded text-[11px]"
              style={{ background: 'rgba(255,255,255,0.02)' }}
            >
              <div className="flex items-center gap-2">
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ 
                    background: print.side === 'BULLISH' ? COLORS.green : 
                               print.side === 'BEARISH' ? COLORS.red : COLORS.yellow 
                  }}
                />
                <span className="font-mono text-white">${print.price?.toFixed(2)}</span>
              </div>
              <span className="text-gray-400">{formatValue(print.value || print.price * print.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="p-1.5 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="text-[9px] text-gray-500 uppercase">{label}</div>
      <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function DarkPoolChart({ prints, vwap }: { prints: any[]; vwap: number | null }) {
  // Debug log
  console.log('[DarkPoolChart] Prints sample:', prints?.slice(0, 3));
  
  // Group prints by price level
  const priceLevels = useMemo(() => {
    if (!prints || prints.length === 0) return [];
    
    const levels = new Map<string, { price: number; total: number; bullish: number; bearish: number; neutral: number }>();
    
    prints.forEach(p => {
      if (!p.price || p.price === 0) return;
      
      // Round to nearest dollar for cleaner grouping
      const priceKey = Math.round(p.price).toString();
      const value = p.value || (p.price * (p.size || 0));
      
      if (value === 0) return;
      
      const existing = levels.get(priceKey) || { 
        price: Math.round(p.price), 
        total: 0, 
        bullish: 0, 
        bearish: 0, 
        neutral: 0 
      };
      
      existing.total += value;
      
      // Determine side - handle various formats
      const side = (p.side || p.sentiment || 'NEUTRAL').toString().toUpperCase();
      
      if (side.includes('BULL') || side === 'POSITIVE' || side === 'BUY') {
        existing.bullish += value;
      } else if (side.includes('BEAR') || side === 'NEGATIVE' || side === 'SELL') {
        existing.bearish += value;
      } else {
        existing.neutral += value;
      }
      
      levels.set(priceKey, existing);
    });
    
    // Convert to array, sort by total, take top 8
    const result = Array.from(levels.values())
      .filter(l => l.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 8)
      .sort((a, b) => a.price - b.price); // Re-sort by price for display
    
    console.log('[DarkPoolChart] Grouped data:', result);
    
    return result;
  }, [prints]);

  if (priceLevels.length === 0) {
    // Even if no grouped data, show the raw prints summary
    if (prints && prints.length > 0) {
      const totalValue = prints.reduce((sum, p) => sum + (p.value || p.price * p.size || 0), 0);
      return (
        <div className="h-full flex flex-col items-center justify-center text-gray-400 text-xs">
          <div>{prints.length} prints</div>
          <div className="text-white font-mono">${(totalValue / 1000000).toFixed(1)}M total</div>
          <div className="text-[10px] mt-1">(No price level grouping)</div>
        </div>
      );
    }
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        No chart data
      </div>
    );
  }

  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 50 },
    xAxis: {
      type: 'category',
      data: priceLevels.map(l => `$${l.price}`),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { 
        fontSize: 8, 
        color: '#666',
        rotate: 45,
        interval: 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      axisLabel: { 
        fontSize: 8, 
        color: '#666',
        formatter: (v: number) => v >= 1000000 ? `$${(v/1000000).toFixed(0)}M` : `$${(v/1000).toFixed(0)}K`
      },
    },
    series: [
      {
        name: 'Bullish',
        type: 'bar',
        stack: 'total',
        data: priceLevels.map(l => l.bullish),
        itemStyle: { color: '#00e676' },
        barMaxWidth: 30,
      },
      {
        name: 'Neutral',
        type: 'bar',
        stack: 'total',
        data: priceLevels.map(l => l.neutral),
        itemStyle: { color: '#ffc107' },
        barMaxWidth: 30,
      },
      {
        name: 'Bearish',
        type: 'bar',
        stack: 'total',
        data: priceLevels.map(l => l.bearish),
        itemStyle: { color: '#ff5252' },
        barMaxWidth: 30,
      },
    ],
    // VWAP reference line
    ...(vwap ? {
      markLine: {
        silent: true,
        data: [{ xAxis: `$${vwap.toFixed(2)}` }],
        lineStyle: { color: COLORS.cyan, type: 'dashed' },
        label: { show: false },
      },
    } : {}),
  };

  return <ReactECharts option={option} style={{ height: '100%' }} />;
}
