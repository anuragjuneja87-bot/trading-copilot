'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import { FONT_MONO } from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   CVD LINE CHART — TradingView-style interactive chart
   
   Uses lightweight-charts Baseline series:
   - Green fill/line above zero (buying pressure)
   - Red fill/line below zero (selling pressure)
   - Proper time axis (9:30 AM → 4:00 PM ET)
   - Mouse wheel zoom + drag to pan
   - Crosshair with CVD value tooltip
   ════════════════════════════════════════════════════════════════ */

interface CVDChartProps {
  data: { time: string; timeMs: number; buyVolume: number; sellVolume: number }[];
  timeframeRange?: { from: number; to: number; label: string };
  sessionBounds?: { rthOpenIdx: number; rthCloseIdx: number };
  height?: number;
}

function fmtVol(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return v.toFixed(0);
}

export function CVDLineChart({ data, timeframeRange, sessionBounds, height = 150 }: CVDChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Baseline'> | null>(null);

  // Compute cumulative CVD
  const chartData = useMemo(() => {
    if (!data || data.length < 2) return null;

    let cvd = 0;
    const points: { time: number; value: number }[] = [];

    const sorted = [...data].sort((a, b) => a.timeMs - b.timeMs);

    for (const d of sorted) {
      if (!d.timeMs || d.timeMs < 1000000000000) continue;
      cvd += (d.buyVolume || 0) - (d.sellVolume || 0);
      points.push({ time: Math.floor(d.timeMs / 1000), value: cvd });
    }

    if (points.length < 2) return null;
    return points;
  }, [data]);

  // Create chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: 'rgba(255,255,255,0.4)',
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(255,255,255,0.15)', style: LineStyle.Dashed, width: 1, labelBackgroundColor: 'rgba(20,26,36,0.9)' },
        horzLine: { color: 'rgba(255,255,255,0.15)', style: LineStyle.Dashed, width: 1, labelBackgroundColor: 'rgba(20,26,36,0.9)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.06)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 2,
        barSpacing: 6,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
    });

    // Baseline series: green above 0, red below 0
    const series = chart.addBaselineSeries({
      baseValue: { type: 'price', price: 0 },
      topLineColor: 'rgba(0,220,130,0.85)',
      topFillColor1: 'rgba(0,220,130,0.15)',
      topFillColor2: 'rgba(0,220,130,0.02)',
      bottomLineColor: 'rgba(255,71,87,0.85)',
      bottomFillColor1: 'rgba(255,71,87,0.02)',
      bottomFillColor2: 'rgba(255,71,87,0.15)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      lastValueVisible: true,
      priceLineVisible: false,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => fmtVol(price),
      },
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width } = entry.contentRect;
        if (width > 0) chart.applyOptions({ width });
      }
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; seriesRef.current = null; };
  }, [height]);

  // Update data
  useEffect(() => {
    if (!chartRef.current || !seriesRef.current || !chartData) return;

    seriesRef.current.setData(chartData as any);

    const ts = chartRef.current.timeScale();
    if (timeframeRange && timeframeRange.from && timeframeRange.to) {
      const fromSec = Math.floor(timeframeRange.from / 1000);
      const toSec = Math.floor(timeframeRange.to / 1000);
      const dataStart = chartData[0]?.time || 0;
      const dataEnd = chartData[chartData.length - 1]?.time || 0;
      const dataRange = dataEnd - dataStart;
      const tfRange = toSec - fromSec;

      if (dataRange > 0 && tfRange >= dataRange * 0.8) {
        ts.fitContent();
      } else {
        const padding = Math.max(Math.floor(tfRange * 0.05), 60);
        try { ts.setVisibleRange({ from: (fromSec - padding) as any, to: (toSec + padding) as any }); }
        catch { ts.fitContent(); }
      }
    } else {
      ts.fitContent();
    }
  }, [chartData, timeframeRange]);

  if (!chartData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No CVD data</div>;
  }

  return <div ref={containerRef} style={{ width: '100%', height, position: 'relative' }} />;
}
