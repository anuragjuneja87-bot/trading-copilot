'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { FlowTimeSeries } from '@/types/flow';
import { PANEL_COLORS as C, FONT_MONO } from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   OPTIONS FLOW LINE CHART — TradingView-style interactive chart
   
   Uses lightweight-charts for:
   - Proper time-based x-axis (9:30 AM → 4:00 PM ET)
   - Mouse wheel zoom + drag to pan  
   - Crosshair with value tooltip
   - Timeframe-aware visible range
   
   Two area series: Calls (green) and Puts (red)
   Cumulative premium shown as running total through the day
   
   TIMEZONE FIX: ET offset applied so x-axis shows Eastern Time.
   ════════════════════════════════════════════════════════════════ */

interface FlowLineChartProps {
  data: FlowTimeSeries[];
  timeframeRange?: {
    from: number; to: number; label: string;
    isMarketClosed: boolean; tradingDay?: string;
  };
  height?: number;
}

// Market hours in ET: 9:30 AM - 4:00 PM
const MARKET_OPEN_MINUTES = 9 * 60 + 30;  // 570
const MARKET_CLOSE_MINUTES = 16 * 60;      // 960

function isRegularHours(timestampMs: number): boolean {
  const d = new Date(timestampMs);
  const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' });
  const [h, m] = etStr.split(':').map(Number);
  const mins = h * 60 + m;
  return mins >= MARKET_OPEN_MINUTES && mins <= MARKET_CLOSE_MINUTES;
}

function getETOffsetSeconds(timestampMs: number): number {
  const d = new Date(timestampMs);
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return Math.round((new Date(etStr).getTime() - new Date(utcStr).getTime()) / 1000);
}

export function OptionsFlowLineChart({ data, timeframeRange, height = 160 }: FlowLineChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const callSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);
  const putSeriesRef = useRef<ISeriesApi<'Area'> | null>(null);

  // Compute cumulative data, filtering to regular hours only
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return null;

    let cumCall = 0, cumPut = 0;
    const callPoints: { time: number; value: number }[] = [];
    const putPoints: { time: number; value: number }[] = [];

    const sorted = [...data].sort((a, b) => a.timeMs - b.timeMs);

    // Compute ET offset once from first data point
    const firstValid = sorted.find(d => d.timeMs && d.timeMs > 1000000000000);
    const etOffset = firstValid ? getETOffsetSeconds(firstValid.timeMs) : 0;

    for (const d of sorted) {
      if (!d.timeMs || d.timeMs < 1000000000000) continue;
      // Filter to regular market hours only
      if (!isRegularHours(d.timeMs)) continue;

      cumCall += d.callPremium || 0;
      cumPut += d.putPremium || 0;

      // Apply ET offset so chart displays Eastern Time
      const timeSec = Math.floor(d.timeMs / 1000) + etOffset;

      callPoints.push({ time: timeSec, value: cumCall });
      putPoints.push({ time: timeSec, value: cumPut });
    }

    if (callPoints.length < 2) return null;
    return { callPoints, putPoints, etOffset };
  }, [data]);

  // Create chart once
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.4)',
        fontFamily: "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(255,255,255,0.15)',
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: 'rgba(20,26,36,0.9)',
        },
        horzLine: {
          color: 'rgba(255,255,255,0.15)',
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: 'rgba(20,26,36,0.9)',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.05, bottom: 0.0 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    // Call series (green area)
    const callSeries = chart.addAreaSeries({
      lineColor: 'rgba(0,220,130,0.85)',
      lineWidth: 2,
      topColor: 'rgba(0,220,130,0.18)',
      bottomColor: 'rgba(0,220,130,0.01)',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBackgroundColor: 'rgb(0,220,130)',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          const abs = Math.abs(price);
          const sign = price < 0 ? '-' : '';
          if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
          if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
          if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
          return `${sign}$${abs.toFixed(0)}`;
        },
      },
      autoscaleInfoProvider: (original: () => any) => {
        const res = original();
        if (res !== null && res.priceRange) {
          res.priceRange.minValue = Math.min(res.priceRange.minValue, 0);
          if (res.priceRange.minValue < 0) res.priceRange.minValue = 0;
        }
        return res;
      },
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'Calls',
    });

    // Put series (red area)
    const putSeries = chart.addAreaSeries({
      lineColor: 'rgba(255,71,87,0.75)',
      lineWidth: 2,
      topColor: 'rgba(255,71,87,0.12)',
      bottomColor: 'rgba(255,71,87,0.01)',
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      crosshairMarkerBackgroundColor: 'rgb(255,71,87)',
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => {
          const abs = Math.abs(price);
          const sign = price < 0 ? '-' : '';
          if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
          if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
          if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
          return `${sign}$${abs.toFixed(0)}`;
        },
      },
      autoscaleInfoProvider: (original: () => any) => {
        const res = original();
        if (res !== null && res.priceRange) {
          res.priceRange.minValue = Math.min(res.priceRange.minValue, 0);
          if (res.priceRange.minValue < 0) res.priceRange.minValue = 0;
        }
        return res;
      },
      lastValueVisible: true,
      priceLineVisible: false,
      title: 'Puts',
    });

    chartRef.current = chart;
    callSeriesRef.current = callSeries;
    putSeriesRef.current = putSeries;

    // Resize observer
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) chart.applyOptions({ width });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      callSeriesRef.current = null;
      putSeriesRef.current = null;
    };
  }, [height]);

  // Update data when it changes
  useEffect(() => {
    if (!chartRef.current || !callSeriesRef.current || !putSeriesRef.current || !chartData) return;

    callSeriesRef.current.setData(chartData.callPoints as any);
    putSeriesRef.current.setData(chartData.putPoints as any);

    // Always show full session (9:30 AM - 4:00 PM ET)
    // User can zoom in manually with scroll wheel
    chartRef.current.timeScale().fitContent();
  }, [chartData]);

  if (!chartData) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
        No flow time series data
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height,
        position: 'relative',
      }}
    />
  );
}
