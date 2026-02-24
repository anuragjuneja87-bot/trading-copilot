'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';

/* ══════════════════════════════════════════════════════════
   YODHA CHART — Unified candlestick + bull/bear pressure
   Replaces TradingView widget with full Yodha integration:
   - OHLC candles from Polygon (via /api/candles)
   - VWAP computed server-side
   - Key levels overlay (call wall, put wall, GEX flip)
   - Bull/Bear pressure panel (from /api/timeline)
   - Thesis levels (entry, target, stop)
   - Redis-backed stateful data
   ══════════════════════════════════════════════════════════ */

// ── Types ────────────────────────────────────────────────

interface Bar {
  t: number; o: number; h: number; l: number; c: number; v: number; vw: number;
}

interface PressurePoint {
  t: number; s: number; d: number; bp: number; brp: number;
}

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
  // Thesis integration
  biasScore?: number;
  biasDirection?: string;
  bullPressure?: number;
  bearPressure?: number;
  entryLevel?: number;
  targetLevel?: number;
  stopLevel?: number;
}

// ── TradingView-inspired palette ─────────────────────────

const C = {
  bull: '#26a69a',
  bear: '#ef5350',
  bullFill: 'rgba(38,166,154,0.30)',
  bullFade: 'rgba(38,166,154,0.02)',
  bearFill: 'rgba(239,83,80,0.25)',
  bearFade: 'rgba(239,83,80,0.02)',
  vwap: '#2962ff',
  cw: '#ff9800',
  pw: '#e040fb',
  gex: '#fdd835',
  entry: '#26a69a',
  target: '#2979ff',
  stop: '#ef5350',
  grid: 'rgba(42,46,57,0.20)',
  gridStrong: 'rgba(42,46,57,0.45)',
  text: 'rgba(209,212,220,0.4)',
  textFaint: 'rgba(209,212,220,0.18)',
  crosshair: 'rgba(120,123,134,0.35)',
  panelBg: '#131722',
  tooltipBg: 'rgba(19,23,34,0.96)',
  tooltipBorder: 'rgba(42,46,57,0.7)',
};

const FONT = "'JetBrains Mono', 'SF Mono', 'Fira Code', monospace";

function fmtTime(v: number): string {
  return new Date(v).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}

// ── Component ────────────────────────────────────────────

