'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { FlowTimeSeries } from '@/types/flow';

/* ════════════════════════════════════════════════════════════════
   OPTIONS FLOW LINE CHART — TradingView-style interactive chart
   
   Uses lightweight-charts for:
   - Proper time-based x-axis (9:30 AM → 4:00 PM ET)
   - Mouse wheel zoom + drag to pan  
   - Crosshair with value tooltip
   - Timeframe-aware visible range
   
   Two area series: Calls (green) and Puts (red)
   Cumulative premium shown as running total through the day
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

    // Sort by time ascending
    const sorted = [...data].sort((a, b) => a.timeMs - b.timeMs);

    for (const d of sorted) {
      if (!d.timeMs || d.timeMs < 1000000000000) continue; // skip invalid
      // Filter to regular market hours only
      if (!isRegularHours(d.timeMs)) continue;

      cumCall += d.callPremium || 0;
      cumPut += d.putPremium || 0;

      // lightweight-charts uses UTC seconds
      const timeSec = Math.floor(d.timeMs / 1000);

      callPoints.push({ time: timeSec, value: cumCall });
      putPoints.push({ time: timeSec, value: cumPut });
    }

    if (callPoints.length < 2) return null;
    return { callPoints, putPoints };
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
        scaleMargins: { top: 0.08, bottom: 0.02 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (time: any) => {
          const t = typeof time === 'number' ? time : 0;
          const d = new Date(t * 1000);
          return d.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
          }).replace(' AM', 'a').replace(' PM', 'p');
        },
      },
      localization: {
        timeFormatter: (time: any) => {
          const t = typeof time === 'number' ? time : 0;
          const d = new Date(t * 1000);
          return d.toLocaleTimeString('en-US', {
            timeZone: 'America/New_York',
            hour: 'numeric',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
          });
        },
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
        type: 'custom' as const,
        minMove: 1,
        formatter: (price: number) => {
          if (price >= 1e9) return `$${(price / 1e9).toFixed(1)}B`;
          if (price >= 1e6) return `$${(price / 1e6).toFixed(1)}M`;
          if (price >= 1e3) return `$${(price / 1e3).toFixed(0)}K`;
          return `$${price.toFixed(0)}`;
        },
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
        type: 'custom' as const,
        minMove: 1,
        formatter: (price: number) => {
          if (price >= 1e9) return `$${(price / 1e9).toFixed(1)}B`;
          if (price >= 1e6) return `$${(price / 1e6).toFixed(1)}M`;
          if (price >= 1e3) return `$${(price / 1e3).toFixed(0)}K`;
          return `$${price.toFixed(0)}`;
        },
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

    // Set visible range based on timeframe
    const ts = chartRef.current.timeScale();

    if (timeframeRange && timeframeRange.from && timeframeRange.to) {
      const fromSec = Math.floor(timeframeRange.from / 1000);
      const toSec = Math.floor(timeframeRange.to / 1000);
      
      // Check if the timeframe window covers most of the data (Session view)
      const dataStart = chartData.callPoints[0]?.time || 0;
      const dataEnd = chartData.callPoints[chartData.callPoints.length - 1]?.time || 0;
      const dataRange = dataEnd - dataStart;
      const tfRange = toSec - fromSec;
      
      if (dataRange > 0 && tfRange >= dataRange * 0.8) {
        // Session-wide timeframe — fit all content
        ts.fitContent();
      } else {
        // Zoomed timeframe — set visible range with small padding
        const padding = Math.max(Math.floor(tfRange * 0.05), 60);
        try {
          ts.setVisibleRange({
            from: (fromSec - padding) as any,
            to: (toSec + padding) as any,
          });
        } catch {
          ts.fitContent();
        }
      }
    } else {
      ts.fitContent();
    }
  }, [chartData, timeframeRange]);

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
