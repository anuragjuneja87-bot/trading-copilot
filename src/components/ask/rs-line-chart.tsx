'use client';

import { useRef, useEffect, useMemo } from 'react';
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import { FONT_MONO } from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   RELATIVE STRENGTH LINE CHART — TradingView-style
   
   Three line series showing % change from open:
   - Ticker (white, thick), SPY (green, thin), QQQ (purple, thin)
   
   TIMEZONE FIX: ET offset applied so x-axis shows Eastern Time.
   ════════════════════════════════════════════════════════════════ */

interface RSChartProps {
  data: { time: string; timeMs: number; tickerPct: number; spyPct: number; qqqPct: number }[];
  ticker: string;
  timeframeRange?: { from: number; to: number; label: string };
  height?: number;
}

function getETOffsetSeconds(timestampMs: number): number {
  const d = new Date(timestampMs);
  const utcStr = d.toLocaleString('en-US', { timeZone: 'UTC' });
  const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
  return Math.round((new Date(etStr).getTime() - new Date(utcStr).getTime()) / 1000);
}

export function RSLineChart({ data, ticker, timeframeRange, height = 140 }: RSChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const tickerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const spySeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
  const qqqSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);

  const chartData = useMemo(() => {
    if (!data || data.length < 2) return null;

    const sorted = [...data].sort((a, b) => a.timeMs - b.timeMs);
    const etOffset = sorted[0]?.timeMs ? getETOffsetSeconds(sorted[0].timeMs) : 0;

    const tickerPoints: { time: number; value: number }[] = [];
    const spyPoints: { time: number; value: number }[] = [];
    const qqqPoints: { time: number; value: number }[] = [];

    for (const d of sorted) {
      if (!d.timeMs || d.timeMs < 1000000000000) continue;
      const t = Math.floor(d.timeMs / 1000) + etOffset;
      tickerPoints.push({ time: t, value: d.tickerPct });
      spyPoints.push({ time: t, value: d.spyPct });
      qqqPoints.push({ time: t, value: d.qqqPct });
    }

    if (tickerPoints.length < 2) return null;
    return { tickerPoints, spyPoints, qqqPoints, etOffset };
  }, [data]);

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
        scaleMargins: { top: 0.1, bottom: 0.1 },
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

    const spySeries = chart.addLineSeries({
      color: 'rgba(0,220,130,0.5)', lineWidth: 1,
      crosshairMarkerVisible: true, crosshairMarkerRadius: 2, crosshairMarkerBackgroundColor: 'rgb(0,220,130)',
      lastValueVisible: true, priceLineVisible: false, title: 'SPY',
      priceFormat: { type: 'custom', formatter: (price: number) => `${price >= 0 ? '+' : ''}${price.toFixed(2)}%` },
    });

    const qqqSeries = chart.addLineSeries({
      color: 'rgba(167,139,250,0.5)', lineWidth: 1,
      crosshairMarkerVisible: true, crosshairMarkerRadius: 2, crosshairMarkerBackgroundColor: 'rgb(167,139,250)',
      lastValueVisible: true, priceLineVisible: false, title: 'QQQ',
      priceFormat: { type: 'custom', formatter: (price: number) => `${price >= 0 ? '+' : ''}${price.toFixed(2)}%` },
    });

    const tickerSeries = chart.addLineSeries({
      color: 'rgba(232,234,240,0.9)', lineWidth: 2,
      crosshairMarkerVisible: true, crosshairMarkerRadius: 3, crosshairMarkerBackgroundColor: 'rgb(232,234,240)',
      lastValueVisible: true, priceLineVisible: false, title: ticker,
      priceFormat: { type: 'custom', formatter: (price: number) => `${price >= 0 ? '+' : ''}${price.toFixed(2)}%` },
    });

    chartRef.current = chart;
    tickerSeriesRef.current = tickerSeries;
    spySeriesRef.current = spySeries;
    qqqSeriesRef.current = qqqSeries;

    const ro = new ResizeObserver(entries => {
      for (const entry of entries) { const { width } = entry.contentRect; if (width > 0) chart.applyOptions({ width }); }
    });
    ro.observe(containerRef.current);

    return () => { ro.disconnect(); chart.remove(); chartRef.current = null; tickerSeriesRef.current = null; spySeriesRef.current = null; qqqSeriesRef.current = null; };
  }, [height, ticker]);

  useEffect(() => {
    if (!chartRef.current || !tickerSeriesRef.current || !spySeriesRef.current || !qqqSeriesRef.current || !chartData) return;

    tickerSeriesRef.current.setData(chartData.tickerPoints as any);
    spySeriesRef.current.setData(chartData.spyPoints as any);
    qqqSeriesRef.current.setData(chartData.qqqPoints as any);

    const ts = chartRef.current.timeScale();
    if (timeframeRange && timeframeRange.from && timeframeRange.to) {
      const etOffset = chartData.etOffset;
      const fromSec = Math.floor(timeframeRange.from / 1000) + etOffset;
      const toSec = Math.floor(timeframeRange.to / 1000) + etOffset;
      const dataStart = chartData.tickerPoints[0]?.time || 0;
      const dataEnd = chartData.tickerPoints[chartData.tickerPoints.length - 1]?.time || 0;
      const dataRange = dataEnd - dataStart;
      const tfRange = toSec - fromSec;

      if (dataRange > 0 && tfRange >= dataRange * 0.8) { ts.fitContent(); }
      else {
        const padding = Math.max(Math.floor(tfRange * 0.05), 60);
        try { ts.setVisibleRange({ from: (fromSec - padding) as any, to: (toSec + padding) as any }); }
        catch { ts.fitContent(); }
      }
    } else { ts.fitContent(); }
  }, [chartData, timeframeRange]);

  if (!chartData) {
    return <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>No RS data</div>;
  }

  return <div ref={containerRef} style={{ width: '100%', height, position: 'relative' }} />;
}