export function YodhaChart({
  ticker, timeframe, levels, price, changePercent, marketSession,
  biasScore, biasDirection, bullPressure: liveBullP, bearPressure: liveBearP,
  entryLevel, targetLevel, stopLevel,
}: YodhaChartProps) {
  const [bars, setBars] = useState<Bar[]>([]);
  const [pressure, setPressure] = useState<PressurePoint[]>([]);
  const [loading, setLoading] = useState(true);
  const chartRef = useRef<ReactECharts | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Map timeframe prop to API format
  const tfMap: Record<string, string> = {
    '1m': '1m', '5m': '5m', '15m': '15m',
    '30m': '15m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1d',
  };
  const apiTf = tfMap[timeframe] || '5m';

  // ── Fetch candle data ──
  const fetchCandles = useCallback(async () => {
    try {
      const res = await fetch(`/api/candles/${ticker}?tf=${apiTf}&_t=${Date.now()}`, {
        cache: 'no-store',
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.bars?.length > 0) {
        setBars(data.bars);
      }
    } catch (e) {
      console.error('[YodhaChart] Candle fetch error:', e);
    }
  }, [ticker, apiTf]);

  // ── Fetch pressure timeline ──
  const fetchPressure = useCallback(async () => {
    try {
      const res = await fetch(`/api/timeline/${ticker}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      if (data.points?.length > 0) {
        setPressure(data.points);
      }
    } catch (e) {
      console.error('[YodhaChart] Pressure fetch error:', e);
    }
  }, [ticker]);

  // ── Initial load + polling ──
  useEffect(() => {
    setLoading(true);
    Promise.all([fetchCandles(), fetchPressure()]).finally(() => setLoading(false));

    // Poll during market hours
    const interval = marketSession === 'open' ? 15000 : 60000;
    pollRef.current = setInterval(() => {
      fetchCandles();
      fetchPressure();
    }, interval);

    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [ticker, apiTf, marketSession, fetchCandles, fetchPressure]);

  // ── Build ECharts option ──
  const option = useMemo(() => {
    if (bars.length === 0) return null;

    // Candle data: [time, open, close, low, high]
    const candleData = bars.map(b => [b.t, b.o, b.c, b.l, b.h]);
    const vwapData = bars.map(b => [b.t, b.vw]);

    // Pressure data (from Redis timeline)
    const bullData = pressure
      .filter(p => p.bp > 0 || p.brp > 0)
      .map(p => [p.t, p.bp]);
    const bearData = pressure
      .filter(p => p.bp > 0 || p.brp > 0)
      .map(p => [p.t, p.brp]);

    // If we have live pressure from the parent but no timeline data yet, use it
    if (bullData.length === 0 && liveBullP != null && liveBearP != null) {
      const now = Date.now();
      bullData.push([now - 60000, liveBullP], [now, liveBullP]);
      bearData.push([now - 60000, liveBearP], [now, liveBearP]);
    }

    // Price bounds
    const allPrices = bars.flatMap(b => [b.l, b.h]);
    // Include levels in price range if they're within 5% of current price
    const relevantLevels = [
      levels.vwap, levels.callWall, levels.putWall, levels.gexFlip,
      entryLevel, targetLevel, stopLevel,
    ].filter((l): l is number => l != null && Math.abs((l - price) / price) < 0.05);
    allPrices.push(...relevantLevels);

    const pxMin = Math.floor(Math.min(...allPrices) * 0.999);
    const pxMax = Math.ceil(Math.max(...allPrices) * 1.001);

    const lastBar = bars[bars.length - 1];
    const lastClose = lastBar.c;
    const isUp = lastClose >= bars[Math.max(0, bars.length - 2)].c;
    const lastBull = bullData.length > 0 ? Math.round(bullData[bullData.length - 1][1] as number) : (liveBullP ?? 0);
    const lastBear = bearData.length > 0 ? Math.round(bearData[bearData.length - 1][1] as number) : (liveBearP ?? 0);

    const hasPressure = bullData.length > 0;

    // ── Level lines for candlestick panel ──
    const levelLines: any[] = [];

    // Current price line (always)
    levelLines.push({
      yAxis: lastClose,
      lineStyle: { color: isUp ? C.bull : C.bear, width: 1, type: 'dashed', opacity: 0.55 },
      label: {
        show: true, position: 'end',
        formatter: lastClose.toFixed(2),
        backgroundColor: isUp ? C.bull : C.bear,
        color: '#fff', padding: [2, 7], borderRadius: 2,
        fontSize: 10, fontWeight: 'bold', fontFamily: FONT,
      },
    });

    // VWAP (from levels prop, more accurate than computed)
    if (levels.vwap) {
      levelLines.push({
        yAxis: levels.vwap,
        lineStyle: { color: C.vwap, width: 1, type: 'solid', opacity: 0.15 },
        label: {
          show: true, position: 'insideEndTop',
          formatter: `VWAP ${levels.vwap.toFixed(2)}`,
          color: '#0b0e11', backgroundColor: C.vwap,
          padding: [1, 5], borderRadius: 2, fontSize: 8, fontWeight: 'bold', fontFamily: FONT,
        },
      });
    }

    // Entry level
    if (entryLevel && Math.abs((entryLevel - price) / price) < 0.05) {
      levelLines.push({
        yAxis: entryLevel,
        lineStyle: { color: C.entry, width: 1, type: 'dashed', opacity: 0.5 },
        label: {
          show: true, position: 'insideEndTop',
          formatter: `ENTRY ${entryLevel.toFixed(2)}`,
          color: '#0b0e11', backgroundColor: C.entry,
          padding: [1, 5], borderRadius: 2, fontSize: 8, fontWeight: 'bold', fontFamily: FONT,
        },
      });
    }

    // Call Wall
    if (levels.callWall && Math.abs((levels.callWall - price) / price) < 0.08) {
      levelLines.push({
        yAxis: levels.callWall,
        lineStyle: { color: C.cw, width: 1, type: 'dotted', opacity: 0.3 },
        label: {
          show: true, position: 'insideEndBottom',
          formatter: `CW ${levels.callWall}`,
          color: C.cw, backgroundColor: 'rgba(11,14,17,0.85)',
          padding: [1, 4], borderRadius: 2, fontSize: 8, fontFamily: FONT,
        },
      });
    }

    // Put Wall
    if (levels.putWall && Math.abs((levels.putWall - price) / price) < 0.08) {
      levelLines.push({
        yAxis: levels.putWall,
        lineStyle: { color: C.pw, width: 1, type: 'dotted', opacity: 0.3 },
        label: {
          show: true, position: 'insideEndBottom',
          formatter: `PW ${levels.putWall}`,
          color: C.pw, backgroundColor: 'rgba(11,14,17,0.85)',
          padding: [1, 4], borderRadius: 2, fontSize: 8, fontFamily: FONT,
        },
      });
    }

    // GEX Flip
    if (levels.gexFlip && Math.abs((levels.gexFlip - price) / price) < 0.08) {
      levelLines.push({
        yAxis: levels.gexFlip,
        lineStyle: { color: C.gex, width: 1, type: 'dotted', opacity: 0.25 },
        label: {
          show: true, position: 'insideEndBottom',
          formatter: `GEX ${levels.gexFlip}`,
          color: C.gex, backgroundColor: 'rgba(11,14,17,0.85)',
          padding: [1, 4], borderRadius: 2, fontSize: 8, fontFamily: FONT,
        },
      });
    }

    // ── Pressure crossover markers ──
    const crossMarks: any[] = [];
    for (let i = 1; i < bullData.length; i++) {
      const pb = bullData[i - 1][1] as number, pbe = bearData[i - 1]?.[1] as number ?? 0;
      const cb = bullData[i][1] as number, cbe = bearData[i]?.[1] as number ?? 0;
      if (pb <= pbe && cb > cbe) {
        crossMarks.push({
          coord: [bullData[i][0], cb],
          symbol: 'triangle', symbolSize: 9,
          itemStyle: { color: C.bull },
          label: { show: true, position: 'top', distance: 5,
            formatter: '▲', color: C.bull, fontSize: 7, fontWeight: 'bold', fontFamily: FONT,
            backgroundColor: 'rgba(11,14,17,0.85)', padding: [0, 3], borderRadius: 2,
          },
        });
      }
      if (pb >= pbe && cb < cbe) {
        crossMarks.push({
          coord: [bearData[i][0], cbe],
          symbol: 'pin', symbolSize: 9, symbolRotate: 180,
          itemStyle: { color: C.bear },
          label: { show: true, position: 'bottom', distance: 5,
            formatter: '▼', color: C.bear, fontSize: 7, fontWeight: 'bold', fontFamily: FONT,
            backgroundColor: 'rgba(11,14,17,0.85)', padding: [0, 3], borderRadius: 2,
          },
        });
      }
    }

    // ── Grid layout: 2 panels ──
    const grids = hasPressure
      ? [
          { left: 52, right: 56, top: 8, height: '76%' },    // candles
          { left: 52, right: 56, top: '86%', height: '11%' }, // pressure
        ]
      : [{ left: 52, right: 56, top: 8, bottom: 28 }]; // candles only

    const xAxes: any[] = [
      { type: 'time', gridIndex: 0,
        axisLine: { lineStyle: { color: C.gridStrong } },
        axisTick: { show: false },
        axisLabel: hasPressure ? { show: false } : {
          color: C.text, fontSize: 10, fontFamily: FONT,
          formatter: (v: number) => fmtTime(v), margin: 6,
        },
        splitLine: { show: true, lineStyle: { color: C.grid } },
        axisPointer: { label: hasPressure ? { show: false } : {
          backgroundColor: 'rgba(42,46,57,0.92)', color: '#d1d4dc',
          fontSize: 10, fontFamily: FONT,
          formatter: (p: any) => fmtTime(p.value),
        }},
      },
    ];

    const yAxes: any[] = [
      { type: 'value', gridIndex: 0, position: 'right',
        min: pxMin, max: pxMax,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: C.grid } },
        axisLabel: { color: C.text, fontSize: 10, fontFamily: FONT, formatter: (v: number) => v.toFixed(0) },
        axisPointer: { label: {
          backgroundColor: 'rgba(42,46,57,0.92)', color: '#d1d4dc',
          fontSize: 10, fontFamily: FONT,
          formatter: (p: any) => (+p.value).toFixed(2),
        }},
      },
    ];

    const series: any[] = [
      // Candles
      {
        name: 'Price', type: 'candlestick', xAxisIndex: 0, yAxisIndex: 0,
        data: candleData.map(c => ({ value: c })),
        itemStyle: {
          color: C.bull, color0: 'transparent',
          borderColor: C.bull, borderColor0: C.bear,
          borderWidth: 1,
        },
        barMaxWidth: 14,
        markLine: {
          animation: false, silent: true, symbol: ['none', 'none'],
          data: levelLines,
        },
      },
      // VWAP overlay
      {
        name: 'VWAP', type: 'line', xAxisIndex: 0, yAxisIndex: 0,
        data: vwapData, smooth: 0.15, symbol: 'none',
        lineStyle: { color: C.vwap, width: 1.5, opacity: 0.7 },
        z: 4,
      },
    ];

    const xAxisLinks = [0];

    // ── Pressure panel (if data available) ──
    if (hasPressure) {
      xAxes.push({
        type: 'time', gridIndex: 1,
        axisLine: { lineStyle: { color: C.gridStrong } },
        axisTick: { show: false },
        splitLine: { show: true, lineStyle: { color: 'rgba(42,46,57,0.12)' } },
        axisLabel: {
          color: C.text, fontSize: 10, fontFamily: FONT,
          formatter: (v: number) => fmtTime(v), margin: 6,
        },
        axisPointer: { label: {
          backgroundColor: 'rgba(42,46,57,0.92)', color: '#d1d4dc',
          fontSize: 10, fontFamily: FONT,
          formatter: (p: any) => fmtTime(p.value),
        }},
      });

      yAxes.push({
        type: 'value', gridIndex: 1, position: 'right',
        min: 0, max: 100, interval: 50,
        axisLine: { show: false }, axisTick: { show: false },
        splitLine: { lineStyle: { color: 'rgba(42,46,57,0.1)' } },
        axisLabel: { show: false },
        axisPointer: { label: { show: false } },
      });

      xAxisLinks.push(1);

      series.push(
        // Bull pressure
        {
          name: 'Bull', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          data: bullData, smooth: 0.4, symbol: 'none',
          lineStyle: { color: C.bull, width: 1.5 },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: C.bullFill },
                { offset: 1, color: C.bullFade },
              ],
            },
          },
          markPoint: { animation: false, data: crossMarks.filter(m => m.itemStyle.color === C.bull) },
          markLine: {
            animation: false, silent: true, symbol: ['none', 'none'],
            data: [{
              yAxis: lastBull,
              lineStyle: { width: 0, opacity: 0 },
              label: {
                show: true, position: 'end',
                formatter: `${lastBull}`,
                backgroundColor: C.bull, color: '#fff',
                padding: [2, 6], borderRadius: 2, fontSize: 9, fontWeight: 'bold', fontFamily: FONT,
              },
            }],
          },
        },
        // Bear pressure
        {
          name: 'Bear', type: 'line', xAxisIndex: 1, yAxisIndex: 1,
          data: bearData, smooth: 0.4, symbol: 'none',
          lineStyle: { color: C.bear, width: 1.5 },
          areaStyle: {
            color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: C.bearFill },
                { offset: 1, color: C.bearFade },
              ],
            },
          },
          markPoint: { animation: false, data: crossMarks.filter(m => m.itemStyle.color === C.bear) },
          markLine: {
            animation: false, silent: true, symbol: ['none', 'none'],
            data: [{
              yAxis: lastBear,
              lineStyle: { width: 0, opacity: 0 },
              label: {
                show: true, position: 'end',
                formatter: `${lastBear}`,
                backgroundColor: C.bear, color: '#fff',
                padding: [2, 6], borderRadius: 2, fontSize: 9, fontWeight: 'bold', fontFamily: FONT,
              },
            }],
          },
        },
      );
    }

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: grids,
      xAxis: xAxes,
      yAxis: yAxes,
      axisPointer: {
        link: [{ xAxisIndex: xAxisLinks }],
        lineStyle: { color: C.crosshair, type: 'dashed', width: 1 },
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: C.tooltipBg,
        borderColor: C.tooltipBorder,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: { color: '#d1d4dc', fontSize: 11, fontFamily: FONT },
        axisPointer: { type: 'cross' },
        formatter(params: any) {
          if (!params?.length) return '';
          const t = fmtTime(params[0].data?.value?.[0] ?? params[0].data?.[0]);
          let h = `<div style="color:${C.text};font-size:9px;margin-bottom:5px">${t} ET</div>`;

          const cd = params.find((p: any) => p.seriesName === 'Price');
          if (cd) {
            const [, o, c, l, hi] = cd.data.value || cd.data;
            const up = c >= o;
            const cl = up ? C.bull : C.bear;
            h += `<div style="margin-bottom:3px"><span style="color:${cl}">O ${o.toFixed(2)} H ${hi.toFixed(2)} L ${l.toFixed(2)} <b>C ${c.toFixed(2)}</b></span></div>`;
          }

          const vwp = params.find((p: any) => p.seriesName === 'VWAP');
          if (vwp) h += `<div style="color:${C.vwap};font-size:9.5px">VWAP ${vwp.data[1].toFixed(2)}</div>`;

          const bu = params.find((p: any) => p.seriesName === 'Bull');
          const be = params.find((p: any) => p.seriesName === 'Bear');
          if (bu || be) {
            const bv = bu ? Math.round(bu.data[1]) : 0;
            const brv = be ? Math.round(be.data[1]) : 0;
            const sp = bv - brv;
            h += `<div style="margin-top:4px;padding-top:4px;border-top:1px solid rgba(42,46,57,0.4)">
              <span style="color:${C.bull}">▲ ${bv}</span> &nbsp;
              <span style="color:${C.bear}">▼ ${brv}</span> &nbsp;
              <span style="color:${sp >= 0 ? C.bull : C.bear};font-weight:700">Δ ${sp >= 0 ? '+' : ''}${sp}</span></div>`;
          }
          return h;
        },
      },
      dataZoom: [{
        type: 'inside',
        xAxisIndex: xAxisLinks,
        start: Math.max(0, 100 - Math.min(100, 50000 / bars.length)),
        end: 100,
        minValueSpan: 5 * 60_000 * 3,
      }],
      series,
      graphic: hasPressure ? [
        { type: 'text', left: 58, top: '85.2%', style: {
          text: 'Bull / Bear Pressure', fill: C.textFaint,
          fontSize: 9, fontFamily: FONT, fontWeight: 600,
        }},
        { type: 'line', left: 52, right: 56, top: '84%',
          shape: { x1: 0, y1: 0, x2: 2000, y2: 0 },
          style: { stroke: C.gridStrong, lineWidth: 1 },
        },
      ] : [],
    };
  }, [bars, pressure, levels, price, liveBullP, liveBearP, entryLevel, targetLevel, stopLevel]);

  // ── Loading state ──
  if (loading && bars.length === 0) {
    return (
      <div
        style={{
          height: '100%',
          background: C.panelBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 4,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: 24, height: 24, border: `2px solid ${C.bull}40`, borderTopColor: C.bull,
            borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 8px',
          }} />
          <span style={{ color: C.text, fontSize: 11, fontFamily: FONT }}>Loading {ticker}...</span>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      </div>
    );
  }

  if (!option) return null;

  return (
    <div style={{ height: '100%', background: C.panelBg, borderRadius: 4, position: 'relative' }}>
      {/* Watermark */}
      <div style={{
        position: 'absolute', top: '35%', left: '50%', transform: 'translate(-50%, -50%)',
        fontSize: 48, fontWeight: 700, color: 'rgba(209,212,220,0.02)',
        letterSpacing: 5, pointerEvents: 'none', userSelect: 'none', zIndex: 0,
        fontFamily: FONT,
      }}>
        {ticker}
      </div>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </div>
  );
}
