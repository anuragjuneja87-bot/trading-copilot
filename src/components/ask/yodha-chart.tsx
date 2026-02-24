'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';

/* ════════════════════════════════════════════════════════════════
   YODHA CHART — Pressure-colored candlestick chart
   
   v2: Added volume sub-pane, session markers, prev day levels,
       today O/H/L tracking, bigger AI Pressure Engine branding.
   
   Data contract:
     /api/candles/[ticker]?tf=5m → { bars: [{ t, o, h, l, c, v, vw, bp, brp, color }] }
   ════════════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────

interface Bar {
  t: number;       // UTC timestamp (seconds from API)
  o: number;       // open
  h: number;       // high
  l: number;       // low
  c: number;       // close
  v: number;       // volume
  vw: number;      // VWAP
  bp?: number;     // bull pressure 0-100
  brp?: number;    // bear pressure 0-100
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
  prevDayHLC?: { h: number; l: number; c: number };
  todayOHL?: { o: number; h: number; l: number } | null;
}

// ── Pressure → Color (client fallback) ──

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

/** Get ET hours/minutes from a UTC-seconds timestamp */
function getETTime(utcSec: number): { hour: number; minute: number; dayStr: string } {
  const d = new Date(utcSec * 1000);
  const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  const dayStr = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return { hour: et.getHours(), minute: et.getMinutes(), dayStr };
}

