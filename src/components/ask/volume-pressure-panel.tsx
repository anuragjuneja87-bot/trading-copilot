'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORS } from '@/lib/echarts-theme';

interface VolumePressurePanelProps {
  ticker: string;
}

interface TickBucket {
  time: string;
  timeMs: number;
  buyVolume: number;
  sellVolume: number;
  totalVolume: number;
  pressure: number; // -100 to +100
}

export function VolumePressurePanel({ ticker }: VolumePressurePanelProps) {
  const [data, setData] = useState<TickBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchTickData = async () => {
      if (!ticker) return;
      
      setLoading(true);
      try {
        const res = await fetch(`/api/market/volume-pressure?ticker=${ticker}`);
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
  }, [ticker]);

  // Calculate overall pressure
  const overallPressure = useMemo(() => {
    if (!data.length) return 0;
    const totalBuy = data.reduce((sum, d) => sum + d.buyVolume, 0);
    const totalSell = data.reduce((sum, d) => sum + d.sellVolume, 0);
    const total = totalBuy + totalSell;
    if (total === 0) return 0;
    return Math.round(((totalBuy - totalSell) / total) * 100);
  }, [data]);

  const pressureLabel = overallPressure > 20 ? 'BUYERS' : 
                        overallPressure < -20 ? 'SELLERS' : 'BALANCED';
  const pressureColor = overallPressure > 20 ? COLORS.green : 
                        overallPressure < -20 ? COLORS.red : COLORS.yellow;

  // Chart options
  const chartOption = useMemo(() => ({
    grid: { top: 10, right: 10, bottom: 30, left: 50 },
    xAxis: {
      type: 'category',
      data: data.map(d => d.time),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 9, color: '#666' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      axisLabel: { 
        fontSize: 9, 
        color: '#666',
        formatter: (v: number) => `${(v / 1000000).toFixed(1)}M`
      },
    },
    series: [
      {
        name: 'Buy Volume',
        type: 'bar',
        stack: 'volume',
        data: data.map(d => d.buyVolume),
        itemStyle: { color: COLORS.green },
        barMaxWidth: 20,
      },
      {
        name: 'Sell Volume',
        type: 'bar',
        stack: 'volume',
        data: data.map(d => -d.sellVolume), // Negative to show below
        itemStyle: { color: COLORS.red },
        barMaxWidth: 20,
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.8)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        const buyData = params[0];
        const sellData = params[1];
        return `
          <div style="font-weight:bold">${buyData.name}</div>
          <div style="color:${COLORS.green}">Buy: ${(buyData.value / 1000000).toFixed(2)}M</div>
          <div style="color:${COLORS.red}">Sell: ${(Math.abs(sellData.value) / 1000000).toFixed(2)}M</div>
        `;
      },
    },
  }), [data]);

  return (
    <div 
      className="rounded-xl p-3 flex flex-col h-full"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Volume Pressure
        </h3>
        <span className="text-[10px] text-gray-500">15min buckets</span>
      </div>

      {/* Pressure Gauge */}
      <div className="flex items-center justify-center gap-4 mb-3 py-2">
        {/* Visual Gauge */}
        <div className="relative w-32 h-4 rounded-full overflow-hidden bg-gray-800">
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
        
        {/* Label */}
        <div className="text-center">
          <div className="text-2xl font-black font-mono" style={{ color: pressureColor }}>
            {overallPressure > 0 ? '+' : ''}{overallPressure}%
          </div>
          <div className="text-[10px] font-bold" style={{ color: pressureColor }}>
            {pressureLabel}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            Loading tick data...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-red-400 text-xs">
            {error}
          </div>
        ) : data.length > 0 ? (
          <ReactECharts option={chartOption} style={{ height: '100%' }} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            No volume data available
          </div>
        )}
      </div>
    </div>
  );
}
