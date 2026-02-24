'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';

/* ════════════════════════════════════════════════════════════════
   YODHA CHART — Pressure-colored candlestick chart
   
   Replaces TradingView widget with custom Lightweight Charts.
   Secret sauce: candle colors driven by scoring algo + ML.
   Color is computed SERVER-SIDE and returned per bar.
   
   Data contract:
     /api/candles/[ticker]?tf=5m → { bars: [{ t, o, h, l, c, v, vw, bp, brp, color }] }
     bp = bull pressure (0-100), brp = bear pressure (0-100)
     color = hex color from server scoring algo
   ════════════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────

interface Bar {
  t: number;       // UTC timestamp (ms from Polygon)
  o: number;       // open
  h: number;       // high
  l: number;       // low
  c: number;       // close
  v: number;       // volume
  vw: number;      // VWAP
  bp?: number;     // bull pressure 0-100 (from scoring algo)
  brp?: number;    // bear pressure 0-100 (from scoring algo)
  color?: string;  // hex candle color (server-computed)
}

interface LevelDef {
  price: number;
  label: string;
  color: string;
  style: number;   // LineStyle enum value
  width?: number;
  group: string;
}

interface YodhaChartProps {
  ticker: string;
  timeframe: string;
  price: number;
  changePercent: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
    maxPain?: number | null;
    vwap?: number | null;
  };
  // Optional: Camarilla inputs (prev day H/L/C)
  prevDayHLC?: { h: number; l: number; c: number };
}

// ── Pressure → Color (client fallback if server doesn't provide color) ──

const PRESSURE_COLORS = {
  strongBull: '#26a69a',
  bull:       '#1b8a7a',
  crossover:  '#ff9800',
  bear:       '#c94442',
  strongBear: '#ef5350',
};

function pressureToColor(bp: number, brp: number): string {
  const spread = bp - brp;
  if (spread > 25)  return PRESSURE_COLORS.strongBull;
  if (spread > 8)   return PRESSURE_COLORS.bull;
  if (spread > -8)  return PRESSURE_COLORS.crossover;
  if (spread > -25) return PRESSURE_COLORS.bear;
  return PRESSURE_COLORS.strongBear;
}

// ── Timezone helpers ──

function fmtET(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}

function fmtDateET(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', timeZone: 'America/New_York',
  });
}

// ── Constants ──

const TF_MAP: Record<string, { apiTf: string; label: string; barMins: number }> = {
  '1m':  { apiTf: '1m',  label: '1m',  barMins: 1 },
  '5m':  { apiTf: '5m',  label: '5m',  barMins: 5 },
  '15m': { apiTf: '15m', label: '15m', barMins: 15 },
  '30m': { apiTf: '30m', label: '30m', barMins: 30 },
  '1h':  { apiTf: '1h',  label: '1H',  barMins: 60 },
  '1d':  { apiTf: '1d',  label: '1D',  barMins: 1440 },
};

const FONT = "'JetBrains Mono', 'SF Mono', monospace";

// ── Component ──────────────────────────────────────────

function YodhaChartInner({
  ticker, timeframe, price, changePercent, marketSession, levels, prevDayHLC,
}: YodhaChartProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const activeLevelsRef = useRef<Record<string, any>>({});
  const pressureMapRef = useRef<Record<number, { bp: number; brp: number }>>({});
  const lcRef = useRef<any>(null); // lightweight-charts module

  const [bars, setBars] = useState<Bar[]>([]);
  const [activeTF, setActiveTF] = useState(timeframe || '5m');
  const [groupVis, setGroupVis] = useState({ vwap: true, walls: true, cam: true });
  const [loading, setLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Compute Camarilla levels from prev day HLC ──
  const camLevels = prevDayHLC ? (() => {
    const R = prevDayHLC.h - prevDayHLC.l;
    return {
      r4: +(prevDayHLC.c + R * 1.1 / 2).toFixed(2),
      r3: +(prevDayHLC.c + R * 1.1 / 4).toFixed(2),
      s3: +(prevDayHLC.c - R * 1.1 / 4).toFixed(2),
      s4: +(prevDayHLC.c - R * 1.1 / 2).toFixed(2),
    };
  })() : null;

  // ── Fetch candle data ──
  const fetchCandles = useCallback(async (tf: string) => {
    const config = TF_MAP[tf] || TF_MAP['5m'];
    try {
      const res = await fetch(`/api/candles/${ticker}?tf=${config.apiTf}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.bars?.length > 0) {
        setBars(data.bars);
      }
    } catch (e) {
      console.error('[YodhaChart] fetch error:', e);
    }
  }, [ticker]);

  // ── Initialize Lightweight Charts (dynamic import) ──
  useEffect(() => {
    if (!mainRef.current) return;

    let destroyed = false;

    (async () => {
      // Dynamic import — lightweight-charts is a client-only library
      const LC = await import('lightweight-charts');
      if (destroyed) return;
      lcRef.current = LC;

      const { createChart, ColorType, CrosshairMode, LineStyle } = LC;
      const el = mainRef.current!;

      const chart = createChart(el, {
        width: el.clientWidth,
        height: el.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: '#131722' },
          textColor: 'rgba(209,212,220,0.65)',
          fontFamily: FONT,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: 'rgba(42,46,57,0.3)' },
          horzLines: { color: 'rgba(42,46,57,0.3)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(120,123,134,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: 'rgba(42,46,57,0.95)' },
          horzLine: { color: 'rgba(120,123,134,0.4)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: 'rgba(42,46,57,0.95)' },
        },
        rightPriceScale: {
          borderColor: 'rgba(42,46,57,0.6)',
          scaleMargins: { top: 0.06, bottom: 0.06 },
        },
        timeScale: {
          borderColor: 'rgba(42,46,57,0.6)',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 5,
          barSpacing: 8,
          minBarSpacing: 2,
          visible: true,
          tickMarkFormatter: (time: number, type: number) => {
            // type: 0=Year, 1=Month, 2=Day, 3=Time
            const ms = (time as number) * 1000;
            return type <= 2 ? fmtDateET(ms) : fmtET(ms);
          },
        },
        localization: {
          timeFormatter: (t: number) => fmtET((t as number) * 1000) + ' ET',
        },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });

      chartRef.current = chart;

      // Candle series (colors overridden per-bar)
      const cs = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
      candleSeriesRef.current = cs;

      // VWAP line
      const vwap = chart.addLineSeries({
        color: '#2962ff', lineWidth: 1, lineStyle: LineStyle.Solid,
        crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
      });
      vwapSeriesRef.current = vwap;

      // Crosshair → show pressure in overlay
      chart.subscribeCrosshairMove((param: any) => {
        const el = document.getElementById('yodha-pressure-readout');
        if (!el) return;
        if (!param.time) { el.innerHTML = ''; return; }

        const p = pressureMapRef.current[param.time as number];
        if (p) {
          const sp = Math.round(p.bp - p.brp);
          el.innerHTML =
            `<span style="color:#26a69a;font-weight:700">▲ ${Math.round(p.bp)}</span>` +
            `<span style="color:rgba(209,212,220,0.15);margin:0 5px">|</span>` +
            `<span style="color:#ef5350;font-weight:700">▼ ${Math.round(p.brp)}</span>` +
            `<span style="color:rgba(209,212,220,0.15);margin:0 5px">|</span>` +
            `<span style="color:${sp >= 0 ? '#26a69a' : '#ef5350'};font-weight:700">Δ${sp >= 0 ? '+' : ''}${sp}</span>`;
        } else {
          el.innerHTML = '';
        }
      });

      // Resize
      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
      });
      ro.observe(el);

      // Initial fetch
      setLoading(true);
      await fetchCandles(activeTF);
      setLoading(false);
    })();

    return () => {
      destroyed = true;
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }
    };
  }, [ticker]); // Only reinit chart on ticker change

  // ── Update chart data when bars change ──
  useEffect(() => {
    if (!bars.length || !candleSeriesRef.current || !lcRef.current) return;

    const cs = candleSeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;

    // Build pressure map + candle data with colors
    // API returns t in seconds; if bar.t looks like ms (>= 1e10), convert to seconds
    const toTime = (t: number) => (t >= 1e10 ? Math.floor(t / 1000) : t) as number;
    const pressureMap: Record<number, { bp: number; brp: number }> = {};
    const candleByTime = new Map<number, any>();
    const vwapByTime = new Map<number, number>();

    for (const bar of bars) {
      const timeSec = toTime(bar.t);
      const bp = bar.bp ?? 0;
      const brp = bar.brp ?? 0;
      const col = bar.color || pressureToColor(bp, brp);
      candleByTime.set(timeSec, {
        time: timeSec,
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        color: col,
        borderColor: col,
        wickColor: col,
      });
      vwapByTime.set(timeSec, bar.vw);
      pressureMap[timeSec] = { bp, brp };
    }

    // Strictly ascending time (dedupe by time, keep last bar per time)
    const candleData = Array.from(candleByTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, d]) => d);
    const vwapData = Array.from(vwapByTime.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([time, value]) => ({ time, value }));

    pressureMapRef.current = pressureMap;
    cs.setData(candleData);
    if (vwapSeries) vwapSeries.setData(vwapData);

    // Draw levels
    drawLevels();

    // Fit content
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, [bars, groupVis, levels, camLevels]);

  // ── Draw levels on candle series ──
  const drawLevels = useCallback(() => {
    const cs = candleSeriesRef.current;
    const LC = lcRef.current;
    if (!cs || !LC) return;

    const { LineStyle } = LC;

    // Remove existing
    Object.values(activeLevelsRef.current).forEach((pl) => {
      try { cs.removePriceLine(pl); } catch {}
    });
    activeLevelsRef.current = {};

    const allLevels: Record<string, LevelDef> = {};

    // VWAP (from latest bar's vw or levels prop)
    const lastBar = bars[bars.length - 1];
    const vwapPrice = levels.vwap || lastBar?.vw;
    if (vwapPrice && groupVis.vwap) {
      allLevels.vwap = { price: vwapPrice, label: 'VWAP', color: '#2962ff', style: LineStyle.Solid, group: 'vwap' };
    }

    // Call Wall / Put Wall
    if (groupVis.walls) {
      if (levels.callWall) allLevels.cw = { price: levels.callWall, label: 'CW', color: '#ff9800', style: LineStyle.Dashed, group: 'walls' };
      if (levels.putWall) allLevels.pw = { price: levels.putWall, label: 'PW', color: '#e040fb', style: LineStyle.Dashed, group: 'walls' };
    }

    // Camarilla
    if (groupVis.cam && camLevels) {
      allLevels.r4 = { price: camLevels.r4, label: 'R4', color: '#00bcd4', style: LineStyle.Dotted, group: 'cam' };
      allLevels.r3 = { price: camLevels.r3, label: 'R3', color: '#00bcd4', style: LineStyle.Dashed, group: 'cam' };
      allLevels.s3 = { price: camLevels.s3, label: 'S3', color: '#ff7043', style: LineStyle.Dashed, group: 'cam' };
      allLevels.s4 = { price: camLevels.s4, label: 'S4', color: '#ff7043', style: LineStyle.Dotted, group: 'cam' };
    }

    // Create price lines
    Object.entries(allLevels).forEach(([key, lv]) => {
      activeLevelsRef.current[key] = cs.createPriceLine({
        price: lv.price,
        color: lv.color,
        lineWidth: lv.width || 1,
        lineStyle: lv.style,
        axisLabelVisible: true,
        title: `${lv.label} ${lv.price.toFixed(2)}`,
      });
    });
  }, [bars, groupVis, levels, camLevels]);

  // ── Timeframe change ──
  const handleTFChange = useCallback(async (tf: string) => {
    setActiveTF(tf);
    setLoading(true);
    await fetchCandles(tf);
    setLoading(false);
  }, [fetchCandles]);

  // ── Polling ──
  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);

    // Poll rate based on TF and market session
    const config = TF_MAP[activeTF] || TF_MAP['5m'];
    let interval: number;
    if (marketSession === 'open') {
      interval = config.barMins <= 5 ? 10_000 : 30_000;
    } else if (marketSession === 'pre-market' || marketSession === 'after-hours') {
      interval = 30_000;
    } else {
      interval = 120_000;
    }

    pollRef.current = setInterval(() => fetchCandles(activeTF), interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTF, marketSession, fetchCandles]);

  // ── Level chip toggle ──
  const toggleGroup = useCallback((group: string) => {
    setGroupVis(prev => ({ ...prev, [group]: !prev[group as keyof typeof prev] }));
  }, []);

  // ── Render ──
  const isUp = changePercent >= 0;
  const priceColor = isUp ? '#26a69a' : '#ef5350';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#131722', borderRadius: 6, overflow: 'hidden', fontFamily: FONT }}>

      {/* ── Toolbar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', height: 38, padding: '0 12px',
        background: '#131722', borderBottom: '1px solid rgba(42,46,57,0.6)', gap: 10, flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>{ticker}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: priceColor }}>${price.toFixed(2)}</span>
        <span style={{
          fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 3,
          background: isUp ? 'rgba(38,166,154,0.14)' : 'rgba(239,83,80,0.14)',
          color: priceColor,
        }}>
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>

        <div style={{ width: 1, height: 18, background: 'rgba(42,46,57,0.6)' }} />

        {/* TF Buttons */}
        <div style={{ display: 'flex', gap: 1 }}>
          {Object.entries(TF_MAP).map(([key, cfg]) => (
            <button
              key={key}
              onClick={() => handleTFChange(key)}
              style={{
                background: activeTF === key ? 'rgba(41,98,255,0.22)' : 'transparent',
                color: activeTF === key ? '#fff' : 'rgba(209,212,220,0.4)',
                border: 'none', fontFamily: 'inherit', fontSize: '10.5px', fontWeight: 500,
                padding: '4px 9px', borderRadius: 3, cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 18, background: 'rgba(42,46,57,0.6)' }} />

        {/* Level Chips */}
        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
          {[
            { group: 'vwap', label: 'VWAP', color: '#2962ff' },
            { group: 'walls', label: 'CW / PW', color: '#ff9800' },
            ...(camLevels ? [{ group: 'cam', label: 'Camarilla', color: '#00bcd4' }] : []),
          ].map(chip => {
            const vis = groupVis[chip.group as keyof typeof groupVis];
            return (
              <div
                key={chip.group}
                onClick={() => toggleGroup(chip.group)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 3,
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, cursor: 'pointer',
                  userSelect: 'none', transition: 'opacity 0.15s',
                  color: chip.color,
                  borderColor: chip.color + '40',
                  borderWidth: 1, borderStyle: 'solid',
                  opacity: vis ? 1 : 0.2,
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: chip.color }} />
                {chip.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Chart Area ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Pressure Legend + Live Readout (overlay) */}
        <div style={{
          position: 'absolute', top: 6, left: 10, zIndex: 5,
          display: 'flex', alignItems: 'center', gap: 10,
          pointerEvents: 'none', fontSize: 9, fontWeight: 600, fontFamily: FONT,
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(19,23,34,0.75)', padding: '3px 8px', borderRadius: 4,
            border: '1px solid rgba(42,46,57,0.3)',
          }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#26a69a' }} />
            <span style={{ color: 'rgba(209,212,220,0.45)' }}>Bullish</span>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ff9800' }} />
            <span style={{ color: 'rgba(209,212,220,0.45)' }}>Crossover</span>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: '#ef5350' }} />
            <span style={{ color: 'rgba(209,212,220,0.45)' }}>Bearish</span>
          </div>
          <div
            id="yodha-pressure-readout"
            style={{
              background: 'rgba(19,23,34,0.75)', padding: '3px 8px', borderRadius: 4,
              border: '1px solid rgba(42,46,57,0.3)', fontSize: 10,
            }}
          />
        </div>

        {/* Loading overlay */}
        {loading && (
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(19,23,34,0.7)',
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 24, height: 24,
                border: '2px solid rgba(38,166,154,0.3)', borderTopColor: '#26a69a',
                borderRadius: '50%', animation: 'yodha-spin 0.8s linear infinite',
                margin: '0 auto 8px',
              }} />
              <span style={{ color: 'rgba(209,212,220,0.4)', fontSize: 11, fontFamily: FONT }}>
                Loading {ticker}...
              </span>
              <style>{`@keyframes yodha-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        )}

        {/* The chart mounts here */}
        <div ref={mainRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

export const YodhaChart = memo(YodhaChartInner);

/* ════════════════════════════════════════════════════════════════
   SERVER-SIDE: Add to /api/candles/[ticker]/route.ts
   
   After computing VWAP for each bar, also compute pressure + color:
   
   ```ts
   import { computeBarPressure } from '@/lib/bias-score';
   
   const processedBars = bars.map((bar, i) => {
     const { bp, brp } = computeBarPressure(bar, prevBars, flowData, mlScore);
     const spread = bp - brp;
     const color = spread > 25  ? '#26a69a'   // strong bull
                 : spread > 8   ? '#1b8a7a'   // bull
                 : spread > -8  ? '#ff9800'    // crossover
                 : spread > -25 ? '#c94442'    // bear
                 : '#ef5350';                  // strong bear
     return {
       t: bar.t, o: bar.o, h: bar.h, l: bar.l, c: bar.c,
       v: bar.v, vw: computedVwap,
       bp, brp, color,
     };
   });
   ```
   
   This keeps your scoring algo + ML model server-side.
   The client just renders whatever color the API sends.
   ════════════════════════════════════════════════════════════════ */
