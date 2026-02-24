'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { createChart, ColorType, CrosshairMode, LineStyle } from 'lightweight-charts';
import type { IChartApi, Time } from 'lightweight-charts';

/* ══════════════════════════════════════════════════════════
   YODHA CHART — TradingView Lightweight Charts
   
   Dual-pane layout (synced time + crosshair):
   ┌─────────────────────────────────┐
   │  Candlestick + VWAP + Levels   │  flex-1
   ├─────────────────────────────────┤
   │  Bull / Bear Pressure (0-100)  │  140px
   └─────────────────────────────────┘
   
   All timestamps shifted to ET for display.
   Data: /api/candles (Redis) + /api/timeline (Redis)
   ══════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────────

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

// ── Constants ────────────────────────────────────────────

const TF_API: Record<string, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w',
};

const C = {
  bg: '#131722',
  grid: 'rgba(42,46,57,0.3)',
  gridFaint: 'rgba(42,46,57,0.15)',
  border: 'rgba(42,46,57,0.6)',
  crosshair: 'rgba(120,123,134,0.4)',
  crossLabel: 'rgba(42,46,57,0.95)',
  text: 'rgba(209,212,220,0.65)',
  textDim: 'rgba(209,212,220,0.3)',
  font: "'JetBrains Mono', 'SF Mono', monospace",
  bull: '#26a69a',
  bear: '#ef5350',
  vwap: '#2962ff',
  cw: '#ff9800',
  pw: '#e040fb',
  gex: '#fdd835',
};

// ── Timezone: compute ET offset (handles EST/EDT automatically) ──
function getETOffsetSeconds(): number {
  const now = new Date();
  const utcStr = now.toLocaleString('en-US', { timeZone: 'UTC' });
  const etStr = now.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const diffMs = new Date(etStr).getTime() - new Date(utcStr).getTime();
  return Math.round(diffMs / 1000);
}

// ── Component ────────────────────────────────────────────

export function YodhaChart({
  ticker, timeframe, levels, price, changePercent, marketSession,
  entryLevel, targetLevel, stopLevel,
}: YodhaChartProps) {
  const mainBoxRef = useRef<HTMLDivElement>(null);
  const indBoxRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<IChartApi | null>(null);
  const indRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<any>(null);
  const vwapRef = useRef<any>(null);
  const bullRef = useRef<any>(null);
  const bearRef = useRef<any>(null);
  const plinesRef = useRef<any[]>([]);
  const syncLock = useRef(false);

  const [loading, setLoading] = useState(true);
  const [barCount, setBarCount] = useState(0);
  const [tip, setTip] = useState<{ b: number; br: number } | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const apiTf = TF_API[timeframe] || '5m';
  const etOffset = useRef(getETOffsetSeconds());

  // Shift UTC seconds → ET seconds for display
  const toET = useCallback((utcSec: number) => (utcSec + etOffset.current) as Time, []);

  // ── Create both charts ──
  useEffect(() => {
    if (!mainBoxRef.current || !indBoxRef.current) return;

    // ── Main (candlestick) chart ──
    const main = createChart(mainBoxRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.text,
        fontFamily: C.font,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: C.grid },
        horzLines: { color: C.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, width: 1 as any, style: LineStyle.Dashed, labelBackgroundColor: C.crossLabel, labelVisible: false },
        horzLine: { color: C.crosshair, width: 1 as any, style: LineStyle.Dashed, labelBackgroundColor: C.crossLabel },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.06, bottom: 0.06 },
        entireTextOnly: true,
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 2,
        visible: false, // hide time on main — show on indicator only
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const candle = main.addCandlestickSeries({
      upColor: C.bull,
      downColor: C.bear,
      borderUpColor: C.bull,
      borderDownColor: C.bear,
      wickUpColor: C.bull,
      wickDownColor: C.bear,
    });

    const vwapLine = main.addLineSeries({
      color: C.vwap,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    // ── Indicator (pressure) chart ──
    const ind = createChart(indBoxRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: C.bg },
        textColor: C.textDim,
        fontFamily: C.font,
        fontSize: 10,
      },
      grid: {
        vertLines: { color: C.gridFaint },
        horzLines: { color: C.gridFaint },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: C.crosshair, width: 1 as any, style: LineStyle.Dashed, labelBackgroundColor: C.crossLabel },
        horzLine: { color: C.crosshair, width: 1 as any, style: LineStyle.Dashed, labelBackgroundColor: C.crossLabel },
      },
      rightPriceScale: {
        borderColor: C.border,
        scaleMargins: { top: 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderColor: C.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
        minBarSpacing: 2,
        visible: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
      handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
    });

    const bullSeries = ind.addAreaSeries({
      lineColor: C.bull,
      topColor: 'rgba(38,166,154,0.4)',
      bottomColor: 'rgba(38,166,154,0.02)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    const bearSeries = ind.addAreaSeries({
      lineColor: C.bear,
      topColor: 'rgba(239,83,80,0.3)',
      bottomColor: 'rgba(239,83,80,0.02)',
      lineWidth: 2,
      crosshairMarkerVisible: true,
      crosshairMarkerRadius: 3,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    // ── Time scale sync ──
    main.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
      if (syncLock.current || !range) return;
      syncLock.current = true;
      try { ind.timeScale().setVisibleLogicalRange(range); } catch {}
      syncLock.current = false;
    });
    ind.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
      if (syncLock.current || !range) return;
      syncLock.current = true;
      try { main.timeScale().setVisibleLogicalRange(range); } catch {}
      syncLock.current = false;
    });

    // ── Crosshair sync ──
    let xSyncing = false;
    main.subscribeCrosshairMove((p: any) => {
      if (xSyncing) return;
      xSyncing = true;
      try {
        if (p.time) { ind.setCrosshairPosition(NaN, p.time, bullSeries); }
        else { ind.clearCrosshairPosition(); setTip(null); }
      } catch {}
      xSyncing = false;
    });
    ind.subscribeCrosshairMove((p: any) => {
      if (xSyncing) return;
      xSyncing = true;
      try {
        if (p.time) {
          main.setCrosshairPosition(NaN, p.time, candle);
          const bv = p.seriesData?.get(bullSeries) as any;
          const brv = p.seriesData?.get(bearSeries) as any;
          if (bv || brv) {
            setTip({ b: Math.round(bv?.value ?? 0), br: Math.round(brv?.value ?? 0) });
          }
        } else {
          main.clearCrosshairPosition();
          setTip(null);
        }
      } catch {}
      xSyncing = false;
    });

    // Store refs
    mainRef.current = main;
    indRef.current = ind;
    candleRef.current = candle;
    vwapRef.current = vwapLine;
    bullRef.current = bullSeries;
    bearRef.current = bearSeries;

    // ── Responsive ──
    const ro1 = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      if (width > 0 && height > 0) main.applyOptions({ width, height });
    });
    const ro2 = new ResizeObserver(e => {
      const { width, height } = e[0].contentRect;
      if (width > 0 && height > 0) ind.applyOptions({ width, height });
    });
    ro1.observe(mainBoxRef.current);
    ro2.observe(indBoxRef.current);

    return () => {
      ro1.disconnect(); ro2.disconnect();
      main.remove(); ind.remove();
      mainRef.current = indRef.current = null;
      candleRef.current = vwapRef.current = bullRef.current = bearRef.current = null;
    };
  }, []);

  // ── Fetch + render ──
  const fetchAndRender = useCallback(async (fit = false) => {
    const main = mainRef.current;
    const ind = indRef.current;
    const cs = candleRef.current;
    const vs = vwapRef.current;
    const bs = bullRef.current;
    const brs = bearRef.current;
    if (!main || !ind || !cs || !vs || !bs || !brs) return;

    try {
      const [cRes, pRes] = await Promise.all([
        fetch(`/api/candles/${ticker}?tf=${apiTf}&_t=${Date.now()}`, { cache: 'no-store' }),
        fetch(`/api/timeline/${ticker}?_t=${Date.now()}`, { cache: 'no-store' }),
      ]);

      // ── Candles ──
      if (cRes.ok) {
        const cData = await cRes.json();
        const bars: Bar[] = cData.bars || [];
        if (bars.length > 0) {
          // Shift to ET for display
          cs.setData(bars.map(b => ({
            time: toET(b.t), open: b.o, high: b.h, low: b.l, close: b.c,
          })));
          vs.setData(bars.map(b => ({ time: toET(b.t), value: b.vw })));
          setBarCount(bars.length);

          // ── Price levels ──
          plinesRef.current.forEach(pl => { try { cs.removePriceLine(pl); } catch {} });
          plinesRef.current = [];

          const addLvl = (v: number | null | undefined, t: string, col: string, s = LineStyle.Dashed, w = 1) => {
            if (v == null || Math.abs((v - price) / price) > 0.10) return;
            try {
              plinesRef.current.push(cs.createPriceLine({
                price: v, color: col, lineWidth: w, lineStyle: s,
                axisLabelVisible: true, title: t,
              }));
            } catch {}
          };

          if (levels.vwap) addLvl(levels.vwap, 'VWAP', C.vwap, LineStyle.Solid, 1);
          addLvl(entryLevel, 'ENTRY', C.bull, LineStyle.Dashed, 1);
          addLvl(targetLevel, 'TARGET', '#2979ff', LineStyle.Dashed, 1);
          addLvl(stopLevel, 'STOP', C.bear, LineStyle.Dashed, 1);
          addLvl(levels.callWall, 'CW', C.cw, LineStyle.Dotted, 1);
          addLvl(levels.putWall, 'PW', C.pw, LineStyle.Dotted, 1);
          addLvl(levels.gexFlip, 'GEX', C.gex, LineStyle.Dotted, 1);
        }
      }

      // ── Pressure ──
      if (pRes.ok) {
        const pData = await pRes.json();
        const pts: PressurePoint[] = (pData.points || []).filter((p: any) => p.bp > 0 || p.brp > 0);

        if (pts.length > 0) {
          // Timeline stores ms → convert to seconds → shift to ET
          bs.setData(pts.map(p => ({ time: toET(Math.floor(p.t / 1000)), value: p.bp })));
          brs.setData(pts.map(p => ({ time: toET(Math.floor(p.t / 1000)), value: p.brp })));

          // 50-line reference
          try {
            bs.createPriceLine({
              price: 50, color: 'rgba(209,212,220,0.06)', lineWidth: 1,
              lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '',
            });
          } catch {}
        }
      }

      if (fit) {
        main.timeScale().fitContent();
      }
      setLoading(false);
    } catch (e) {
      console.error('[YodhaChart]', e);
      setLoading(false);
    }
  }, [ticker, apiTf, levels, price, entryLevel, targetLevel, stopLevel, toET]);

  // ── Ticker / timeframe change ──
  useEffect(() => {
    setLoading(true);
    fetchAndRender(true);

    if (pollRef.current) clearInterval(pollRef.current);
    const ms = marketSession === 'open'
      ? (['1m', '5m'].includes(timeframe) ? 10000 : 30000)
      : 120000;
    pollRef.current = setInterval(() => fetchAndRender(false), ms);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ticker, timeframe, marketSession, fetchAndRender]);

  // ── Reactive level updates ──
  useEffect(() => {
    const cs = candleRef.current;
    if (!cs) return;
    plinesRef.current.forEach(pl => { try { cs.removePriceLine(pl); } catch {} });
    plinesRef.current = [];
    const add = (v: number | null | undefined, t: string, col: string, s = LineStyle.Dashed, w = 1) => {
      if (v == null || Math.abs((v - price) / price) > 0.10) return;
      try {
        plinesRef.current.push(cs.createPriceLine({
          price: v, color: col, lineWidth: w, lineStyle: s, axisLabelVisible: true, title: t,
        }));
      } catch {}
    };
    if (levels.vwap) add(levels.vwap, 'VWAP', C.vwap, LineStyle.Solid, 1);
    add(entryLevel, 'ENTRY', C.bull, LineStyle.Dashed, 1);
    add(targetLevel, 'TARGET', '#2979ff', LineStyle.Dashed, 1);
    add(stopLevel, 'STOP', C.bear, LineStyle.Dashed, 1);
    add(levels.callWall, 'CW', C.cw, LineStyle.Dotted, 1);
    add(levels.putWall, 'PW', C.pw, LineStyle.Dotted, 1);
    add(levels.gexFlip, 'GEX', C.gex, LineStyle.Dotted, 1);
  }, [levels, price, entryLevel, targetLevel, stopLevel]);

  const spread = tip ? tip.b - tip.br : null;

  return (
    <div
      className="yodha-chart-root"
      style={{
        height: '100%', width: '100%', display: 'flex', flexDirection: 'column',
        background: C.bg, borderRadius: 4, position: 'relative', overflow: 'hidden',
      }}
    >
      {/* CSS to hide TV attribution logo */}
      <style>{`
        .yodha-chart-root a[href*="tradingview"] { display: none !important; }
        .yodha-chart-root div[class*="attribution"] { display: none !important; }
        .yodha-chart-root table td[style*="20px"] img { display: none !important; }
      `}</style>

      {/* Loading */}
      {loading && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(19,23,34,0.9)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 22, height: 22,
              border: '2px solid rgba(38,166,154,0.25)', borderTopColor: C.bull,
              borderRadius: '50%', animation: 'yspin 0.7s linear infinite', margin: '0 auto 10px',
            }} />
            <span style={{ color: C.textDim, fontSize: 11, fontFamily: C.font }}>
              Loading {ticker}…
            </span>
            <style>{`@keyframes yspin { to { transform: rotate(360deg); } }`}</style>
          </div>
        </div>
      )}

      {/* ── MAIN CHART ── */}
      <div style={{ flex: '1 1 0%', minHeight: 0, position: 'relative' }}>
        <div ref={mainBoxRef} style={{ width: '100%', height: '100%' }} />
        {barCount > 0 && (
          <div style={{
            position: 'absolute', bottom: 6, left: 10,
            fontSize: 9, color: 'rgba(209,212,220,0.12)',
            fontFamily: C.font, pointerEvents: 'none', letterSpacing: 0.3,
          }}>
            {barCount} bars · Polygon
          </div>
        )}
      </div>

      {/* ── DIVIDER + INDICATOR LABEL ── */}
      <div style={{
        height: 22, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10,
        paddingLeft: 10, paddingRight: 10,
        background: 'rgba(19,23,34,0.6)',
        borderTop: `1px solid ${C.border}`,
        borderBottom: `1px solid rgba(42,46,57,0.3)`,
      }}>
        <span style={{ fontSize: 10, fontWeight: 600, fontFamily: C.font, color: 'rgba(209,212,220,0.3)' }}>
          Bull / Bear Pressure
        </span>
        <span style={{ fontSize: 9, fontFamily: C.font, color: C.bull, fontWeight: 600 }}>● Bull</span>
        <span style={{ fontSize: 9, fontFamily: C.font, color: C.bear, fontWeight: 600 }}>● Bear</span>

        {/* Live crosshair readout */}
        {tip && (
          <span style={{ fontSize: 10, fontFamily: C.font, marginLeft: 'auto' }}>
            <span style={{ color: C.bull, fontWeight: 700 }}>▲ {tip.b}</span>
            <span style={{ color: 'rgba(209,212,220,0.15)', margin: '0 5px' }}>|</span>
            <span style={{ color: C.bear, fontWeight: 700 }}>▼ {tip.br}</span>
            {spread != null && (
              <>
                <span style={{ color: 'rgba(209,212,220,0.15)', margin: '0 5px' }}>|</span>
                <span style={{ color: spread >= 0 ? C.bull : C.bear, fontWeight: 700 }}>
                  Δ{spread >= 0 ? '+' : ''}{spread}
                </span>
              </>
            )}
          </span>
        )}
      </div>

      {/* ── INDICATOR CHART ── */}
      <div style={{ height: 140, flexShrink: 0 }}>
        <div ref={indBoxRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}