function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
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
  ticker, timeframe, price, changePercent, marketSession, levels, prevDayHLC, todayOHL,
}: YodhaChartProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const activeLevelsRef = useRef<Record<string, any>>({});
  const pressureMapRef = useRef<Record<number, { bp: number; brp: number; v: number }>>({});
  const lcRef = useRef<any>(null);

  const [bars, setBars] = useState<Bar[]>([]);
  const [activeTF, setActiveTF] = useState(timeframe || '5m');
  const [groupVis, setGroupVis] = useState({ vwap: true, walls: true, cam: true, prevDay: true });
  const [loading, setLoading] = useState(true);

  // Track today's session stats from bars
  const [sessionStats, setSessionStats] = useState<{ totalVol: number; barCount: number } | null>(null);

  // ── Sync internal TF when parent timeframe prop changes ──
  useEffect(() => {
    const mapped = timeframe?.toLowerCase().replace(/\s/g, '') || '5m';
    const valid = TF_MAP[mapped] ? mapped : '5m';
    if (valid !== activeTF) {
      setActiveTF(valid);
      setLoading(true);
      fetchCandles(valid).then(() => setLoading(false));
    }
  }, [timeframe]);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Compute Camarilla levels ──
  const camLevels = prevDayHLC ? (() => {
    const R = prevDayHLC.h - prevDayHLC.l;
    return {
      r4: +(prevDayHLC.c + R * 1.1 / 2).toFixed(2),
      r3: +(prevDayHLC.c + R * 1.1 / 4).toFixed(2),
      s3: +(prevDayHLC.c - R * 1.1 / 4).toFixed(2),
      s4: +(prevDayHLC.c - R * 1.1 / 2).toFixed(2),
    };
  })() : (levels as any)?.r3 ? {
    r4: (levels as any).r4, r3: (levels as any).r3,
    s3: (levels as any).s3, s4: (levels as any).s4,
  } : null;

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

  // ── Initialize Lightweight Charts ──
  useEffect(() => {
    if (!mainRef.current) return;

    let destroyed = false;

    (async () => {
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
          scaleMargins: { top: 0.04, bottom: 0.18 }, // Leave room for volume at bottom
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

      // Candle series
      const cs = chart.addCandlestickSeries({
        upColor: '#26a69a', downColor: '#ef5350',
        borderUpColor: '#26a69a', borderDownColor: '#ef5350',
        wickUpColor: '#26a69a', wickDownColor: '#ef5350',
      });
      candleSeriesRef.current = cs;

      // ★ VOLUME HISTOGRAM — separate price scale at bottom ★
      const volSeries = chart.addHistogramSeries({
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      });
      volSeries.priceScale().applyOptions({
        scaleMargins: { top: 0.85, bottom: 0 }, // Volume in bottom 15%
      });
      volumeSeriesRef.current = volSeries;

      // VWAP line
      const vwap = chart.addLineSeries({
        color: '#2962ff', lineWidth: 1, lineStyle: LineStyle.Solid,
        crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
      });
      vwapSeriesRef.current = vwap;

      // Crosshair → show pressure + volume in overlay
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
            `<span style="color:${sp >= 0 ? '#26a69a' : '#ef5350'};font-weight:700">Δ${sp >= 0 ? '+' : ''}${sp}</span>` +
            `<span style="color:rgba(209,212,220,0.15);margin:0 5px">|</span>` +
            `<span style="color:rgba(209,212,220,0.45);font-weight:600">Vol ${formatVolume(p.v || 0)}</span>`;
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
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      vwapSeriesRef.current = null;
      if (chartRef.current) {
        try { chartRef.current.remove(); } catch {}
        chartRef.current = null;
      }
    };
  }, [ticker]);

  // ── Update chart data when bars change ──
  useEffect(() => {
    if (!bars.length || !chartRef.current || !candleSeriesRef.current || !lcRef.current) return;

    const cs = candleSeriesRef.current;
    const vwapSeries = vwapSeriesRef.current;
    const volSeries = volumeSeriesRef.current;

    const toTime = (t: number) => (t >= 1e10 ? Math.floor(t / 1000) : t) as number;
    const pressureMap: Record<number, { bp: number; brp: number; v: number }> = {};
    const candleByTime = new Map<number, any>();
    const vwapByTime = new Map<number, number>();
    const volumeByTime = new Map<number, any>();

    // Track today's date to detect session boundaries
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    let totalVol = 0;
    let barCount = 0;

    for (const bar of bars) {
      const timeSec = toTime(bar.t);
      const bp = bar.bp ?? 0;
      const brp = bar.brp ?? 0;
      const col = bar.color || pressureToColor(bp, brp);
      
      candleByTime.set(timeSec, {
        time: timeSec,
        open: bar.o, high: bar.h, low: bar.l, close: bar.c,
        color: col, borderColor: col, wickColor: col,
      });
      
      vwapByTime.set(timeSec, bar.vw);
      
      // Volume colored by candle direction
      const isUp = bar.c >= bar.o;
      volumeByTime.set(timeSec, {
        time: timeSec,
        value: bar.v,
        color: isUp ? 'rgba(38,166,154,0.35)' : 'rgba(239,83,80,0.35)',
      });
      
      pressureMap[timeSec] = { bp, brp, v: bar.v };
      
      // Session stats
      const { dayStr } = getETTime(timeSec);
      if (dayStr === todayStr) {
        totalVol += bar.v;
        barCount++;
      }
    }

    setSessionStats(barCount > 0 ? { totalVol, barCount } : null);

    // Strictly ascending time
    const candleData = Array.from(candleByTime.entries()).sort((a, b) => a[0] - b[0]).map(([, d]) => d);
    const vwapData = Array.from(vwapByTime.entries()).sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
    const volumeData = Array.from(volumeByTime.entries()).sort((a, b) => a[0] - b[0]).map(([, d]) => d);

    pressureMapRef.current = pressureMap;
    try {
      cs.setData(candleData);
      if (vwapSeries) vwapSeries.setData(vwapData);
      if (volSeries) volSeries.setData(volumeData);
      drawLevels();
      
      // ★ Add session markers (vertical lines at 9:30 AM ET) ★
      addSessionMarkers(candleData);
      
      if (chartRef.current) chartRef.current.timeScale().fitContent();
    } catch (e) {
      if (String(e).indexOf('disposed') === -1) console.error('[YodhaChart] setData:', e);
    }
  }, [bars, groupVis, levels, camLevels, prevDayHLC]);

  // ── Add session open markers ──
  const addSessionMarkers = useCallback((candleData: any[]) => {
    const cs = candleSeriesRef.current;
    if (!cs || !candleData.length) return;

    const markers: any[] = [];
    let lastDay = '';

    for (const candle of candleData) {
      const { hour, minute, dayStr } = getETTime(candle.time);
      // Mark first bar of each trading day (9:30 AM)
      if (dayStr !== lastDay && hour === 9 && minute >= 30 && minute < 35) {
        markers.push({
          time: candle.time,
          position: 'aboveBar',
          color: 'rgba(255,255,255,0.3)',
          shape: 'arrowDown',
          text: `OPEN ${dayStr.slice(5)}`, // "02-24"
          size: 0.5,
        });
        lastDay = dayStr;
      }
    }

    if (markers.length > 0) {
      try { cs.setMarkers(markers); } catch {}
    }
  }, []);

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

    // VWAP
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

    // ★ PREVIOUS DAY LEVELS — prev close, prev high, prev low ★
    if (groupVis.prevDay && prevDayHLC) {
      allLevels.prevClose = { price: prevDayHLC.c, label: 'PC', color: '#ffeb3b', style: LineStyle.Dashed, width: 1, group: 'prevDay' };
      allLevels.prevHigh = { price: prevDayHLC.h, label: 'PH', color: 'rgba(255,235,59,0.45)', style: LineStyle.Dotted, width: 1, group: 'prevDay' };
      allLevels.prevLow = { price: prevDayHLC.l, label: 'PL', color: 'rgba(255,235,59,0.45)', style: LineStyle.Dotted, width: 1, group: 'prevDay' };
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
  }, [bars, groupVis, levels, camLevels, prevDayHLC]);

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

  // ── Compute last bar pressure for legend ──
  const lastBarPressure = bars.length > 0 ? (() => {
    const last = bars[bars.length - 1];
    const bp = last.bp ?? 0;
    const brp = last.brp ?? 0;
    return { bp: Math.round(bp), brp: Math.round(brp), delta: Math.round(bp - brp) };
  })() : null;

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

        {/* Session volume */}
        {sessionStats && (
          <>
            <div style={{ width: 1, height: 18, background: 'rgba(42,46,57,0.6)' }} />
            <span style={{ fontSize: 9, color: 'rgba(209,212,220,0.4)', letterSpacing: 0.3 }}>
              Vol {formatVolume(sessionStats.totalVol)}
            </span>
          </>
        )}

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
            ...(prevDayHLC ? [{ group: 'prevDay', label: 'Prev Day', color: '#ffeb3b' }] : []),
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
        {/* ★ AI PRESSURE ENGINE — Bigger, more prominent branding ★ */}
        <div style={{
          position: 'absolute', top: 6, left: 10, zIndex: 5,
          display: 'flex', flexDirection: 'column', gap: 4,
          pointerEvents: 'none', fontFamily: FONT,
        }}>
          {/* Main label row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'rgba(19,23,34,0.9)', padding: '5px 12px', borderRadius: 5,
            border: '1px solid rgba(42,46,57,0.5)',
          }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#26a69a', animation: 'yodha-pulse 2s ease-in-out infinite',
              boxShadow: '0 0 6px rgba(38,166,154,0.5)',
            }} />
            <span style={{ color: '#26a69a', fontSize: 10, fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
              AI Pressure Engine
            </span>
            <div style={{ width: 1, height: 12, background: 'rgba(42,46,57,0.5)' }} />
            {/* Color key */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {[
                { color: '#26a69a', label: 'Bull' },
                { color: '#ff9800', label: 'Crossover' },
                { color: '#ef5350', label: 'Bear' },
              ].map(k => (
                <div key={k.label} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: k.color }} />
                  <span style={{ color: 'rgba(209,212,220,0.45)', fontSize: 9 }}>{k.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Live pressure readout */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              id="yodha-pressure-readout"
              style={{
                background: 'rgba(19,23,34,0.9)', padding: '4px 10px', borderRadius: 4,
                border: '1px solid rgba(42,46,57,0.4)', fontSize: 10, minHeight: 20,
              }}
            />
            {/* Static last-bar readout when crosshair not active */}
            {lastBarPressure && (
              <div style={{
                background: 'rgba(19,23,34,0.7)', padding: '3px 8px', borderRadius: 4,
                border: '1px solid rgba(42,46,57,0.3)', fontSize: 9,
                color: 'rgba(209,212,220,0.3)',
              }}>
                Last: <span style={{ color: lastBarPressure.delta >= 0 ? '#26a69a' : '#ef5350', fontWeight: 600 }}>
                  Δ{lastBarPressure.delta >= 0 ? '+' : ''}{lastBarPressure.delta}
                </span>
              </div>
            )}
          </div>
        </div>

        <style>{`@keyframes yodha-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.4; } }`}</style>

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
