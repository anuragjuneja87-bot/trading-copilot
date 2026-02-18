'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORS } from '@/lib/echarts-theme';
import { isMarketClosed, getLastTradingDay, formatTradingDay, getMarketStatus } from '@/lib/market-utils';

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
  pressure: number; // -100 to +100
}

export function VolumePressurePanel({ ticker, timeframeRange }: VolumePressurePanelProps) {
  const [data, setData] = useState<TickBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Market status detection
  const marketStatus = getMarketStatus();
  const isClosed = isMarketClosed();
  const lastTradingDay = getLastTradingDay();
  const tradingDayStr = formatTradingDay(lastTradingDay);
  
  // Check if data is from today or stale
  const hasData = data.length > 0;
  const isStaleData = isClosed && hasData;

  useEffect(() => {
    const fetchTickData = async () => {
      if (!ticker) return;
      
      setLoading(true);
      try {
        // Build URL with timeframe parameters if provided
        let url = `/api/market/volume-pressure?ticker=${ticker}`;
        if (timeframeRange) {
          url += `&from=${timeframeRange.from}&to=${timeframeRange.to}`;
        }
        
        const res = await fetch(url);
        const json = await res.json();
        
        if (json.success && json.data) {
          setData(json.data.buckets || []);
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
    const interval = setInterval(fetchTickData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [ticker, timeframeRange]);

  // Calculate net pressure (Buyers - Sellers) per bucket
  const chartData = useMemo(() => {
    if (!data.length) return null;
    
    const netPressureData: number[] = [];
    const pressureData: number[] = [];
    const timeLabels: string[] = [];
    
    data.forEach((d) => {
      // Net pressure = buyers - sellers (as percentage)
      netPressureData.push(d.pressure);
      pressureData.push(d.pressure);
      timeLabels.push(d.time);
    });
    
    // Calculate current pressure and trend
    const currentPressure = pressureData.length > 0 ? pressureData[pressureData.length - 1] : 0;
    const trend = pressureData.length >= 3 
      ? pressureData[pressureData.length - 1] - pressureData[pressureData.length - 3]
      : 0;
    
    return {
      netPressureData,
      pressureData,
      timeLabels,
      currentPressure,
      trend,
    };
  }, [data]);

  // Overall pressure (for gauge)
  const overallPressure = chartData?.currentPressure || 0;
  const pressureTrend = chartData?.trend || 0;
  
  const pressureLabel = overallPressure > 20 ? 'BUYERS' : 
                        overallPressure < -20 ? 'SELLERS' : 'BALANCED';
  const pressureColor = overallPressure > 20 ? COLORS.green : 
                        overallPressure < -20 ? COLORS.red : COLORS.yellow;
  
  const trendLabel = pressureTrend > 5 ? '↑ Increasing' : 
                     pressureTrend < -5 ? '↓ Decreasing' : '→ Stable';
  const trendColor = pressureTrend > 5 ? COLORS.green : 
                     pressureTrend < -5 ? COLORS.red : '#888';

  // Chart options with dual grid
  const chartOption = useMemo(() => {
    if (!chartData) return null;
    
    // No crossovers needed for net pressure chart
    
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 13 },
        formatter: (params: any) => {
          let result = `<div style="font-weight:bold;margin-bottom:4px">${params[0].axisValue}</div>`;
          params.forEach((p: any) => {
            if (p.seriesName === 'Pressure') return; // Skip oscillator in main chart tooltip
            const value = p.value;
            const sign = value >= 0 ? '+' : '';
            result += `<div style="color:${value >= 0 ? '#00e676' : '#ff5252'}">${p.seriesName}: ${sign}${value.toFixed(1)}%</div>`;
          });
          return result;
        },
      },
      legend: {
        data: ['Net Pressure'],
        textStyle: { color: '#888', fontSize: 13 },
        top: 5,
        right: 10,
      },
      grid: [
        { top: 30, right: 15, bottom: '40%', left: 50 },  // Main chart
        { top: '65%', right: 15, bottom: 25, left: 50 },  // Oscillator
      ],
      xAxis: [
        { 
          type: 'category', 
          data: chartData.timeLabels,
          gridIndex: 0,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { show: false },
        },
        { 
          type: 'category', 
          data: chartData.timeLabels,
          gridIndex: 1,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { 
            fontSize: 12, 
            color: '#888',
            rotate: chartData.timeLabels.length > 6 ? 45 : 0,
          },
        },
      ],
      yAxis: [
        { 
          type: 'value',
          gridIndex: 0,
          min: -100,
          max: 100,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { 
            lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' },
            show: true,
          },
          axisLabel: { 
            fontSize: 13, 
            color: '#888',
            formatter: (v: number) => `${v}%`
          },
        },
        { 
          type: 'value',
          gridIndex: 1,
          min: -100,
          max: 100,
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { 
            lineStyle: { color: 'rgba(255,255,255,0.1)', type: 'dashed' },
            show: true,
          },
          axisLabel: { 
            fontSize: 13, 
            color: '#888',
            formatter: (v: number) => `${v}%`
          },
        },
      ],
      series: [
        // Net Pressure Line - oscillating around zero
        {
          name: 'Net Pressure',
          type: 'line',
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: chartData.netPressureData,
          smooth: true,
          symbol: 'none',
          lineStyle: { 
            color: (params: any) => {
              const value = params.data;
              return value >= 0 ? '#00e676' : '#ff5252';
            },
            width: 3 
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: chartData.netPressureData.map((p, idx) => ({
                offset: idx / (chartData.netPressureData.length - 1),
                color: p >= 0 ? 'rgba(0,230,118,0.2)' : 'rgba(255,82,82,0.2)'
              }))
            }
          },
          markLine: {
            silent: true,
            data: [{ yAxis: 0 }],
            lineStyle: { color: 'rgba(255,255,255,0.3)', type: 'dashed', width: 1 },
            label: { show: false },
          },
          z: 1,
        },
        // Pressure Oscillator
        {
          name: 'Pressure',
          type: 'bar',
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: chartData.pressureData.map(p => ({
            value: p,
            itemStyle: { color: p >= 0 ? '#00e676' : '#ff5252' }
          })),
          barMaxWidth: 15,
          markLine: {
            data: [{ yAxis: 0 }],
            lineStyle: { color: 'rgba(255,255,255,0.2)', width: 1 },
            label: { show: false },
          },
        },
      ],
    };
  }, [chartData]);

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
          <span className="text-xs text-gray-500">15min buckets</span>
        </div>
      </div>

      {/* Pressure Gauge */}
      <div className="flex items-center justify-center gap-4 mb-3 py-3">
        {/* Visual Gauge */}
        <div className="relative w-40 h-5 rounded-full overflow-hidden bg-gray-800">
          {/* Center marker */}
          <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-white/30 z-10" />
          {/* Pressure bar */}
          <div 
            className="absolute top-0 bottom-0 transition-all duration-500"
            style={{
              background: pressureColor,
              left: overallPressure >= 0 ? '50%' : `${50 + overallPressure / 2}%`,
              width: `${Math.abs(overallPressure) / 2}%`,
            }}
          />
        </div>
        
        {/* Label with Trend */}
        <div className="text-center">
          <div className="flex items-center gap-2 justify-center">
            <div className="text-3xl font-black font-mono" style={{ color: pressureColor }}>
              {overallPressure > 0 ? '+' : ''}{overallPressure}%
            </div>
            <div className="text-base font-bold" style={{ color: pressureColor }}>
              {pressureLabel}
            </div>
          </div>
          <div className="text-xs font-medium mt-1" style={{ color: trendColor }}>
            {trendLabel}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-[140px] overflow-hidden relative">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">
            Loading tick data...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400 text-sm">
            {error}
          </div>
        ) : isClosed && !hasData ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-500 text-sm text-center">
            <div className="text-3xl mb-2">📊</div>
            <div className="text-base font-semibold">Market was closed</div>
            <div className="text-xs text-gray-600 mt-1">
              No volume data available for current session.
            </div>
          </div>
        ) : isClosed && hasData ? (
          <div className="relative h-full">
            {/* Dimmed chart with overlay */}
            <div className="h-full opacity-30">
              <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} />
            </div>
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
              <div className="text-center px-4">
                <div className="text-base font-semibold text-yellow-400 mb-1">⚠️ Market Closed</div>
                <div className="text-xs text-gray-400">Showing {tradingDayStr} data</div>
              </div>
            </div>
          </div>
        ) : chartData && chartOption ? (
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
