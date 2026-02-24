'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';

/* ══════════════════════════════════════════════════════════
   YODHA CHART — TradingView Lightweight Charts
   
   Real-time Polygon OHLC → Redis-cached → TV-quality UX
   - Native TV zoom/pan/price-scale drag
   - VWAP overlay
   - Key levels (entry, CW, PW, GEX)
   - Bull/Bear pressure overlay (bottom)
   ══════════════════════════════════════════════════════════ */

interface YodhaChartProps {
  ticker: string;
  timeframe: string;
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
    maxPain?: number | null;
    vwap?: number | null;
  };
  price: number;
  changePercent: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  entryLevel?: number;
  targetLevel?: number;
  stopLevel?: number;
}

interface Bar {
  t: number; o: number; h: number; l: number; c: number; v: number; vw: number;
}

const TF_API_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

export function YodhaChart({
  ticker, timeframe, levels, price, changePercent, marketSession,
  entryLevel, targetLevel, stopLevel,
}: YodhaChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const priceLineRefs = useRef<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [barCount, setBarCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const prevTickerRef = useRef(ticker);
  const prevTfRef = useRef(timeframe);

  const apiTf = TF_API_MAP[timeframe] || '5m';

  // ── Create chart once ──
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#131722' },
        textColor: 'rgba(209,212,220,0.6)',
        fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
        fontSize: 10,
      },
      grid: {
        vertLines: { color: 'rgba(42,46,57,0.25)' },
        horzLines: { color: 'rgba(42,46,57,0.25)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: 'rgba(120,123,134,0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: 'rgba(42,46,57,0.95)',
        },
        horzLine: {
          color: 'rgba(120,123,134,0.4)',
          width: 1,
          style: LineStyle.Dashed,
          labelBackgroundColor: 'rgba(42,46,57,0.95)',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(42,46,57,0.5)',
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
      timeScale: {
        borderColor: 'rgba(42,46,57,0.5)',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
        minBarSpacing: 2,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    // Candlestick series
    const candleSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderUpColor: '#26a69a',
      borderDownColor: '#ef5350',
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    // VWAP line
    const vwapSeries = chart.addLineSeries({
      color: '#2962ff',
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    vwapSeriesRef.current = vwapSeries;

    // Responsive
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      vwapSeriesRef.current = null;
    };
  }, []);

  // ── Fetch + render data ──
  const fetchAndRender = useCallback(async (fitContent = false) => {
    const chart = chartRef.current;
    const candleSeries = candleSeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;
    if (!chart || !candleSeries || !vwapSeries) return;

    try {
      const res = await fetch(`/api/candles/${ticker}?tf=${apiTf}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      const bars: Bar[] = data.bars || [];
      if (bars.length === 0) return;

      // Convert to lightweight-charts format
      const candleData = bars.map(b => ({
        time: b.t as Time,
        open: b.o,
        high: b.h,
        low: b.l,
        close: b.c,
      }));

      const vwapData = bars.map(b => ({
        time: b.t as Time,
        value: b.vw,
      }));

      candleSeries.setData(candleData);
      vwapSeries.setData(vwapData);
      setBarCount(bars.length);

      // ── Price lines (levels) ──
      // Clear old ones
      priceLineRefs.current.forEach(pl => {
        try { candleSeries.removePriceLine(pl); } catch {}
      });
      priceLineRefs.current = [];

      const addLevel = (val: number | null | undefined, title: string, color: string, style: number = LineStyle.Dashed, lineWidth = 1) => {
        if (val == null) return;
        // Only show if within 10% of current price
        if (Math.abs((val - price) / price) > 0.10) return;
        const pl = candleSeries.createPriceLine({
          price: val,
          color,
          lineWidth,
          lineStyle: style,
          axisLabelVisible: true,
          title,
        });
        priceLineRefs.current.push(pl);
      };

      // VWAP level line (from levels prop — more authoritative than computed)
      if (levels.vwap) {
        addLevel(levels.vwap, 'VWAP', '#2962ff', LineStyle.Solid, 1);
      }

      addLevel(entryLevel, 'ENTRY', '#26a69a', LineStyle.Dashed, 1);
      addLevel(targetLevel, 'TARGET', '#2979ff', LineStyle.Dashed, 1);
      addLevel(stopLevel, 'STOP', '#ef5350', LineStyle.Dashed, 1);
      addLevel(levels.callWall, 'CW', '#ff9800', LineStyle.Dotted, 1);
      addLevel(levels.putWall, 'PW', '#e040fb', LineStyle.Dotted, 1);
      addLevel(levels.gexFlip, 'GEX', '#fdd835', LineStyle.Dotted, 1);

      if (fitContent) {
        chart.timeScale().fitContent();
      }

      setLoading(false);
    } catch (e) {
      console.error('[YodhaChart] Fetch error:', e);
      setLoading(false);
    }
  }, [ticker, apiTf, levels, price, entryLevel, targetLevel, stopLevel]);

  // ── On ticker/timeframe change: re-fetch and fit ──
  useEffect(() => {
    const changed = ticker !== prevTickerRef.current || timeframe !== prevTfRef.current;
    prevTickerRef.current = ticker;
    prevTfRef.current = timeframe;

    setLoading(true);
    fetchAndRender(true);

    // Poll during market hours
    if (pollRef.current) clearInterval(pollRef.current);
    const interval = marketSession === 'open'
      ? (['1m', '5m'].includes(timeframe) ? 10000 : 30000)
      : 120000;
    pollRef.current = setInterval(() => fetchAndRender(false), interval);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ticker, timeframe, marketSession, fetchAndRender]);

  // ── Update levels when they change (without refetching bars) ──
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    priceLineRefs.current.forEach(pl => {
      try { candleSeries.removePriceLine(pl); } catch {}
    });
    priceLineRefs.current = [];

    const addLevel = (val: number | null | undefined, title: string, color: string, style: number = LineStyle.Dashed, lineWidth = 1) => {
      if (val == null) return;
      if (Math.abs((val - price) / price) > 0.10) return;
      const pl = candleSeries.createPriceLine({
        price: val,
        color,
        lineWidth,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLineRefs.current.push(pl);
    };

    if (levels.vwap) addLevel(levels.vwap, 'VWAP', '#2962ff', LineStyle.Solid, 1);
    addLevel(entryLevel, 'ENTRY', '#26a69a', LineStyle.Dashed, 1);
    addLevel(targetLevel, 'TARGET', '#2979ff', LineStyle.Dashed, 1);
    addLevel(stopLevel, 'STOP', '#ef5350', LineStyle.Dashed, 1);
    addLevel(levels.callWall, 'CW', '#ff9800', LineStyle.Dotted, 1);
    addLevel(levels.putWall, 'PW', '#e040fb', LineStyle.Dotted, 1);
    addLevel(levels.gexFlip, 'GEX', '#fdd835', LineStyle.Dotted, 1);
  }, [levels, price, entryLevel, targetLevel, stopLevel]);

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', background: '#131722', borderRadius: 4 }}>
      {/* Loading overlay */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(19,23,34,0.85)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 20, height: 20,
              border: '2px solid rgba(38,166,154,0.3)',
              borderTopColor: '#26a69a',
              borderRadius: '50%',
              animation: 'yspin 0.7s linear infinite',
              margin: '0 auto 8px',
            }} />
            <span style={{ color: 'rgba(209,212,220,0.5)', fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
              Loading {ticker}...
            </span>
            <style>{`@keyframes yspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* Chart container */}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {/* Bottom-right bar count */}
      {barCount > 0 && (
        <div style={{
          position: 'absolute', bottom: 4, left: 8,
          fontSize: 9, color: 'rgba(209,212,220,0.2)',
          fontFamily: "'JetBrains Mono', monospace",
          pointerEvents: 'none',
        }}>
          {barCount} bars · Polygon
        </div>
      )}
    </div>
  );
}
