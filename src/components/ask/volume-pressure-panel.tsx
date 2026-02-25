'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORS } from '@/lib/echarts-theme';
import { isMarketClosed, getLastTradingDay, formatTradingDay, getMarketStatus } from '@/lib/market-utils';

/* ════════════════════════════════════════════════════════════════
   VOLUME PRESSURE PANEL v2.1 — Color-changing CVD
   
   v2.1 changes:
   - CVD line changes color at zero crossing (green > 0, red < 0)
   - Auto-scroll to latest data (dataZoom end: 100)
   - Session pressure = total buy / total sell across ALL buckets
   - Rolling pressure = last 15 buckets (trend indicator)
   - Zero reference line for visual clarity
   ════════════════════════════════════════════════════════════════ */

interface VolumePressurePanelProps {
  ticker: string;
  timeframeRange?: {
    from: number;
    to: number;
    label: string;
    isMarketClosed?: boolean;
    tradingDay?: string;
  };
}

interface TickBucket {
  time: string;
  timeMs: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  pressure: number;
}

const ROLLING_WINDOW = 15;

export function VolumePressurePanel({ ticker, timeframeRange }: VolumePressurePanelProps) {
  const [data, setData] = useState<TickBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucketLabel, setBucketLabel] = useState('15min buckets');
  
  const marketStatus = getMarketStatus();
  const isClosed = isMarketClosed();
  const lastTradingDay = getLastTradingDay();
  const tradingDayStr = formatTradingDay(lastTradingDay);
  
  const hasData = data.length > 0;
  const isStaleData = isClosed && hasData;

  useEffect(() => {
    const fetchTickData = async () => {
      if (!ticker) return;
      
      setLoading(true);
      try {
        let url = `/api/market/volume-pressure?ticker=${ticker}`;
        if (timeframeRange) {
          url += `&from=${timeframeRange.from}&to=${timeframeRange.to}`;
        }
        
        const res = await fetch(url);
        const json = await res.json();
        
        if (json.success && json.data) {
          setData(json.data.buckets || []);
          if (json.data.bucketMinutes) {
            setBucketLabel(`${json.data.bucketMinutes}min buckets`);
          }
        } else {
          setError(json.error || 'Failed to load');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchTickData();
    const interval = setInterval(fetchTickData, 60000);
    return () => clearInterval(interval);
  }, [ticker, timeframeRange]);

  // ── Compute CVD + pressure metrics ──
  const metrics = useMemo(() => {
    if (!data.length) return null;
    
    let cumulativeDelta = 0;
    const cvdData: number[] = [];
    const timeLabels: string[] = [];
    let totalBuy = 0;
    let totalSell = 0;
    
    data.forEach((d) => {
      cumulativeDelta += (d.buyVolume - d.sellVolume);
      cvdData.push(cumulativeDelta);
      timeLabels.push(d.time);
      totalBuy += d.buyVolume;
      totalSell += d.sellVolume;
    });
    
    // Session-wide pressure
    const totalVol = totalBuy + totalSell;
    const sessionPressure = totalVol > 0 
      ? Math.round(((totalBuy - totalSell) / totalVol) * 100) 
      : 0;
    
    // Rolling pressure (last N buckets)
    const recentBuckets = data.slice(-ROLLING_WINDOW);
    const recentBuy = recentBuckets.reduce((s, d) => s + d.buyVolume, 0);
    const recentSell = recentBuckets.reduce((s, d) => s + d.sellVolume, 0);
    const recentTotal = recentBuy + recentSell;
    const rollingPressure = recentTotal > 0 
      ? Math.round(((recentBuy - recentSell) / recentTotal) * 100) 
      : 0;
    
    const trendDelta = rollingPressure - sessionPressure;
    
    return {
      timeLabels,
      cvdData,
      sessionPressure,
      rollingPressure,
      trendDelta,
      totalBuy: Math.round(totalBuy),
      totalSell: Math.round(totalSell),
    };
  }, [data]);

  const sessionPressure = metrics?.sessionPressure || 0;
  const rollingPressure = metrics?.rollingPressure || 0;
  const trendDelta = metrics?.trendDelta || 0;
  
  const pressureLabel = sessionPressure > 10 ? 'BUYERS' : 
                        sessionPressure < -10 ? 'SELLERS' : 'BALANCED';
  const pressureColor = sessionPressure > 10 ? COLORS.green : 
                        sessionPressure < -10 ? COLORS.red : COLORS.yellow;
  
  const trendLabel = trendDelta > 8 ? '↑ Accelerating' : 
                     trendDelta < -8 ? '↓ Fading' : '→ Steady';
  const trendColor = trendDelta > 8 ? COLORS.green : 
                     trendDelta < -8 ? COLORS.red : '#888';

  const formatVol = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return v.toString();
  };

  // ── CVD chart with color change at zero ──
  const chartOption = useMemo(() => {
    if (!metrics) return null;
    
    // ★ Dynamic area fill based on CVD direction
    const lastCvd = metrics.cvdData[metrics.cvdData.length - 1] || 0;
    const isPositiveCvd = lastCvd >= 0;
    const fillTop = isPositiveCvd ? 'rgba(0,220,130,0.22)' : 'rgba(255,71,87,0.22)';
    const fillBottom = isPositiveCvd ? 'rgba(0,220,130,0.02)' : 'rgba(255,71,87,0.02)';

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const time = params[0]?.axisValue || '';
          const cvd = params[0]?.value || 0;
          const color = cvd >= 0 ? '#00dc82' : '#ff4757';
          return `<div style="font-weight:bold;margin-bottom:4px">${time}</div>` +
            `<div style="color:${color}">CVD: ${formatVol(cvd)}</div>`;
        },
      },
      // ★ Color-changing CVD: green above zero, red below zero
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 1,
        pieces: [
          { gte: 0, color: '#00dc82' },
          { lt: 0, color: '#ff4757' },
        ],
        seriesIndex: 0,
      },
      grid: { top: 16, right: 55, bottom: 45, left: 55 },
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
          start: 0,
          end: 100,
          borderColor: 'transparent',
          backgroundColor: 'rgba(255,255,255,0.03)',
          fillerColor: 'rgba(0,220,130,0.1)',
          handleStyle: { color: '#00dc82', borderColor: '#00dc82' },
          textStyle: { color: '#666', fontSize: 9 },
          dataBackground: {
            lineStyle: { color: 'rgba(0,220,130,0.3)' },
            areaStyle: { color: 'rgba(0,220,130,0.05)' },
          },
        },
      ],
      xAxis: {
        type: 'category',
        data: metrics.timeLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: '#888' },
      },
      yAxis: {
        type: 'value',
        // ★ Scale to actual data range, not anchored to 0
        // This makes CVD movements visible instead of a flat line at the top
        min: 'dataMin',
        max: 'dataMax',
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' } },
        axisLabel: { fontSize: 11, color: '#888', formatter: (v: number) => formatVol(v) },
      },
      series: [
        {
          name: 'CVD',
          type: 'line',
          data: metrics.cvdData,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { width: 2.5 },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: fillTop },
                { offset: 1, color: fillBottom },
              ],
            },
          },
          // ★ Zero reference line
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: {
              color: 'rgba(255,255,255,0.1)',
              type: 'dashed',
              width: 1,
            },
            data: [{ yAxis: 0 }],
          },
          z: 10,
        },
      ],
    };
  }, [metrics]);

  return (
    <div 
      className="rounded-xl p-4 flex flex-col h-full max-h-full overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-base font-bold text-gray-300 uppercase tracking-wider">
          Volume Pressure
        </h3>
        <div className="flex items-center gap-2">
          {isStaleData && (
            <div className="flex items-center gap-1 px-2.5 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
              <span>⚠️</span>
              <span>Showing {tradingDayStr} data</span>
            </div>
          )}
          {timeframeRange && !isStaleData && (
            <span className="text-xs text-gray-400 px-2.5 py-1 rounded bg-white/5">
              {timeframeRange.label}
            </span>
          )}
          <span className="text-xs text-gray-500">{bucketLabel}</span>
        </div>
      </div>

      {/* ── Pressure Summary — compact row ── */}
      <div className="flex items-center gap-4 mb-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="flex items-center gap-2">
          <span className="text-2xl font-black font-mono" style={{ color: pressureColor }}>
            {sessionPressure > 0 ? '+' : ''}{sessionPressure}%
          </span>
          <span className="text-sm font-bold" style={{ color: pressureColor }}>
            {pressureLabel}
          </span>
        </div>
        
        <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />
        
        <div className="flex flex-col">
          <span className="text-xs text-gray-500">Last {ROLLING_WINDOW} bars</span>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold font-mono" style={{ color: rollingPressure > 10 ? COLORS.green : rollingPressure < -10 ? COLORS.red : '#888' }}>
              {rollingPressure > 0 ? '+' : ''}{rollingPressure}%
            </span>
            <span className="text-xs" style={{ color: trendColor }}>
              {trendLabel}
            </span>
          </div>
        </div>
        
        <div className="w-px h-6" style={{ background: 'rgba(255,255,255,0.08)' }} />
        
        {metrics && (
          <div className="flex items-center gap-3 text-xs">
            <span style={{ color: COLORS.green }}>
              <span className="text-gray-500 mr-1">Buy</span>
              <span className="font-bold font-mono">{formatVol(metrics.totalBuy)}</span>
            </span>
            <span style={{ color: COLORS.red }}>
              <span className="text-gray-500 mr-1">Sell</span>
              <span className="font-bold font-mono">{formatVol(metrics.totalSell)}</span>
            </span>
          </div>
        )}
      </div>

      {/* ── CVD Chart ── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Loading volume data...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400 text-sm">
            {error}
          </div>
        ) : isClosed && !hasData ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-base font-semibold">Market Closed</div>
            <div className="text-xs text-gray-600 mt-1">No volume data for current session</div>
          </div>
        ) : isClosed && hasData ? (
          <div className="relative h-full">
            <div className="h-full opacity-30">
              {chartOption && <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />}
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
              <div className="text-center px-4">
                <div className="text-base font-semibold text-yellow-400 mb-1">⚠️ Market Closed</div>
                <div className="text-xs text-gray-400">Showing {tradingDayStr} data</div>
              </div>
            </div>
          </div>
        ) : chartOption ? (
          <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            No volume data available
          </div>
        )}
      </div>
    </div>
  );
}
