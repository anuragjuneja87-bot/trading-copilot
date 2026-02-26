'use client';

import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';

/* ════════════════════════════════════════════════════════════════
   YODHA CHART v2.1 — Session separator + background refinement
   
   v2.1 changes:
   - Vertical dashed line at 9:30 AM ET (pre-market / RTH separator)
   - Removed "OPEN" text marker (cleaner chart)
   - Background: #0b0f19 (deep navy-black, richer depth)
   - Toolbar: #080c16 (matches new bg)
   - Canvas overlay for session lines (synced with scroll/zoom)
   ════════════════════════════════════════════════════════════════ */

interface Bar {
  t: number; o: number; h: number; l: number; c: number;
  v: number; vw: number; bp?: number; brp?: number;
  s?: 'pre' | 'rth' | 'post';
}

interface YodhaChartProps {
  ticker: string; timeframe: string; price: number; changePercent: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  levels: { callWall: number | null; putWall: number | null; gexFlip: number | null; maxPain?: number | null; vwap?: number | null; };
  prevDayHLC?: { h: number; l: number; c: number };
  todayOHL?: any;
}

// ── COLOR SYSTEM — v2.1 ──
const CANDLE_UP = '#00dc82';
const CANDLE_DOWN = '#ff4757';
const CANDLE_UP_EXT = 'rgba(0,220,130,0.35)';
const CANDLE_DOWN_EXT = 'rgba(255,71,87,0.35)';
const CANDLE_UP_WICK_EXT = 'rgba(0,220,130,0.5)';
const CANDLE_DOWN_WICK_EXT = 'rgba(255,71,87,0.5)';

const BG_CHART = '#0b0f19';       // ★ Deep navy-black (was #0d1117)
const BG_TOOLBAR = '#080c16';     // ★ Darker toolbar to match
const BORDER = 'rgba(255,255,255,0.06)';
const GRID_COLOR = 'rgba(255,255,255,0.025)';
const VWAP_COLOR = '#4da6ff';
const CW_COLOR = '#f97316';    // Call wall — orange
const PW_COLOR = '#c084fc';    // Put wall — purple
const CAM_BULL = '#22d3ee';    // R3, R4 — cyan
const CAM_BEAR = '#fb923c';    // S3, S4 — orange
const PREV_DAY = 'rgba(255,255,255,0.25)';  // Muted white
const SESSION_LINE_COLOR = 'rgba(255,255,255,0.12)';  // ★ Vertical session separator

function fmtET(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
}
function fmtDateET(utcMs: number): string {
  return new Date(utcMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}
function getETTime(utcSec: number) {
  const d = new Date(utcSec * 1000);
  const etStr = d.toLocaleString('en-US', { timeZone: 'America/New_York' });
  const et = new Date(etStr);
  return { hour: et.getHours(), minute: et.getMinutes(), dayStr: d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) };
}
function formatVolume(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toString();
}

const TF_MAP: Record<string, { apiTf: string; label: string; barMins: number }> = {
  '1m': { apiTf: '1m', label: '1m', barMins: 1 }, '5m': { apiTf: '5m', label: '5m', barMins: 5 },
  '15m': { apiTf: '15m', label: '15m', barMins: 15 }, '30m': { apiTf: '30m', label: '30m', barMins: 30 },
  '1h': { apiTf: '1h', label: '1H', barMins: 60 }, '1d': { apiTf: '1d', label: '1D', barMins: 1440 },
};
const FONT = "'JetBrains Mono', 'SF Mono', monospace";
const FONT_BRAND = "'Oxanium', 'JetBrains Mono', monospace";

interface LevelDef { price: number; label: string; color: string; style: number; width?: number; group: string; }

