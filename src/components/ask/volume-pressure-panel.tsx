'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORS } from '@/lib/echarts-theme';
import { isMarketClosed, getLastTradingDay, formatTradingDay, getMarketStatus } from '@/lib/market-utils';

/* ════════════════════════════════════════════════════════════════
   VOLUME PRESSURE PANEL v2.2 — Extended hours CVD
   
   v2.2 changes:
   - Pre-market + after-hours included in CVD (continuous line)
   - Session markers: vertical dashed lines at 9:30 AM + 4:00 PM
   - Background tint for pre-market / after-hours regions
   - Session pressure computed across all sessions
   - Bold 3px CVD line with 35% area fill
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
  session?: 'pre' | 'rth' | 'post';
}

const ROLLING_WINDOW = 15;

export function VolumePressurePanel({ ticker, timeframeRange }: VolumePressurePanelProps) {
  const [data, setData] = useState<TickBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucketLabel, setBucketLabel] = useState('1min buckets');
  const [sessionBounds, setSessionBounds] = useState<{ rthOpenIdx: number; rthCloseIdx: number }>({ rthOpenIdx: -1, rthCloseIdx: -1 });
  
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
          if (json.data.sessionBoundaries) {
            setSessionBounds(json.data.sessionBoundaries);
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
    
    const totalVol = totalBuy + totalSell;
    const sessionPressure = totalVol > 0 
      ? Math.round(((totalBuy - totalSell) / totalVol) * 100) 
      : 0;
    
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

  // ── CVD chart with session markers ──
  const chartOption = useMemo(() => {
    if (!metrics) return null;
    
    const lastCvd = metrics.cvdData[metrics.cvdData.length - 1] || 0;
    const isPositiveCvd = lastCvd >= 0;
    const fillTop = isPositiveCvd ? 'rgba(0,220,130,0.35)' : 'rgba(255,71,87,0.35)';
    const fillBottom = isPositiveCvd ? 'rgba(0,220,130,0.03)' : 'rgba(255,71,87,0.03)';
    const lineColor = isPositiveCvd ? '#00dc82' : '#ff4757';

    // ★ Build session boundary markLines and markAreas
    const markLineData: any[] = [];
    const markAreaData: any[] = [];

    // RTH open line (9:30 AM)
    if (sessionBounds.rthOpenIdx >= 0 && sessionBounds.rthOpenIdx < metrics.timeLabels.length) {
      markLineData.push({
        xAxis: metrics.timeLabels[sessionBounds.rthOpenIdx],
        label: {
          show: true,
          formatter: 'OPEN',
          position: 'start',
          fontSize: 9,
          color: 'rgba(255,255,255,0.4)',
          fontWeight: 'bold',
        },
        lineStyle: { color: 'rgba(255,255,255,0.15)', type: 'dashed', width: 1 },
      });
    }

    // RTH close line (4:00 PM)
    if (sessionBounds.rthCloseIdx >= 0 && sessionBounds.rthCloseIdx < metrics.timeLabels.length) {
      markLineData.push({
        xAxis: metrics.timeLabels[sessionBounds.rthCloseIdx],
        label: {
          show: true,
          formatter: 'CLOSE',
          position: 'start',
          fontSize: 9,
          color: 'rgba(255,255,255,0.4)',
          fontWeight: 'bold',
        },
        lineStyle: { color: 'rgba(255,255,255,0.15)', type: 'dashed', width: 1 },
      });
    }

    // ★ Pre-market tint (start of data to RTH open)
    if (sessionBounds.rthOpenIdx > 0) {
      markAreaData.push([
        { xAxis: metrics.timeLabels[0], itemStyle: { color: 'rgba(99,102,241,0.05)' } },
        { xAxis: metrics.timeLabels[sessionBounds.rthOpenIdx] },
      ]);
    }

    // ★ After-hours tint (RTH close to end of data)
    if (sessionBounds.rthCloseIdx >= 0 && sessionBounds.rthCloseIdx < metrics.timeLabels.length - 1) {
      markAreaData.push([
        { xAxis: metrics.timeLabels[sessionBounds.rthCloseIdx], itemStyle: { color: 'rgba(99,102,241,0.05)' } },
        { xAxis: metrics.timeLabels[metrics.timeLabels.length - 1] },
      ]);
    }

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const time = params[0]?.axisValue || '';
          const cvd = params[0]?.value || 0;
          const idx = params[0]?.dataIndex || 0;
          const bucket = data[idx];
          const sessionTag = bucket?.session === 'pre' ? ' <span style="color:#818cf8;font-size:10px">PRE</span>' 
                           : bucket?.session === 'post' ? ' <span style="color:#818cf8;font-size:10px">AH</span>' : '';
          const color = cvd >= 0 ? '#00dc82' : '#ff4757';
          return `<div style="font-weight:bold;margin-bottom:4px">${time}${sessionTag}</div>` +
            `<div style="color:${color}">CVD: ${formatVol(cvd)}</div>`;
        },
      },
      grid: { top: 20, right: 55, bottom: 45, left: 55 },
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
            lineStyle: { color: `${lineColor}50` },
            areaStyle: { color: `${lineColor}0A` },
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
          lineStyle: { width: 3, color: lineColor },
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
          itemStyle: { color: lineColor },
          // ★ Session boundary markers
          markLine: {
            silent: true,
            symbol: 'none',
            data: markLineData,
          },
          markArea: {
            silent: true,
            data: markAreaData,
          },
          z: 10,
        },
      ],
    };
  }, [metrics, data, sessionBounds]);

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

      {/* ── Pressure Summary ── */}
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
