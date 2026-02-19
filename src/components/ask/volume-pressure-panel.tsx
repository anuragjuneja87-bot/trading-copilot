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
  const [bucketLabel, setBucketLabel] = useState('15min buckets');
  
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
          // Update bucket label from API response
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
    const interval = setInterval(fetchTickData, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [ticker, timeframeRange]);

  // Calculate CVD (Cumulative Volume Delta) and prepare chart data
  const chartData = useMemo(() => {
    if (!data.length) return null;
    
    // Calculate CVD (running sum of buyVolume - sellVolume)
    let cumulativeDelta = 0;
    const cvdData: number[] = [];
    const timeLabels: string[] = [];
    const buyData: number[] = [];
    const sellData: number[] = [];
    const pressureData: number[] = [];
    
    data.forEach((d) => {
      cumulativeDelta += (d.buyVolume - d.sellVolume);
      cvdData.push(cumulativeDelta);
      timeLabels.push(d.time);
      buyData.push(d.buyVolume);
      sellData.push(-d.sellVolume); // Negative for downward bars
      pressureData.push(d.pressure);
    });
    
    // Calculate current pressure and trend (for gauge)
    const currentPressure = pressureData.length > 0 ? pressureData[pressureData.length - 1] : 0;
    const trend = pressureData.length >= 3 
      ? pressureData[pressureData.length - 1] - pressureData[pressureData.length - 3]
      : 0;
    
    return {
      timeLabels,
      buyData,
      sellData,
      cvdData,
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

  // Format volume for axis labels
  const formatVol = (v: number) => {
    const abs = Math.abs(v);
    if (abs >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
    if (abs >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return v.toString();
  };

  // Chart options: Buy/Sell Volume Bars + CVD Line
  const chartOption = useMemo(() => {
    if (!chartData) return null;
    
    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(0,0,0,0.85)',
        borderColor: 'rgba(255,255,255,0.1)',
        textStyle: { color: '#fff', fontSize: 12 },
        formatter: (params: any) => {
          const time = params[0]?.axisValue || '';
          let result = `<div style="font-weight:bold;margin-bottom:4px">${time}</div>`;
          params.forEach((p: any) => {
            if (p.seriesName === 'Buy Volume') {
              result += `<div style="color:#00e676">Buy: ${formatVol(p.value)}</div>`;
            } else if (p.seriesName === 'Sell Volume') {
              result += `<div style="color:#ff5252">Sell: ${formatVol(Math.abs(p.value))}</div>`;
            } else if (p.seriesName === 'CVD') {
              result += `<div style="color:#00e5ff">CVD: ${formatVol(p.value)}</div>`;
            }
          });
          return result;
        },
      },
      legend: {
        data: ['Buy Volume', 'Sell Volume', 'CVD'],
        textStyle: { color: '#888', fontSize: 11 },
        top: 0,
        right: 10,
        itemWidth: 12,
        itemHeight: 8,
      },
      grid: { top: 30, right: 60, bottom: 45, left: 60 },
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
          dataBackground: {
            lineStyle: { color: 'rgba(0,229,255,0.3)' },
            areaStyle: { color: 'rgba(0,229,255,0.05)' },
          },
        },
      ],
      xAxis: {
        type: 'category',
        data: chartData.timeLabels,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { fontSize: 11, color: '#888' },
      },
      yAxis: [
        {
          // Left axis: Volume
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)', type: 'dashed' } },
          axisLabel: { fontSize: 11, color: '#888', formatter: (v: number) => formatVol(v) },
        },
        {
          // Right axis: CVD
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { fontSize: 11, color: '#00e5ff', formatter: (v: number) => formatVol(v) },
        },
      ],
      series: [
        {
          name: 'Buy Volume',
          type: 'bar',
          stack: 'volume',
          data: chartData.buyData,
          itemStyle: { color: 'rgba(0,230,118,0.8)' },
          barMaxWidth: 20,
        },
        {
          name: 'Sell Volume',
          type: 'bar',
          stack: 'volume',
          data: chartData.sellData,
          itemStyle: { color: 'rgba(255,82,82,0.8)' },
          barMaxWidth: 20,
        },
        {
          name: 'CVD',
          type: 'line',
          yAxisIndex: 1,
          data: chartData.cvdData,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#00e5ff', width: 2 },
          z: 10,
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
          <span className="text-xs text-gray-500">{bucketLabel}</span>
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
