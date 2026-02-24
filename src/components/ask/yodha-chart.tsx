'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';

/* ══════════════════════════════════════════════════════════
   YODHA CHART — TradingView Lightweight Charts
   
   Dual-pane layout:
   ┌─────────────────────────────────┐
   │  Candlestick + VWAP + Levels   │ 75%
   ├─────────────────────────────────┤
   │  Bull / Bear Pressure           │ 25%
   └─────────────────────────────────┘
   
   Both panes share synced time scale + crosshair
   All data Redis-backed via /api/candles + /api/timeline
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

interface PressurePoint {
  t: number; bp: number; brp: number;
}

const TF_API_MAP: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

const CHART_OPTS = {
  bg: '#131722',
  grid: 'rgba(42,46,57,0.25)',
  border: 'rgba(42,46,57,0.5)',
  crosshair: 'rgba(120,123,134,0.4)',
  crosshairLabel: 'rgba(42,46,57,0.95)',
  text: 'rgba(209,212,220,0.6)',
  font: "'JetBrains Mono', 'SF Mono', monospace",
  bull: '#26a69a',
  bear: '#ef5350',
  vwap: '#2962ff',
  cw: '#ff9800',
  pw: '#e040fb',
  gex: '#fdd835',
};

// ── Shared chart options factory ──
function makeChartOpts(showTimeLabels: boolean) {
  return {
    layout: {
      background: { type: ColorType.Solid, color: CHART_OPTS.bg },
      textColor: CHART_OPTS.text,
      fontFamily: CHART_OPTS.font,
      fontSize: 10,
    },
    grid: {
      vertLines: { color: CHART_OPTS.grid },
      horzLines: { color: CHART_OPTS.grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: CHART_OPTS.crosshair,
        width: 1 as any,
        style: LineStyle.Dashed,
        labelBackgroundColor: CHART_OPTS.crosshairLabel,
        labelVisible: showTimeLabels,
      },
      horzLine: {
        color: CHART_OPTS.crosshair,
        width: 1 as any,
        style: LineStyle.Dashed,
        labelBackgroundColor: CHART_OPTS.crosshairLabel,
      },
    },
    rightPriceScale: {
      borderColor: CHART_OPTS.border,
    },
    timeScale: {
      borderColor: CHART_OPTS.border,
      timeVisible: true,
      secondsVisible: false,
      rightOffset: 5,
      barSpacing: 8,
      minBarSpacing: 2,
      visible: showTimeLabels,
    },
    handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
    handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
  };
}

export function YodhaChart({
  ticker, timeframe, levels, price, changePercent, marketSession,
  entryLevel, targetLevel, stopLevel,
}: YodhaChartProps) {
  // ── Refs ──
  const mainContainerRef = useRef<HTMLDivElement>(null);
  const indicatorContainerRef = useRef<HTMLDivElement>(null);
  const mainChartRef = useRef<IChartApi | null>(null);
  const indChartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const bullSeriesRef = useRef<any>(null);
  const bearSeriesRef = useRef<any>(null);
  const priceLineRefs = useRef<any[]>([]);
  const syncingRef = useRef(false);

  const [loading, setLoading] = useState(true);
  const [barCount, setBarCount] = useState(0);
  const [tooltip, setTooltip] = useState<{ bull: number; bear: number; time: string } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const prevTickerRef = useRef(ticker);
  const prevTfRef = useRef(timeframe);

  const apiTf = TF_API_MAP[timeframe] || '5m';

  // ── Create both charts ──
  useEffect(() => {
    if (!mainContainerRef.current || !indicatorContainerRef.current) return;

    // ── Main chart (candles) ──
    const mainChart = createChart(mainContainerRef.current, {
      ...makeChartOpts(false), // hide time labels on main
      rightPriceScale: {
        borderColor: CHART_OPTS.border,
        scaleMargins: { top: 0.05, bottom: 0.05 },
      },
    });

    const candleSeries = mainChart.addCandlestickSeries({
      upColor: CHART_OPTS.bull,
      downColor: CHART_OPTS.bear,
      borderUpColor: CHART_OPTS.bull,
      borderDownColor: CHART_OPTS.bear,
      wickUpColor: CHART_OPTS.bull,
      wickDownColor: CHART_OPTS.bear,
    });

    const vwapSeries = mainChart.addLineSeries({
      color: CHART_OPTS.vwap,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // ── Indicator chart (pressure) ──
    const indChart = createChart(indicatorContainerRef.current, {
      ...makeChartOpts(true), // show time labels on indicator
      rightPriceScale: {
        borderColor: CHART_OPTS.border,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
    });

    const bullSeries = indChart.addAreaSeries({
      lineColor: CHART_OPTS.bull,
      topColor: 'rgba(38,166,154,0.35)',
      bottomColor: 'rgba(38,166,154,0.02)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const bearSeries = indChart.addAreaSeries({
      lineColor: CHART_OPTS.bear,
      topColor: 'rgba(239,83,80,0.28)',
      bottomColor: 'rgba(239,83,80,0.02)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // ── Sync time scales bidirectionally ──
    mainChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      indChart.timeScale().setVisibleLogicalRange(range);
      syncingRef.current = false;
    });

    indChart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
      if (syncingRef.current || !range) return;
      syncingRef.current = true;
      mainChart.timeScale().setVisibleLogicalRange(range);
      syncingRef.current = false;
    });

    // ── Sync crosshairs between charts ──
    // Guard prevents infinite loop: setCrosshairPosition → subscribeCrosshairMove → setCrosshairPosition
    let crosshairSyncing = false;

    mainChart.subscribeCrosshairMove((param: any) => {
      if (crosshairSyncing) return;
      crosshairSyncing = true;
      try {
        if (param.time) {
          indChart.setCrosshairPosition(NaN, param.time, bullSeries);
        } else {
          indChart.clearCrosshairPosition();
          setTooltip(null);
        }
      } catch {}
      crosshairSyncing = false;
    });

    indChart.subscribeCrosshairMove((param: any) => {
      if (crosshairSyncing) return;
      crosshairSyncing = true;
      try {
        if (param.time) {
          mainChart.setCrosshairPosition(NaN, param.time, candleSeries);
          // Extract bull/bear values for tooltip overlay
          const bullPoint = param.seriesData?.get(bullSeries) as any;
          const bearPoint = param.seriesData?.get(bearSeries) as any;
          if (bullPoint || bearPoint) {
            setTooltip({
              bull: Math.round(bullPoint?.value ?? 0),
              bear: Math.round(bearPoint?.value ?? 0),
              time: '',
            });
          }
        } else {
          mainChart.clearCrosshairPosition();
          setTooltip(null);
        }
      } catch {}
      crosshairSyncing = false;
    });

    // Store refs
    mainChartRef.current = mainChart;
    indChartRef.current = indChart;
    candleSeriesRef.current = candleSeries;
    vwapSeriesRef.current = vwapSeries;
    bullSeriesRef.current = bullSeries;
    bearSeriesRef.current = bearSeries;

    // ── Responsive ──
    const mainRO = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) mainChart.applyOptions({ width, height });
      }
    });
    const indRO = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) indChart.applyOptions({ width, height });
      }
    });
    mainRO.observe(mainContainerRef.current);
    indRO.observe(indicatorContainerRef.current);

    return () => {
      mainRO.disconnect();
      indRO.disconnect();
      mainChart.remove();
      indChart.remove();
      mainChartRef.current = null;
      indChartRef.current = null;
      candleSeriesRef.current = null;
      vwapSeriesRef.current = null;
      bullSeriesRef.current = null;
      bearSeriesRef.current = null;
    };
  }, []);

  // ── Fetch candles + pressure, render ──
  const fetchAndRender = useCallback(async (fitContent = false) => {
    const mainChart = mainChartRef.current;
    const indChart = indChartRef.current;
    const candleSeries = candleSeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;
    const bullSeries = bullSeriesRef.current;
    const bearSeries = bearSeriesRef.current;
    if (!mainChart || !indChart || !candleSeries || !vwapSeries || !bullSeries || !bearSeries) return;

    try {
      // Fetch candles and pressure in parallel
      const [candleRes, pressureRes] = await Promise.all([
        fetch(`/api/candles/${ticker}?tf=${apiTf}&_t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/timeline/${ticker}?_t=${Date.now()}`, { cache: 'no-store' }),
      ]);

      // ── Process candles ──
      if (candleRes.ok) {
        const candleData = await candleRes.json();
        const bars: Bar[] = candleData.bars || [];
        if (bars.length > 0) {
          candleSeries.setData(bars.map(b => ({
            time: b.t as Time,
            open: b.o, high: b.h, low: b.l, close: b.c,
          })));

          vwapSeries.setData(bars.map(b => ({
            time: b.t as Time,
            value: b.vw,
          })));

          setBarCount(bars.length);

          // ── Key levels ──
          priceLineRefs.current.forEach(pl => {
            try { candleSeries.removePriceLine(pl); } catch {}
          });
          priceLineRefs.current = [];

          const addLevel = (val: number | null | undefined, title: string, color: string, style: number = LineStyle.Dashed, lw = 1) => {
            if (val == null || Math.abs((val - price) / price) > 0.10) return;
            const pl = candleSeries.createPriceLine({
              price: val, color, lineWidth: lw, lineStyle: style,
              axisLabelVisible: true, title,
            });
            priceLineRefs.current.push(pl);
          };

          if (levels.vwap) addLevel(levels.vwap, 'VWAP', CHART_OPTS.vwap, LineStyle.Solid, 1);
          addLevel(entryLevel, 'ENTRY', CHART_OPTS.bull, LineStyle.Dashed, 1);
          addLevel(targetLevel, 'TARGET', '#2979ff', LineStyle.Dashed, 1);
          addLevel(stopLevel, 'STOP', CHART_OPTS.bear, LineStyle.Dashed, 1);
          addLevel(levels.callWall, 'CW', CHART_OPTS.cw, LineStyle.Dotted, 1);
          addLevel(levels.putWall, 'PW', CHART_OPTS.pw, LineStyle.Dotted, 1);
          addLevel(levels.gexFlip, 'GEX', CHART_OPTS.gex, LineStyle.Dotted, 1);
        }
      }

      // ── Process pressure ──
      if (pressureRes.ok) {
        const pressureData = await pressureRes.json();
        const points: PressurePoint[] = (pressureData.points || []).filter(
          (p: any) => p.bp > 0 || p.brp > 0
        );

        if (points.length > 0) {
          // Convert timestamps: timeline stores ms, chart needs seconds
          bullSeries.setData(points.map(p => ({
            time: Math.floor(p.t / 1000) as Time,
            value: p.bp,
          })));
          bearSeries.setData(points.map(p => ({
            time: Math.floor(p.t / 1000) as Time,
            value: p.brp,
          })));

          // Add 50-line as midpoint reference
          // (done via price line on the bull series)
          try {
            bullSeries.createPriceLine({
              price: 50,
              color: 'rgba(209,212,220,0.08)',
              lineWidth: 1,
              lineStyle: LineStyle.Dotted,
              axisLabelVisible: false,
              title: '',
            });
          } catch {}
        }
      }

      if (fitContent) {
        mainChart.timeScale().fitContent();
        // Indicator syncs automatically via the subscription
      }

      setLoading(false);
    } catch (e) {
      console.error('[YodhaChart] Fetch error:', e);
      setLoading(false);
    }
  }, [ticker, apiTf, levels, price, entryLevel, targetLevel, stopLevel]);

  // ── On ticker/timeframe change ──
  useEffect(() => {
    prevTickerRef.current = ticker;
    prevTfRef.current = timeframe;

    setLoading(true);
    fetchAndRender(true);

    if (pollRef.current) clearInterval(pollRef.current);
    const interval = marketSession === 'open'
      ? (['1m', '5m'].includes(timeframe) ? 10000 : 30000)
      : 120000;
    pollRef.current = setInterval(() => fetchAndRender(false), interval);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ticker, timeframe, marketSession, fetchAndRender]);

  // ── Update levels reactively ──
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    if (!candleSeries) return;

    priceLineRefs.current.forEach(pl => {
      try { candleSeries.removePriceLine(pl); } catch {}
    });
    priceLineRefs.current = [];

    const addLevel = (val: number | null | undefined, title: string, color: string, style: number = LineStyle.Dashed, lw = 1) => {
      if (val == null || Math.abs((val - price) / price) > 0.10) return;
      const pl = candleSeries.createPriceLine({
        price: val, color, lineWidth: lw, lineStyle: style,
        axisLabelVisible: true, title,
      });
      priceLineRefs.current.push(pl);
    };

    if (levels.vwap) addLevel(levels.vwap, 'VWAP', CHART_OPTS.vwap, LineStyle.Solid, 1);
    addLevel(entryLevel, 'ENTRY', CHART_OPTS.bull, LineStyle.Dashed, 1);
    addLevel(targetLevel, 'TARGET', '#2979ff', LineStyle.Dashed, 1);
    addLevel(stopLevel, 'STOP', CHART_OPTS.bear, LineStyle.Dashed, 1);
    addLevel(levels.callWall, 'CW', CHART_OPTS.cw, LineStyle.Dotted, 1);
    addLevel(levels.putWall, 'PW', CHART_OPTS.pw, LineStyle.Dotted, 1);
    addLevel(levels.gexFlip, 'GEX', CHART_OPTS.gex, LineStyle.Dotted, 1);
  }, [levels, price, entryLevel, targetLevel, stopLevel]);

  // Derived tooltip spread
  const spread = tooltip ? tooltip.bull - tooltip.bear : null;

  return (
    <div style={{
      height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
      background: CHART_OPTS.bg, borderRadius: 4, position: 'relative', overflow: 'hidden',
    }}>
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
              border: '2px solid rgba(38,166,154,0.3)', borderTopColor: '#26a69a',
              borderRadius: '50%', animation: 'yspin 0.7s linear infinite', margin: '0 auto 8px',
            }} />
            <span style={{ color: 'rgba(209,212,220,0.5)', fontSize: 11, fontFamily: CHART_OPTS.font }}>
              Loading {ticker}...
            </span>
            <style>{`@keyframes yspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* ── MAIN CHART (candles) ── */}
      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
        <div ref={mainContainerRef} style={{ width: '100%', height: '100%' }} />
        {/* Bar count watermark */}
        {barCount > 0 && (
          <div style={{
            position: 'absolute', bottom: 4, left: 8,
            fontSize: 9, color: 'rgba(209,212,220,0.15)',
            fontFamily: CHART_OPTS.font, pointerEvents: 'none',
          }}>
            {barCount} bars · Polygon
          </div>
        )}
      </div>

      {/* ── DIVIDER ── */}
      <div style={{
        height: 1, background: CHART_OPTS.border, flexShrink: 0,
      }} />

      {/* ── INDICATOR CHART (pressure) ── */}
      <div style={{ height: 120, flexShrink: 0, position: 'relative' }}>
        <div ref={indicatorContainerRef} style={{ width: '100%', height: '100%' }} />

        {/* Indicator label */}
        <div style={{
          position: 'absolute', top: 4, left: 8,
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'none', zIndex: 2,
        }}>
          <span style={{
            fontSize: 9, fontWeight: 600, fontFamily: CHART_OPTS.font,
            color: 'rgba(209,212,220,0.25)',
          }}>
            Bull / Bear Pressure
          </span>
          <span style={{ fontSize: 9, fontFamily: CHART_OPTS.font, color: CHART_OPTS.bull }}>
            ● Bull
          </span>
          <span style={{ fontSize: 9, fontFamily: CHART_OPTS.font, color: CHART_OPTS.bear }}>
            ● Bear
          </span>
          {/* Live tooltip from crosshair */}
          {tooltip && (
            <span style={{ fontSize: 9, fontFamily: CHART_OPTS.font, marginLeft: 6 }}>
              <span style={{ color: CHART_OPTS.bull, fontWeight: 600 }}>▲{tooltip.bull}</span>
              <span style={{ color: 'rgba(209,212,220,0.2)', margin: '0 4px' }}>|</span>
              <span style={{ color: CHART_OPTS.bear, fontWeight: 600 }}>▼{tooltip.bear}</span>
              {spread != null && (
                <>
                  <span style={{ color: 'rgba(209,212,220,0.2)', margin: '0 4px' }}>|</span>
                  <span style={{
                    color: spread >= 0 ? CHART_OPTS.bull : CHART_OPTS.bear,
                    fontWeight: 700,
                  }}>
                    Δ{spread >= 0 ? '+' : ''}{spread}
                  </span>
                </>
              )}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
