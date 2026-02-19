'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import ReactECharts from 'echarts-for-react';
import { isMarketClosed, getLastTradingDay, formatTradingDay } from '@/lib/market-utils';

// Safety check
if (!COLORS) {
  console.error('[DarkPoolPanel] COLORS is undefined!');
}

import { DataSourceBadge } from '@/components/war-room/data-source-badge';

// Helper function to check if prints have valid chartable data
function hasValidDarkPoolChartData(prints: any[]): boolean {
  if (!prints || prints.length === 0) return false;
  return prints.some(p => {
    const price = p.price || 0;
    const timestamp = p.timestamp || p.timestampMs;
    return price > 0 && timestamp && isFinite(price);
  });
}

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
  // Market status detection
  const isClosed = isMarketClosed() || timeframeRange?.isMarketClosed || meta?.isMarketClosed;
  const lastTradingDay = getLastTradingDay();
  const tradingDayStr = formatTradingDay(lastTradingDay);
  const displayTradingDay = timeframeRange?.tradingDay || meta?.tradingDay || tradingDayStr;
  
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

  // Calculate largest print and total value
  const largestPrint = useMemo(() => {
    if (!prints.length) return null;
    return prints.reduce((largest, p) => {
      const value = p.value || (p.price * (p.size || 0));
      const largestValue = largest.value || (largest.price * (largest.size || 0));
      return value > largestValue ? p : largest;
    }, prints[0]);
  }, [prints]);

  const totalBlockValue = useMemo(() => {
    return prints.reduce((sum, p) => sum + (p.value || (p.price * (p.size || 0))), 0);
  }, [prints]);

  // Format largest print time
  const formatLargestPrint = () => {
    if (!largestPrint) return '';
    const value = largestPrint.value || (largestPrint.price * (largestPrint.size || 0));
    const timestamp = largestPrint.timestamp || largestPrint.timestampMs;
    let timeStr = '';
    
    if (timestamp) {
      const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
      timeStr = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
    }
    
    return `Largest: ${formatValue(value)} at $${(largestPrint.price || 0).toFixed(2)}${timeStr ? ` (${timeStr})` : ''}`;
  };

  return (
    <div 
      className="rounded-xl p-4 flex flex-col h-full max-h-full overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-bold text-gray-300 uppercase tracking-wider">
            Dark Pool
          </h3>
          {/* Timeframe + Market Status */}
          {isClosed && (
            <span className="text-xs px-2.5 py-1 rounded text-yellow-400 bg-yellow-500/20 border border-yellow-500/30 flex items-center gap-1">
              <span>⚠️</span>
              <span>Showing {displayTradingDay} data</span>
            </span>
          )}
          {!isClosed && timeframeRange && (
            <span className="text-xs px-2.5 py-1 rounded text-gray-400 bg-white/5">
              {timeframeRange.label}
            </span>
          )}
          <span 
            className="px-2.5 py-1 rounded text-xs font-bold"
            style={{ background: `${regimeColor}20`, color: regimeColor }}
          >
            {regime}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          {/* VWAP Indicator */}
          {dpVsVwap && (
            <div 
              className="flex items-center gap-1 px-2.5 py-1 rounded text-xs"
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
      <div className="grid grid-cols-3 gap-3 mb-3 text-center flex-shrink-0">
        <StatBox 
          label="Total Value" 
          value={prints.length === 0 ? '—' : formatValue(totalBlockValue)}
          color={prints.length === 0 ? '#555' : '#fff'}
        />
        <StatBox 
          label="Bullish" 
          value={prints.length === 0 ? '—' : `${stats?.bullishPct || 0}%`}
          color={prints.length === 0 ? '#555' : (stats?.bullishPct || 0) > 50 ? COLORS.green : COLORS.red}
        />
        <StatBox 
          label="Prints" 
          value={prints.length === 0 ? '—' : prints.length.toString()}
          color={prints.length === 0 ? '#555' : '#888'}
        />
      </div>

      {/* Largest Print Info */}
      {largestPrint && (
        <div className="mb-3 px-3 py-2 rounded text-xs text-gray-300 bg-white/5 flex-shrink-0">
          {formatLargestPrint()}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            Loading...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400 text-xs">
            {error}
          </div>
        ) : prints.length === 0 ? (
          // Empty state - no prints at all
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs text-center">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm font-semibold">No dark pool prints</div>
            <div className="text-[10px] text-gray-600 mt-1">
              {isClosed 
                ? `Market was closed. Showing ${displayTradingDay} data.`
                : `No block trades in selected timeframe.`
              }
            </div>
          </div>
        ) : !hasValidDarkPoolChartData(prints) ? (
          // Prints exist but no valid chart data
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-xs text-center">
            <div className="text-2xl mb-2">📊</div>
            <div className="text-sm font-semibold">No dark pool prints</div>
            <div className="text-[10px] text-gray-600 mt-1">
              {isClosed 
                ? `Market was closed. Showing ${displayTradingDay} data.`
                : `No block trades in selected timeframe.`
              }
            </div>
          </div>
        ) : isClosed ? (
          // Market closed but we have valid stale data - show dimmed chart with overlay
          <div className="relative h-full">
            <div className="h-full opacity-30">
              <DarkPoolChart prints={prints} vwap={vwap} currentPrice={currentPrice} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
              <div className="text-center px-4">
                <div className="text-base font-semibold text-yellow-400 mb-1">⚠️ Market Closed</div>
                <div className="text-xs text-gray-400">Showing {displayTradingDay} data</div>
              </div>
            </div>
          </div>
        ) : (
          // Live data - render chart normally
          <DarkPoolChart prints={prints} vwap={vwap} currentPrice={currentPrice} />
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
    <div className="p-2.5 rounded" style={{ background: 'rgba(255,255,255,0.02)' }}>
      <div className="text-xs text-gray-400 uppercase font-semibold mb-1">{label}</div>
      <div className="text-2xl font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  );
}

function DarkPoolChart({ prints, vwap, currentPrice }: { prints: any[]; vwap: number | null; currentPrice: number }) {
  // CRITICAL: Early return if no prints - prevent any chart initialization
  if (!prints || prints.length === 0) {
    return null;
  }
  
  // Process prints for scatter plot
  const chartData = useMemo(() => {
    if (!prints || prints.length === 0) return null;
    
    // Create time slots (15-minute intervals from 9:30 AM to 4:00 PM)
    const timeSlots: string[] = [];
    for (let hour = 9; hour <= 15; hour++) {
      const startMin = hour === 9 ? 30 : 0;
      const endMin = hour === 15 ? 0 : 60;
      for (let min = startMin; min < endMin; min += 15) {
        const time = new Date();
        time.setHours(hour, min, 0, 0);
        timeSlots.push(time.toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        }));
      }
    }
    
    // Process each print
    const scatterData = prints.map(p => {
      const timestamp = p.timestamp || p.timestampMs;
      if (!timestamp) return null;
      
      const date = typeof timestamp === 'string' ? new Date(timestamp) : new Date(timestamp);
      const timeStr = date.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true 
      });
      
      // Find closest time slot
      let closestSlot = timeSlots[0];
      let minDiff = Infinity;
      const printTime = date.getHours() * 60 + date.getMinutes();
      
      timeSlots.forEach(slot => {
        const [timePart, ampm] = slot.split(' ');
        const [hour, minute] = timePart.split(':').map(Number);
        let slotHour = hour;
        if (ampm === 'PM' && hour !== 12) slotHour += 12;
        if (ampm === 'AM' && hour === 12) slotHour = 0;
        const slotTime = slotHour * 60 + minute;
        const diff = Math.abs(printTime - slotTime);
        if (diff < minDiff) {
          minDiff = diff;
          closestSlot = slot;
        }
      });
      
      const value = p.value || (p.price * (p.size || 0));
      const side = (p.side || p.sentiment || 'NEUTRAL').toString().toUpperCase();
      
      // Calculate bubble size (min 8px, max 40px)
      const size = Math.min(40, Math.max(8, (value / 1000000) * 10));
      
      // Determine color
      const color = side.includes('BULL') || side === 'POSITIVE' || side === 'BUY'
        ? 'rgba(0,230,118,0.8)'
        : side.includes('BEAR') || side === 'NEGATIVE' || side === 'SELL'
        ? 'rgba(255,82,82,0.8)'
        : 'rgba(255,193,7,0.6)';
      
      return {
        value: [closestSlot, p.price || 0],
        symbolSize: size,
        itemStyle: { color },
        time: timeStr,
        price: p.price || 0,
        blockValue: value,
        side: side,
      };
    }).filter(Boolean) as any[];
    
    // Get price range for y-axis - only use valid prices
    const prices = prints
      .map(p => p.price || 0)
      .filter(p => p > 0 && isFinite(p));
    
    // If no valid prices, return null to prevent chart rendering
    if (prices.length === 0) {
      return null;
    }
    
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    
    // Ensure min/max are valid numbers before returning
    if (!isFinite(minPrice) || !isFinite(maxPrice) || minPrice <= 0 || maxPrice <= 0) {
      return null;
    }
    
    return {
      timeSlots,
      scatterData,
      minPrice,
      maxPrice,
    };
  }, [prints]);

  // Early return if no data - completely skip chart rendering
  // Return null so parent can handle empty state - prevents any chart canvas/axes from rendering
  if (!chartData || 
      !chartData.scatterData || 
      chartData.scatterData.length === 0 || 
      !chartData.minPrice || 
      !chartData.maxPrice ||
      chartData.minPrice <= 0 || 
      chartData.maxPrice <= 0 ||
      !isFinite(chartData.minPrice) ||
      !isFinite(chartData.maxPrice)) {
    // Return null - do NOT render any chart component
    return null;
  }

  // Only create chart option if we have valid data
  const option = {
    tooltip: {
      trigger: 'item',
      backgroundColor: 'rgba(0,0,0,0.85)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 13 },
      formatter: (params: any) => {
        const p = params.data;
        if (!p) return '';
        return `
          <div style="font-weight:bold;margin-bottom:4px">${p.time || params.value[0]}</div>
          <div>Price: $${(p.price || params.value[1]).toFixed(2)}</div>
          <div>Value: $${((p.blockValue || 0) / 1000000).toFixed(2)}M</div>
          <div>Side: ${p.side || 'NEUTRAL'}</div>
        `;
      },
    },
    grid: { top: 10, right: 15, bottom: 45, left: 50 },
    dataZoom: [
      {
        type: 'inside',
        xAxisIndex: 0,
        zoomOnMouseWheel: true,
        moveOnMouseMove: true,
        moveOnMouseWheel: false,
      },
      {
        type: 'slider',
        xAxisIndex: 0,
        height: 18,
        bottom: 2,
        borderColor: 'transparent',
        backgroundColor: 'rgba(255,255,255,0.03)',
        fillerColor: 'rgba(0,229,255,0.1)',
        handleStyle: { color: '#00e5ff', borderColor: '#00e5ff' },
        textStyle: { color: '#666', fontSize: 9 },
      },
    ],
    xAxis: {
      type: 'category',
      data: chartData.timeSlots,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { 
        fontSize: 12, 
        color: '#888',
        rotate: chartData.timeSlots.length > 8 ? 45 : 0,
      },
    },
    yAxis: {
      type: 'value',
      // Ensure min/max are valid and positive - add padding for better visualization
      min: Math.max(0, Math.floor(chartData.minPrice * 0.998)),
      max: Math.ceil(chartData.maxPrice * 1.002),
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      axisLabel: { 
        fontSize: 13, 
        color: '#888',
        formatter: (v: number) => {
          // Only show positive values
          if (v <= 0 || !isFinite(v)) return '';
          return `$${v.toFixed(0)}`;
        }
      },
    },
    series: [
      {
        name: 'Dark Pool Prints',
        type: 'scatter',
        data: chartData.scatterData,
        symbolSize: (data: any) => data.symbolSize || 10,
        markLine: {
          silent: true,
          symbol: 'none',
          data: [
            ...(vwap ? [{
              yAxis: vwap,
              lineStyle: { color: '#00bcd4', type: 'dashed', width: 1 },
              label: { 
                formatter: 'VWAP', 
                fontSize: 12,
                position: 'end',
                color: '#00bcd4',
              },
            }] : []),
            {
              yAxis: currentPrice,
              lineStyle: { color: '#fff', type: 'solid', width: 1 },
              label: { 
                formatter: 'Price', 
                fontSize: 12,
                position: 'end',
                color: '#fff',
              },
            },
          ],
        },
      },
    ],
  };

  // Final safety check: ensure we have valid series data before rendering
  if (!option.series || option.series.length === 0 || !option.series[0].data || option.series[0].data.length === 0) {
    return null;
  }
  
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} />;
}