function YodhaChartInner({ ticker, timeframe, price, changePercent, marketSession, levels, prevDayHLC }: YodhaChartProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const activeLevelsRef = useRef<Record<string, any>>({});
  const pressureMapRef = useRef<Record<number, { bp: number; brp: number; v: number; s?: string }>>({});
  const lcRef = useRef<any>(null);
  const wheelHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
  const isInitialLoadRef = useRef(true);
  const isAtRealTimeRef = useRef(true);
  const barCountRef = useRef(0);
  const sessionRangesRef = useRef<{ preStart: number; rthOpen: number; postStart: number | null }[]>([]);

  const [bars, setBars] = useState<Bar[]>([]);
  const [activeTF, setActiveTF] = useState(timeframe || '5m');
  const [groupVis, setGroupVis] = useState({ vwap: true, walls: true, cam: true, prevDay: true });
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState<{ totalVol: number; barCount: number } | null>(null);
  const [showSnapBtn, setShowSnapBtn] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const camLevels = useMemo(() => {
    if (prevDayHLC) {
      const R = prevDayHLC.h - prevDayHLC.l;
      return { r4: +(prevDayHLC.c + R * 1.1 / 2).toFixed(2), r3: +(prevDayHLC.c + R * 1.1 / 4).toFixed(2), s3: +(prevDayHLC.c - R * 1.1 / 4).toFixed(2), s4: +(prevDayHLC.c - R * 1.1 / 2).toFixed(2) };
    }
    if ((levels as any)?.r3 != null) return { r4: (levels as any).r4, r3: (levels as any).r3, s3: (levels as any).s3, s4: (levels as any).s4 };
    return null;
  }, [prevDayHLC, (levels as any)?.r3, (levels as any)?.r4, (levels as any)?.s3, (levels as any)?.s4]);

  useEffect(() => {
    const mapped = timeframe?.toLowerCase().replace(/\s/g, '') || '5m';
    const valid = TF_MAP[mapped] ? mapped : '5m';
    if (valid !== activeTF) { setActiveTF(valid); isInitialLoadRef.current = true; isAtRealTimeRef.current = true; setShowSnapBtn(false); setLoading(true); fetchCandles(valid).then(() => setLoading(false)); }
  }, [timeframe]);

  const fetchCandles = useCallback(async (tf: string) => {
    const config = TF_MAP[tf] || TF_MAP['5m'];
    try {
      const res = await fetch(`/api/candles/${ticker}?tf=${config.apiTf}&_t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.bars?.length > 0) setBars(data.bars);
    } catch (e) { console.error('[YodhaChart] fetch error:', e); }
  }, [ticker]);

  // ── Draw session separator lines + background tints on overlay canvas ──
  const drawSessionLines = useCallback(() => {
    const chart = chartRef.current;
    const canvas = overlayCanvasRef.current;
    if (!chart || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Match canvas size to actual pixel dimensions
    const rect = canvas.parentElement?.getBoundingClientRect();
    if (!rect) return;
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    ctx.clearRect(0, 0, w, h);

    const timeScale = chart.timeScale();
    const PRE_MARKET_TINT = 'rgba(99,102,241,0.04)';   // ★ Subtle indigo tint for pre-market
    const AFTER_HOURS_TINT = 'rgba(99,102,241,0.04)';  // ★ Same tint for after-hours

    const ranges = sessionRangesRef.current;
    for (let i = 0; i < ranges.length; i++) {
      const range = ranges[i];
      const nextRange = ranges[i + 1] ?? null;
      const openX = timeScale.timeToCoordinate(range.rthOpen as any);
      const preX = timeScale.timeToCoordinate(range.preStart as any);

      // ★ Paint pre-market background tint
      if (preX !== null && openX !== null && openX > preX) {
        ctx.fillStyle = PRE_MARKET_TINT;
        ctx.fillRect(preX, 0, openX - preX, h);
      } else if (preX !== null && openX === null) {
        // Open is off-screen right — tint from preStart to right edge
        ctx.fillStyle = PRE_MARKET_TINT;
        ctx.fillRect(preX, 0, w - preX, h);
      } else if (preX === null && openX !== null && openX > 0) {
        // PreStart is off-screen left — tint from left edge to open
        ctx.fillStyle = PRE_MARKET_TINT;
        ctx.fillRect(0, 0, openX, h);
      }

      // ★ Paint after-hours background tint (stop at next day's preStart)
      if (range.postStart !== null) {
        const postX = timeScale.timeToCoordinate(range.postStart as any);
        if (postX !== null && postX < w) {
          let endX = w; // default: right edge
          if (nextRange) {
            const nextPreX = timeScale.timeToCoordinate(nextRange.preStart as any);
            if (nextPreX !== null) endX = nextPreX;
          }
          ctx.fillStyle = AFTER_HOURS_TINT;
          ctx.fillRect(postX, 0, endX - postX, h);
        }
      }

      // ★ Vertical dashed line at market open
      if (openX !== null && openX >= 0 && openX <= w) {
        ctx.strokeStyle = SESSION_LINE_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(Math.round(openX) + 0.5, 0);
        ctx.lineTo(Math.round(openX) + 0.5, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, []);

  // ── Initialize chart ──
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
        width: el.clientWidth, height: el.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: BG_CHART },
          textColor: 'rgba(255,255,255,0.5)',
          fontFamily: FONT,
          fontSize: 11,
        },
        grid: {
          vertLines: { color: GRID_COLOR },
          horzLines: { color: GRID_COLOR },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(255,255,255,0.12)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#161b22' },
          horzLine: { color: 'rgba(255,255,255,0.12)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#161b22' },
        },
        rightPriceScale: {
          borderColor: 'rgba(255,255,255,0.04)',
          scaleMargins: { top: 0.04, bottom: 0.18 },
        },
        timeScale: {
          borderColor: 'rgba(255,255,255,0.04)',
          timeVisible: true, secondsVisible: false,
          rightOffset: 8,
          barSpacing: 9,
          minBarSpacing: 3,
          visible: true,
          tickMarkFormatter: (time: number, type: number) => {
            const ms = (time as number) * 1000;
            return type <= 2 ? fmtDateET(ms) : fmtET(ms);
          },
        },
        localization: { timeFormatter: (t: number) => fmtET((t as number) * 1000) + ' ET' },
        handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { axisPressedMouseMove: true, mouseWheel: false, pinch: true },
      });
      chartRef.current = chart;

      // ★ Ctrl+Scroll to zoom chart, regular scroll passes to page
      const handleWheel = (e: WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault(); // prevent page zoom
          const ts = chart.timeScale();
          const range = ts.getVisibleLogicalRange();
          if (!range) return;
          const zoomFactor = e.deltaY > 0 ? 0.1 : -0.1; // scroll down = zoom out
          const rangeSize = range.to - range.from;
          const newSize = rangeSize * (1 + zoomFactor);
          const center = (range.from + range.to) / 2;
          ts.setVisibleLogicalRange({
            from: center - newSize / 2,
            to: center + newSize / 2,
          });
        }
        // No ctrl/meta → event bubbles to page naturally (chart mouseWheel disabled)
      };
      el.addEventListener('wheel', handleWheel, { passive: false });
      wheelHandlerRef.current = handleWheel;

      const cs = chart.addCandlestickSeries({
        upColor: CANDLE_UP, downColor: CANDLE_DOWN,
        borderUpColor: CANDLE_UP, borderDownColor: CANDLE_DOWN,
        wickUpColor: CANDLE_UP, wickDownColor: CANDLE_DOWN,
      });
      candleSeriesRef.current = cs;

      const volSeries = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'volume' });
      volSeries.priceScale().applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });
      volumeSeriesRef.current = volSeries;

      const vwap = chart.addLineSeries({
        color: VWAP_COLOR,
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        crosshairMarkerVisible: false, priceLineVisible: false, lastValueVisible: false,
      });
      vwapSeriesRef.current = vwap;

      // Crosshair data overlay
      chart.subscribeCrosshairMove((param: any) => {
        const el = document.getElementById('yodha-pressure-readout');
        if (!el) return;
        if (!param.time) { el.innerHTML = ''; return; }
        const p = pressureMapRef.current[param.time as number];
        if (p) {
          const sp = Math.round((p.bp || 0) - (p.brp || 0));
          const sessionLabel = p.s === 'pre' ? '<span style="color:#ffc107;margin-right:8px;font-size:9px;letter-spacing:0.5px">PRE</span>' : p.s === 'post' ? '<span style="color:#ffc107;margin-right:8px;font-size:9px;letter-spacing:0.5px">AH</span>' : '';
          const sep = '<span style="width:1px;height:12px;background:rgba(255,255,255,0.08);display:inline-block;margin:0 8px;vertical-align:middle"></span>';
          el.innerHTML = sessionLabel +
            `<span style="color:#00dc82;font-weight:700">▲ ${Math.round(p.bp || 0)}</span>${sep}` +
            `<span style="color:#ff4757;font-weight:700">▼ ${Math.round(p.brp || 0)}</span>${sep}` +
            `<span style="color:${sp >= 0 ? '#00dc82' : '#ff4757'};font-weight:700">Δ${sp >= 0 ? '+' : ''}${sp}</span>${sep}` +
            `<span style="color:rgba(255,255,255,0.45);font-weight:600">Vol ${formatVolume(p.v || 0)}</span>`;
        } else { el.innerHTML = ''; }
      });

      const ro = new ResizeObserver(() => {
        chart.applyOptions({ width: el.clientWidth, height: el.clientHeight });
        // ★ Redraw session lines on resize
        requestAnimationFrame(drawSessionLines);
      });
      ro.observe(el);

      // ★ Redraw session lines on scroll/zoom
      chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
        if (!range) return;
        try {
          const total = barCountRef.current || 200;
          const atEnd = range.to >= total - 8;
          isAtRealTimeRef.current = atEnd;
          setShowSnapBtn(!atEnd);
        } catch { /* ignore during init */ }
        // Redraw vertical session lines when view changes
        requestAnimationFrame(drawSessionLines);
      });

      isInitialLoadRef.current = true;
      setLoading(true);
      await fetchCandles(activeTF);
      setLoading(false);
    })();
    return () => { destroyed = true; candleSeriesRef.current = null; volumeSeriesRef.current = null; vwapSeriesRef.current = null; if (wheelHandlerRef.current && mainRef.current) { mainRef.current.removeEventListener('wheel', wheelHandlerRef.current); wheelHandlerRef.current = null; } if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; } };
  }, [ticker]);

  // ── Update chart data ──
  useEffect(() => {
    if (!bars.length || !chartRef.current || !candleSeriesRef.current || !lcRef.current) return;
    const cs = candleSeriesRef.current;
    const toTime = (t: number) => (t >= 1e10 ? Math.floor(t / 1000) : t) as number;
    const pressureMap: Record<number, { bp: number; brp: number; v: number; s?: string }> = {};
    const candleByTime = new Map<number, any>(); const vwapByTime = new Map<number, number>(); const volumeByTime = new Map<number, any>();
    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    let totalVol = 0, barCount = 0;

    for (const bar of bars) {
      const timeSec = toTime(bar.t);
      const isUp = bar.c >= bar.o;
      const isExt = bar.s === 'pre' || bar.s === 'post';
      if (isExt) {
        candleByTime.set(timeSec, { time: timeSec, open: bar.o, high: bar.h, low: bar.l, close: bar.c, color: isUp ? CANDLE_UP_EXT : CANDLE_DOWN_EXT, borderColor: isUp ? CANDLE_UP_EXT : CANDLE_DOWN_EXT, wickColor: isUp ? CANDLE_UP_WICK_EXT : CANDLE_DOWN_WICK_EXT });
      } else {
        candleByTime.set(timeSec, { time: timeSec, open: bar.o, high: bar.h, low: bar.l, close: bar.c });
      }
      if (!isExt) vwapByTime.set(timeSec, bar.vw);
      volumeByTime.set(timeSec, { time: timeSec, value: bar.v, color: isExt ? (isUp ? 'rgba(0,220,130,0.18)' : 'rgba(255,71,87,0.18)') : (isUp ? 'rgba(0,220,130,0.45)' : 'rgba(255,71,87,0.45)') });
      pressureMap[timeSec] = { bp: bar.bp ?? 0, brp: bar.brp ?? 0, v: bar.v, s: bar.s };
      const { dayStr } = getETTime(timeSec);
      if (dayStr === todayStr) { totalVol += bar.v; barCount++; }
    }
    setSessionStats(prev => {
      const next = barCount > 0 ? { totalVol, barCount } : null;
      if (prev && next && prev.totalVol === next.totalVol && prev.barCount === next.barCount) return prev;
      if (!prev && !next) return prev;
      return next;
    });
    const candleData = Array.from(candleByTime.entries()).sort((a, b) => a[0] - b[0]).map(([, d]) => d);
    const vwapData = Array.from(vwapByTime.entries()).sort((a, b) => a[0] - b[0]).map(([time, value]) => ({ time, value }));
    const volumeData = Array.from(volumeByTime.entries()).sort((a, b) => a[0] - b[0]).map(([, d]) => d);
    pressureMapRef.current = pressureMap;
    try {
      barCountRef.current = candleData.length;
      cs.setData(candleData);
      if (vwapSeriesRef.current) {
        vwapSeriesRef.current.setData(groupVis.vwap ? vwapData : []);
      }
      if (volumeSeriesRef.current) volumeSeriesRef.current.setData(volumeData);
      drawLevels();
      collectSessionTimes(candleData);
      if (isInitialLoadRef.current && chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
        isInitialLoadRef.current = false;
      } else if (isAtRealTimeRef.current && chartRef.current) {
        chartRef.current.timeScale().scrollToRealTime();
      }
      // Draw session lines after data is set and chart has rendered
      requestAnimationFrame(drawSessionLines);
    } catch (e) { if (String(e).indexOf('disposed') === -1) console.error('[YodhaChart] setData:', e); }
  }, [bars, groupVis, levels, camLevels, prevDayHLC]);

  // ── Collect session boundaries for background tints + vertical lines ──
  const collectSessionTimes = useCallback((candleData: any[]) => {
    // Build per-day session ranges: { preStart, rthOpen, postStart }
    const dayMap = new Map<string, { preStart: number; rthOpen: number; postStart: number | null }>();

    for (const candle of candleData) {
      const { hour, minute, dayStr } = getETTime(candle.time);

      if (!dayMap.has(dayStr)) {
        dayMap.set(dayStr, { preStart: candle.time, rthOpen: 0, postStart: null });
      }

      const entry = dayMap.get(dayStr)!;

      // Track earliest bar as preStart (will be overridden if we find pre-market bars)
      if (candle.time < entry.preStart) {
        entry.preStart = candle.time;
      }

      // 9:30 AM ET = RTH open
      if (hour === 9 && minute >= 30 && minute < 35 && entry.rthOpen === 0) {
        entry.rthOpen = candle.time;
      }

      // 4:00 PM ET = after-hours start
      if (hour === 16 && minute >= 0 && minute < 5 && entry.postStart === null) {
        entry.postStart = candle.time;
      }
    }

    // Filter to days that have a valid rthOpen
    const ranges = Array.from(dayMap.values()).filter(r => r.rthOpen > 0);
    sessionRangesRef.current = ranges;
  }, []);

  // ── Draw levels ──
  const drawLevels = useCallback(() => {
    const cs = candleSeriesRef.current; const LC = lcRef.current;
    if (!cs || !LC) return;
    const { LineStyle } = LC;
    Object.values(activeLevelsRef.current).forEach((pl) => { try { cs.removePriceLine(pl); } catch {} });
    activeLevelsRef.current = {};
    const allLevels: Record<string, LevelDef> = {};
    // VWAP is handled by the dynamic vwapSeriesRef line series (sloping line from bar.vw)
    // No static horizontal price line needed — it conflicts with the real VWAP curve
    // Walls — orange CW, purple PW
    if (groupVis.walls) {
      if (levels.callWall) allLevels.cw = { price: levels.callWall, label: 'CW', color: CW_COLOR, style: LineStyle.Dashed, group: 'walls' };
      if (levels.putWall) allLevels.pw = { price: levels.putWall, label: 'PW', color: PW_COLOR, style: LineStyle.Dashed, group: 'walls' };
    }
    // Cam — cyan for bull, orange for bear
    if (groupVis.cam && camLevels) {
      allLevels.r4 = { price: camLevels.r4, label: 'R4', color: CAM_BULL, style: LineStyle.Dotted, group: 'cam' };
      allLevels.r3 = { price: camLevels.r3, label: 'R3', color: CAM_BULL, style: LineStyle.Dashed, group: 'cam' };
      allLevels.s3 = { price: camLevels.s3, label: 'S3', color: CAM_BEAR, style: LineStyle.Dashed, group: 'cam' };
      allLevels.s4 = { price: camLevels.s4, label: 'S4', color: CAM_BEAR, style: LineStyle.Dotted, group: 'cam' };
    }
    // Prev day — muted white (demoted)
    if (groupVis.prevDay && prevDayHLC) {
      allLevels.prevClose = { price: prevDayHLC.c, label: 'PC', color: PREV_DAY, style: LineStyle.Dashed, width: 1, group: 'prevDay' };
      allLevels.prevHigh = { price: prevDayHLC.h, label: 'PH', color: PREV_DAY, style: LineStyle.Dotted, width: 1, group: 'prevDay' };
      allLevels.prevLow = { price: prevDayHLC.l, label: 'PL', color: PREV_DAY, style: LineStyle.Dotted, width: 1, group: 'prevDay' };
    }
    // ★ Cleaner level labels: just the abbreviation, price shown on axis
    Object.entries(allLevels).forEach(([key, lv]) => {
      activeLevelsRef.current[key] = cs.createPriceLine({
        price: lv.price, color: lv.color,
        lineWidth: lv.width || 1, lineStyle: lv.style,
        axisLabelVisible: true,
        title: lv.label,
      });
    });
  }, [bars, groupVis, levels, camLevels, prevDayHLC]);

  // (TF controlled by page-level selector, chart just receives prop)

  useEffect(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    const config = TF_MAP[activeTF] || TF_MAP['5m'];
    let interval: number;
    if (marketSession === 'open') interval = config.barMins <= 5 ? 10_000 : 30_000;
    else if (marketSession === 'pre-market' || marketSession === 'after-hours') interval = 30_000;
    else interval = 120_000;
    pollRef.current = setInterval(() => fetchCandles(activeTF), interval);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeTF, marketSession, fetchCandles]);

  const snapToNow = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().scrollToRealTime();
      isAtRealTimeRef.current = true;
      setShowSnapBtn(false);
    }
  }, []);

  const zoomChart = useCallback((direction: 'in' | 'out' | 'fit') => {
    if (!chartRef.current) return;
    const ts = chartRef.current.timeScale();
    if (direction === 'fit') {
      ts.fitContent();
      return;
    }
    const range = ts.getVisibleLogicalRange();
    if (!range) return;
    const factor = direction === 'in' ? -0.25 : 0.25; // in = shrink range, out = expand
    const rangeSize = range.to - range.from;
    const newSize = Math.max(rangeSize * (1 + factor), 10); // min 10 bars visible
    const center = (range.from + range.to) / 2;
    ts.setVisibleLogicalRange({ from: center - newSize / 2, to: center + newSize / 2 });
  }, []);

  const toggleGroup = useCallback((group: string) => { setGroupVis(prev => ({ ...prev, [group]: !prev[group as keyof typeof prev] })); }, []);
  const isUp = changePercent >= 0;
  const priceColor = isUp ? CANDLE_UP : CANDLE_DOWN;

  // Chip config matches new level colors
  const chipConfig = [
    { group: 'vwap', label: 'VWAP', color: VWAP_COLOR },
    { group: 'walls', label: 'CW / PW', color: CW_COLOR },
    ...(camLevels ? [{ group: 'cam', label: 'Cam', color: CAM_BULL }] : []),
    ...(prevDayHLC ? [{ group: 'prevDay', label: 'Prev Day', color: 'rgba(255,255,255,0.4)' }] : []),
  ];

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: BG_CHART, overflow: 'hidden', fontFamily: FONT }}>

      {/* ── TOOLBAR — simplified, no TF buttons ── */}
      <div style={{
        display: 'flex', alignItems: 'center',
        height: 40,
        padding: '0 14px',
        background: BG_TOOLBAR, borderBottom: `1px solid rgba(255,255,255,0.04)`,
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: '#fff', letterSpacing: 0.3, fontFamily: FONT_BRAND }}>{ticker}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: priceColor }}>${price.toFixed(2)}</span>
        <span style={{
          fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
          background: isUp ? 'rgba(0,220,130,0.1)' : 'rgba(255,71,87,0.1)',
          color: priceColor,
          border: `1px solid ${isUp ? 'rgba(0,220,130,0.12)' : 'rgba(255,71,87,0.12)'}`,
        }}>
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>

        {sessionStats && (
          <>
            <div style={{ width: 1, height: 18, background: BORDER }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)' }}>Vol</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{formatVolume(sessionStats.totalVol)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)' }}>Bars</span>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.8)' }}>{sessionStats.barCount}</span>
            </div>
          </>
        )}

        <div style={{ width: 1, height: 18, background: BORDER }} />

        {/* Level toggle chips — updated colors */}
        <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
          {chipConfig.map(chip => {
            const vis = groupVis[chip.group as keyof typeof groupVis];
            return (
              <div key={chip.group} onClick={() => toggleGroup(chip.group)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 9,
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: 4,
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'opacity 0.15s',
                  color: chip.color,
                  border: `1px solid ${chip.color}33`,
                  background: vis ? `${chip.color}0F` : 'transparent',
                  opacity: vis ? 1 : 0.25,
                }}
              >
                <span style={{ width: 4, height: 4, borderRadius: '50%', background: chip.color }} />
                {chip.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CHART AREA ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Pressure readout overlay — blur backdrop */}
        <div style={{ position: 'absolute', top: 8, left: 12, zIndex: 5, pointerEvents: 'none', fontFamily: FONT }}>
          <div
            id="yodha-pressure-readout"
            style={{
              background: 'rgba(8,12,22,0.92)',
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              padding: '5px 12px',
              borderRadius: 5,
              border: `1px solid ${BORDER}`,
              fontSize: 10,
              minHeight: 20,
            }}
          />
        </div>

        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(11,15,25,0.7)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, border: '2px solid rgba(0,220,130,0.2)', borderTopColor: CANDLE_UP, borderRadius: '50%', animation: 'yodha-spin 0.8s linear infinite', margin: '0 auto 8px' }} />
              <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontFamily: FONT }}>Loading {ticker}...</span>
              <style>{`@keyframes yodha-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        )}

        {/* Snap to latest button — shows when user scrolls away */}
        {showSnapBtn && (
          <button
            onClick={snapToNow}
            style={{
              position: 'absolute', bottom: 32, right: 88, zIndex: 8,
              width: 32, height: 32,
              background: 'rgba(8,12,22,0.9)',
              backdropFilter: 'blur(8px)',
              border: `1px solid rgba(0,220,130,0.25)`,
              borderRadius: 6,
              color: CANDLE_UP,
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.15s',
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
            title="Snap to latest"
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(0,220,130,0.15)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(8,12,22,0.9)'; }}
          >
            ⟫
          </button>
        )}

        {/* ★ Zoom controls — bottom-left */}
        <div style={{
          position: 'absolute', bottom: 32, left: 60, zIndex: 8,
          display: 'flex', gap: 4,
        }}>
          {[
            { label: '+', action: 'in' as const, title: 'Zoom in' },
            { label: '−', action: 'out' as const, title: 'Zoom out' },
            { label: '⊡', action: 'fit' as const, title: 'Fit all data' },
          ].map(btn => (
            <button
              key={btn.action}
              onClick={() => zoomChart(btn.action)}
              title={btn.title}
              style={{
                width: 28, height: 28,
                background: 'rgba(8,12,22,0.85)',
                backdropFilter: 'blur(8px)',
                border: `1px solid rgba(255,255,255,0.1)`,
                borderRadius: 5,
                color: 'rgba(255,255,255,0.5)',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'all 0.15s',
                fontFamily: FONT,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(8,12,22,0.85)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
              }}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* ★ Session separator overlay canvas */}
        <canvas
          ref={overlayCanvasRef}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        />

        <div ref={mainRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

export const YodhaChart = memo(YodhaChartInner);
