'use client';

import { useState, useEffect, useRef, useCallback, memo, useMemo } from 'react';

/* ════════════════════════════════════════════════════════════════
   YODHA CHART — Professional candlestick chart
   
   Readability-focused: larger fonts, better contrast, clear levels.
   Standard green/red candles. Pre/post market dimmed.
   Volume sub-pane. X-axis zoom preserved across polls.
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

const CANDLE_UP = '#26a69a';
const CANDLE_DOWN = '#ef5350';
const CANDLE_UP_EXT = 'rgba(38,166,154,0.35)';
const CANDLE_DOWN_EXT = 'rgba(239,83,80,0.35)';
const CANDLE_UP_WICK_EXT = 'rgba(38,166,154,0.5)';
const CANDLE_DOWN_WICK_EXT = 'rgba(239,83,80,0.5)';

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

interface LevelDef { price: number; label: string; color: string; style: number; width?: number; group: string; }

function YodhaChartInner({ ticker, timeframe, price, changePercent, marketSession, levels, prevDayHLC }: YodhaChartProps) {
  const mainRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const vwapSeriesRef = useRef<any>(null);
  const activeLevelsRef = useRef<Record<string, any>>({});
  const pressureMapRef = useRef<Record<number, { bp: number; brp: number; v: number; s?: string }>>({});
  const lcRef = useRef<any>(null);
  const isInitialLoadRef = useRef(true);

  const [bars, setBars] = useState<Bar[]>([]);
  const [activeTF, setActiveTF] = useState(timeframe || '5m');
  const [groupVis, setGroupVis] = useState({ vwap: true, walls: true, cam: true, prevDay: true });
  const [loading, setLoading] = useState(true);
  const [sessionStats, setSessionStats] = useState<{ totalVol: number; barCount: number } | null>(null);
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
    if (valid !== activeTF) { setActiveTF(valid); isInitialLoadRef.current = true; setLoading(true); fetchCandles(valid).then(() => setLoading(false)); }
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
          background: { type: ColorType.Solid, color: '#131722' },
          textColor: 'rgba(209,212,220,0.85)',  // ★ Brighter axis text
          fontFamily: FONT,
          fontSize: 12,  // ★ Larger axis labels (was 11)
        },
        grid: {
          vertLines: { color: 'rgba(42,46,57,0.4)' },  // ★ Slightly more visible grid
          horzLines: { color: 'rgba(42,46,57,0.4)' },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: 'rgba(120,123,134,0.5)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#2a2e39' },
          horzLine: { color: 'rgba(120,123,134,0.5)', width: 1, style: LineStyle.Dashed, labelBackgroundColor: '#2a2e39' },
        },
        rightPriceScale: {
          borderColor: 'rgba(42,46,57,0.6)',
          scaleMargins: { top: 0.04, bottom: 0.18 },
        },
        timeScale: {
          borderColor: 'rgba(42,46,57,0.6)',
          timeVisible: true, secondsVisible: false,
          rightOffset: 8,  // ★ More room on the right
          barSpacing: 9,   // ★ Slightly wider bars
          minBarSpacing: 3,
          visible: true,
          tickMarkFormatter: (time: number, type: number) => {
            const ms = (time as number) * 1000;
            return type <= 2 ? fmtDateET(ms) : fmtET(ms);
          },
        },
        localization: { timeFormatter: (t: number) => fmtET((t as number) * 1000) + ' ET' },
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
        handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true },
      });
      chartRef.current = chart;

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
        color: '#2962ff',
        lineWidth: 2,  // ★ Thicker VWAP line (was 1)
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
          const sessionLabel = p.s === 'pre' ? '<span style="color:#ffc107;margin-right:8px">PRE</span>' : p.s === 'post' ? '<span style="color:#ffc107;margin-right:8px">AH</span>' : '';
          el.innerHTML = sessionLabel +
            `<span style="color:#26a69a;font-weight:700">▲ ${Math.round(p.bp || 0)}</span><span style="color:rgba(209,212,220,0.2);margin:0 6px">|</span>` +
            `<span style="color:#ef5350;font-weight:700">▼ ${Math.round(p.brp || 0)}</span><span style="color:rgba(209,212,220,0.2);margin:0 6px">|</span>` +
            `<span style="color:${sp >= 0 ? '#26a69a' : '#ef5350'};font-weight:700">Δ${sp >= 0 ? '+' : ''}${sp}</span><span style="color:rgba(209,212,220,0.2);margin:0 6px">|</span>` +
            `<span style="color:rgba(209,212,220,0.6);font-weight:600">Vol ${formatVolume(p.v || 0)}</span>`;
        } else { el.innerHTML = ''; }
      });

      const ro = new ResizeObserver(() => { chart.applyOptions({ width: el.clientWidth, height: el.clientHeight }); });
      ro.observe(el);
      isInitialLoadRef.current = true;
      setLoading(true);
      await fetchCandles(activeTF);
      setLoading(false);
    })();
    return () => { destroyed = true; candleSeriesRef.current = null; volumeSeriesRef.current = null; vwapSeriesRef.current = null; if (chartRef.current) { try { chartRef.current.remove(); } catch {} chartRef.current = null; } };
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
      volumeByTime.set(timeSec, { time: timeSec, value: bar.v, color: isExt ? (isUp ? 'rgba(38,166,154,0.15)' : 'rgba(239,83,80,0.15)') : (isUp ? 'rgba(38,166,154,0.35)' : 'rgba(239,83,80,0.35)') });
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
      cs.setData(candleData);
      if (vwapSeriesRef.current) vwapSeriesRef.current.setData(vwapData);
      if (volumeSeriesRef.current) volumeSeriesRef.current.setData(volumeData);
      drawLevels();
      addSessionMarkers(candleData);
      if (isInitialLoadRef.current && chartRef.current) { chartRef.current.timeScale().fitContent(); isInitialLoadRef.current = false; }
    } catch (e) { if (String(e).indexOf('disposed') === -1) console.error('[YodhaChart] setData:', e); }
  }, [bars, groupVis, levels, camLevels, prevDayHLC]);

  // ── Session markers ──
  const addSessionMarkers = useCallback((candleData: any[]) => {
    const cs = candleSeriesRef.current;
    if (!cs || !candleData.length) return;
    const markers: any[] = [];
    let lastDay = '';
    for (const candle of candleData) {
      const { hour, minute, dayStr } = getETTime(candle.time);
      if (dayStr !== lastDay && hour === 9 && minute >= 30 && minute < 35) {
        markers.push({
          time: candle.time, position: 'aboveBar',
          color: 'rgba(255,255,255,0.5)',  // ★ Brighter marker
          shape: 'arrowDown',
          text: `OPEN ${dayStr.slice(5)}`,
          size: 1,  // ★ Bigger marker (was 0.5)
        });
        lastDay = dayStr;
      }
    }
    if (markers.length > 0) { try { cs.setMarkers(markers); } catch {} }
  }, []);

  // ── Draw levels ──
  const drawLevels = useCallback(() => {
    const cs = candleSeriesRef.current; const LC = lcRef.current;
    if (!cs || !LC) return;
    const { LineStyle } = LC;
    Object.values(activeLevelsRef.current).forEach((pl) => { try { cs.removePriceLine(pl); } catch {} });
    activeLevelsRef.current = {};
    const allLevels: Record<string, LevelDef> = {};
    const lastBar = bars[bars.length - 1];
    const vwapPrice = levels.vwap || lastBar?.vw;
    if (vwapPrice && groupVis.vwap) allLevels.vwap = { price: vwapPrice, label: 'VWAP', color: '#2962ff', style: LineStyle.Solid, group: 'vwap' };
    if (groupVis.walls) {
      if (levels.callWall) allLevels.cw = { price: levels.callWall, label: 'CW', color: '#ff9800', style: LineStyle.Dashed, group: 'walls' };
      if (levels.putWall) allLevels.pw = { price: levels.putWall, label: 'PW', color: '#e040fb', style: LineStyle.Dashed, group: 'walls' };
    }
    if (groupVis.cam && camLevels) {
      allLevels.r4 = { price: camLevels.r4, label: 'R4', color: '#00bcd4', style: LineStyle.Dotted, group: 'cam' };
      allLevels.r3 = { price: camLevels.r3, label: 'R3', color: '#00bcd4', style: LineStyle.Dashed, group: 'cam' };
      allLevels.s3 = { price: camLevels.s3, label: 'S3', color: '#ff7043', style: LineStyle.Dashed, group: 'cam' };
      allLevels.s4 = { price: camLevels.s4, label: 'S4', color: '#ff7043', style: LineStyle.Dotted, group: 'cam' };
    }
    if (groupVis.prevDay && prevDayHLC) {
      allLevels.prevClose = { price: prevDayHLC.c, label: 'PC', color: '#ffeb3b', style: LineStyle.Dashed, width: 1, group: 'prevDay' };
      allLevels.prevHigh = { price: prevDayHLC.h, label: 'PH', color: '#ffeb3b', style: LineStyle.Dotted, width: 1, group: 'prevDay' };  // ★ Brighter (was 0.45 alpha)
      allLevels.prevLow = { price: prevDayHLC.l, label: 'PL', color: '#ffeb3b', style: LineStyle.Dotted, width: 1, group: 'prevDay' };   // ★ Brighter
    }
    // ★ Cleaner level labels: just the abbreviation, price shown on axis
    Object.entries(allLevels).forEach(([key, lv]) => {
      activeLevelsRef.current[key] = cs.createPriceLine({
        price: lv.price, color: lv.color,
        lineWidth: lv.width || 1, lineStyle: lv.style,
        axisLabelVisible: true,
        title: lv.label,  // ★ Just "VWAP" not "VWAP 685.87" — price is on the axis
      });
    });
  }, [bars, groupVis, levels, camLevels, prevDayHLC]);

  const handleTFChange = useCallback(async (tf: string) => { setActiveTF(tf); isInitialLoadRef.current = true; setLoading(true); await fetchCandles(tf); setLoading(false); }, [fetchCandles]);

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

  const toggleGroup = useCallback((group: string) => { setGroupVis(prev => ({ ...prev, [group]: !prev[group as keyof typeof prev] })); }, []);
  const isUp = changePercent >= 0;
  const priceColor = isUp ? '#26a69a' : '#ef5350';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: '#131722', overflow: 'hidden', fontFamily: FONT }}>

      {/* ── TOOLBAR ── ★ Taller, bigger fonts ★ */}
      <div style={{
        display: 'flex', alignItems: 'center',
        height: 44,  // ★ Was 38
        padding: '0 16px',  // ★ More breathing room
        background: '#131722', borderBottom: '1px solid rgba(42,46,57,0.6)',
        gap: 12,  // ★ Was 10
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 16, fontWeight: 700, color: '#fff', letterSpacing: 0.3 }}>{ticker}</span>
        <span style={{ fontSize: 15, fontWeight: 600, color: priceColor }}>${price.toFixed(2)}</span>
        <span style={{
          fontSize: 12, fontWeight: 600, padding: '3px 8px', borderRadius: 4,  // ★ Was 10px
          background: isUp ? 'rgba(38,166,154,0.14)' : 'rgba(239,83,80,0.14)', color: priceColor,
        }}>
          {isUp ? '+' : ''}{changePercent.toFixed(2)}%
        </span>

        {sessionStats && (
          <>
            <div style={{ width: 1, height: 20, background: 'rgba(42,46,57,0.6)' }} />
            <span style={{ fontSize: 11, color: 'rgba(209,212,220,0.55)', letterSpacing: 0.3 }}>
              Vol {formatVolume(sessionStats.totalVol)}
            </span>
          </>
        )}

        <div style={{ width: 1, height: 20, background: 'rgba(42,46,57,0.6)' }} />

        {/* TF buttons */}
        <div style={{ display: 'flex', gap: 2 }}>
          {Object.entries(TF_MAP).map(([key, cfg]) => (
            <button key={key} onClick={() => handleTFChange(key)}
              style={{
                background: activeTF === key ? 'rgba(41,98,255,0.25)' : 'transparent',
                color: activeTF === key ? '#fff' : 'rgba(209,212,220,0.5)',
                border: activeTF === key ? '1px solid rgba(41,98,255,0.4)' : '1px solid transparent',
                fontFamily: 'inherit',
                fontSize: 12,  // ★ Was 10.5
                fontWeight: activeTF === key ? 700 : 500,
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                transition: 'all 0.12s',
              }}
            >
              {cfg.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'rgba(42,46,57,0.6)' }} />

        {/* Level toggle chips */}
        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          {[
            { group: 'vwap', label: 'VWAP', color: '#2962ff' },
            { group: 'walls', label: 'CW / PW', color: '#ff9800' },
            ...(camLevels ? [{ group: 'cam', label: 'Cam', color: '#00bcd4' }] : []),
            ...(prevDayHLC ? [{ group: 'prevDay', label: 'Prev Day', color: '#ffeb3b' }] : []),
          ].map(chip => {
            const vis = groupVis[chip.group as keyof typeof groupVis];
            return (
              <div key={chip.group} onClick={() => toggleGroup(chip.group)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  fontSize: 11,  // ★ Was 9
                  fontWeight: 600,
                  padding: '3px 8px',  // ★ More padding
                  borderRadius: 4,
                  cursor: 'pointer', userSelect: 'none',
                  transition: 'opacity 0.15s',
                  color: chip.color,
                  borderColor: chip.color + '50',
                  borderWidth: 1, borderStyle: 'solid',
                  opacity: vis ? 1 : 0.25,
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: chip.color }} />
                {chip.label}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CHART AREA ── */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        {/* Pressure readout overlay */}
        <div style={{ position: 'absolute', top: 8, left: 12, zIndex: 5, pointerEvents: 'none', fontFamily: FONT }}>
          <div
            id="yodha-pressure-readout"
            style={{
              background: 'rgba(19,23,34,0.92)',
              padding: '5px 12px',
              borderRadius: 5,
              border: '1px solid rgba(42,46,57,0.5)',
              fontSize: 12,  // ★ Was 10
              minHeight: 22,
            }}
          />
        </div>

        {loading && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(19,23,34,0.7)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 28, height: 28, border: '2px solid rgba(38,166,154,0.3)', borderTopColor: '#26a69a', borderRadius: '50%', animation: 'yodha-spin 0.8s linear infinite', margin: '0 auto 8px' }} />
              <span style={{ color: 'rgba(209,212,220,0.5)', fontSize: 13, fontFamily: FONT }}>Loading {ticker}...</span>
              <style>{`@keyframes yodha-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          </div>
        )}

        <div ref={mainRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </div>
  );
}

export const YodhaChart = memo(YodhaChartInner);
