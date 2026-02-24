'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ConfidencePoint } from '@/hooks/use-ml-prediction';

/* ──────────────────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────────────────── */

export interface TimelinePoint extends ConfidencePoint {
  bullCount?: number;
  bearCount?: number;
  neutralCount?: number;
  bullPressure?: number;
  bearPressure?: number;
}

interface ConfidenceTimelineProps {
  history: TimelinePoint[];
  height?: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  ticker: string;
}

/* ──────────────────────────────────────────────────────────
   COLORS — TradingView-inspired palette
   ────────────────────────────────────────────────────────── */

const TV = {
  bull: '#26a69a',        // TradingView green
  bullLight: '#26a69a40', // Fill
  bullFaint: '#26a69a10',
  bear: '#ef5350',        // TradingView red
  bearLight: '#ef535040',
  bearFaint: '#ef535010',
  grid: 'rgba(42,46,57,0.6)',
  gridFaint: 'rgba(42,46,57,0.3)',
  text: 'rgba(209,212,220,0.7)',
  textDim: 'rgba(209,212,220,0.35)',
  bg: '#131722',
  crosshair: 'rgba(120,123,134,0.4)',
  tooltipBg: 'rgba(19,23,34,0.95)',
  tooltipBorder: 'rgba(42,46,57,0.8)',
};

/* ──────────────────────────────────────────────────────────
   HELPERS
   ────────────────────────────────────────────────────────── */

function formatET(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}

function getSessionBounds(): { marketOpen: number; marketClose: number } {
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = etFormatter.formatToParts(now);
  const y = parseInt(parts.find(p => p.type === 'year')?.value || '2026');
  const m = parseInt(parts.find(p => p.type === 'month')?.value || '1');
  const d = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  
  const etHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: 'numeric', hour12: false,
  }).format(now);
  const etHour = parseInt(etHourStr);
  const utcHour = now.getUTCHours();
  const etOffset = utcHour - etHour;
  const offsetHours = etOffset < 0 ? etOffset + 24 : etOffset;
  
  const marketOpen = Date.UTC(y, m - 1, d, 9 + offsetHours, 30);
  const marketClose = Date.UTC(y, m - 1, d, 16 + offsetHours, 0);
  return { marketOpen, marketClose };
}

// Detect crossover points
interface Crossover {
  time: number;
  to: 'BULLISH' | 'BEARISH';
  value: number;
}

function detectCrossovers(history: TimelinePoint[]): Crossover[] {
  const crosses: Crossover[] = [];
  for (let i = 1; i < history.length; i++) {
    const prev = history[i - 1];
    const curr = history[i];
    const prevBull = prev.bullPressure ?? 0;
    const prevBear = prev.bearPressure ?? 0;
    const currBull = curr.bullPressure ?? 0;
    const currBear = curr.bearPressure ?? 0;
    
    const prevDom = prevBull > prevBear ? 'BULL' : prevBear > prevBull ? 'BEAR' : 'TIE';
    const currDom = currBull > currBear ? 'BULL' : currBear > currBull ? 'BEAR' : 'TIE';
    
    if (prevDom !== currDom && currDom !== 'TIE') {
      crosses.push({
        time: curr.time,
        to: currDom === 'BULL' ? 'BULLISH' : 'BEARISH',
        value: Math.max(currBull, currBear),
      });
    }
  }
  return crosses;
}

const DIR_MAP: Record<string, number> = { BEARISH: 0, NEUTRAL: 1, BULLISH: 2 };
const DIR_REVERSE: Record<number, string> = { 0: 'BEARISH', 1: 'NEUTRAL', 2: 'BULLISH' };

/* ──────────────────────────────────────────────────────────
   COMPONENT
   ────────────────────────────────────────────────────────── */

export function ConfidenceTimeline({ history, height = 160, marketSession, ticker }: ConfidenceTimelineProps) {
  const option = useMemo(() => {
    const valid = history.filter(h => h.confidence > 0 || (h.bullPressure ?? 0) > 0 || (h.bearPressure ?? 0) > 0);
    if (valid.length < 1) return null;

    const { marketOpen, marketClose } = getSessionBounds();
    const now = Date.now();
    
    const eff = valid.length === 1
      ? [{ ...valid[0], time: valid[0].time - 120000 }, valid[0]]
      : valid;
    
    const xMin = eff[0].time - 3 * 60000;
    const xMax = marketSession === 'open'
      ? Math.max(now + 2 * 60000, eff[eff.length - 1].time + 60000)
      : marketClose;

    const bullData = eff.map(h => [h.time, h.bullPressure ?? Math.max(0, (h.confidence - 50) * 2)]);
    const bearData = eff.map(h => [h.time, h.bearPressure ?? Math.max(0, (50 - h.confidence) * 2)]);

    const crosses = detectCrossovers(eff);
    
    const lastBull = (bullData[bullData.length - 1]?.[1] ?? 0) as number;
    const lastBear = (bearData[bearData.length - 1]?.[1] ?? 0) as number;

    return {
      animation: false,
      backgroundColor: 'transparent',
      grid: {
        top: 8, bottom: 24, left: 36, right: 54,
      },
      xAxis: {
        type: 'time' as const,
        min: xMin,
        max: xMax,
        axisLine: { lineStyle: { color: TV.gridFaint } },
        axisTick: { show: false },
        splitLine: {
          show: true,
          lineStyle: { color: TV.gridFaint, type: 'solid' as const },
        },
        axisLabel: {
          color: TV.textDim,
          fontSize: 10,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
          formatter: (val: number) => formatET(new Date(val)),
          margin: 8,
        },
      },
      yAxis: {
        type: 'value' as const,
        min: 0,
        max: 100,
        interval: 25,
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: {
          lineStyle: { color: TV.gridFaint, type: 'solid' as const },
        },
        axisLabel: {
          color: TV.textDim,
          fontSize: 10,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
          formatter: '{value}',
          margin: 4,
        },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: TV.tooltipBg,
        borderColor: TV.tooltipBorder,
        borderWidth: 1,
        padding: [8, 12],
        textStyle: {
          color: '#d1d4dc',
          fontSize: 12,
          fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
        },
        axisPointer: {
          type: 'cross' as const,
          lineStyle: { color: TV.crosshair, width: 1, type: 'dashed' as const },
          label: {
            backgroundColor: 'rgba(42,46,57,0.9)',
            color: '#d1d4dc',
            fontSize: 10,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
            formatter: (params: any) => {
              if (params.axisDimension === 'x') {
                return formatET(new Date(params.value));
              }
              return Math.round(params.value).toString();
            },
          },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const time = formatET(new Date(params[0].data[0]));
          const bull = params.find((p: any) => p.seriesName === 'Bull Pressure')?.data?.[1] ?? 0;
          const bear = params.find((p: any) => p.seriesName === 'Bear Pressure')?.data?.[1] ?? 0;
          const spread = Math.round(bull - bear);
          const spreadColor = spread > 0 ? TV.bull : spread < 0 ? TV.bear : TV.text;
          return `
            <div style="font-size:11px;color:${TV.textDim};margin-bottom:6px">${time} ET</div>
            <div style="display:flex;justify-content:space-between;gap:16px;margin-bottom:4px">
              <span style="color:${TV.bull}">● Bull <b>${Math.round(bull)}</b></span>
              <span style="color:${TV.bear}">● Bear <b>${Math.round(bear)}</b></span>
            </div>
            <div style="border-top:1px solid ${TV.gridFaint};padding-top:4px;color:${spreadColor};font-weight:600">
              Spread: ${spread > 0 ? '+' : ''}${spread}
            </div>`;
        },
      },
      series: [
        // ── BULL PRESSURE ──
        {
          name: 'Bull Pressure',
          type: 'line' as const,
          data: bullData,
          smooth: 0.35,
          symbol: 'none',
          sampling: 'lttb' as const,
          lineStyle: { color: TV.bull, width: 1.5 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: TV.bullLight },
                { offset: 1, color: TV.bullFaint },
              ],
            },
          },
          emphasis: { disabled: true },
          markPoint: {
            data: crosses
              .filter(c => c.to === 'BULLISH')
              .map(c => ({
                coord: [c.time, c.value],
                symbol: 'triangle',
                symbolSize: 10,
                symbolOffset: [0, 4],
                itemStyle: { color: TV.bull, borderColor: TV.bull, borderWidth: 0 },
                label: {
                  show: true,
                  formatter: '▲',
                  position: 'top' as const,
                  distance: 4,
                  color: TV.bull,
                  fontSize: 8,
                  fontWeight: 'bold' as const,
                },
              })),
            animation: false,
          },
        },
        // ── BEAR PRESSURE ──
        {
          name: 'Bear Pressure',
          type: 'line' as const,
          data: bearData,
          smooth: 0.35,
          symbol: 'none',
          sampling: 'lttb' as const,
          lineStyle: { color: TV.bear, width: 1.5 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: TV.bearLight },
                { offset: 1, color: TV.bearFaint },
              ],
            },
          },
          emphasis: { disabled: true },
          markPoint: {
            data: crosses
              .filter(c => c.to === 'BEARISH')
              .map(c => ({
                coord: [c.time, c.value],
                symbol: 'pin',
                symbolSize: 10,
                symbolRotate: 180,
                itemStyle: { color: TV.bear, borderColor: TV.bear, borderWidth: 0 },
                label: {
                  show: true,
                  formatter: '▼',
                  position: 'bottom' as const,
                  distance: 4,
                  color: TV.bear,
                  fontSize: 8,
                  fontWeight: 'bold' as const,
                },
              })),
            animation: false,
          },
        },
        // ── RIGHT-SIDE CURRENT VALUE MARKERS (TradingView-style price tags) ──
        {
          name: '_bullTag',
          type: 'line' as const,
          data: [],
          markLine: {
            animation: false,
            silent: true,
            symbol: ['none', 'none'],
            data: [
              {
                yAxis: lastBull,
                lineStyle: { color: TV.bull, width: 1, type: 'dashed' as const, opacity: 0.4 },
                label: {
                  show: true,
                  position: 'end' as const,
                  formatter: `{a|${Math.round(lastBull)}}`,
                  backgroundColor: TV.bull,
                  padding: [2, 6, 2, 6],
                  borderRadius: 2,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 'bold' as const,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
                  rich: { a: { color: '#fff', fontSize: 10, fontWeight: 'bold' as const } },
                },
              },
            ],
          },
        },
        {
          name: '_bearTag',
          type: 'line' as const,
          data: [],
          markLine: {
            animation: false,
            silent: true,
            symbol: ['none', 'none'],
            data: [
              {
                yAxis: lastBear,
                lineStyle: { color: TV.bear, width: 1, type: 'dashed' as const, opacity: 0.4 },
                label: {
                  show: true,
                  position: 'end' as const,
                  formatter: `{a|${Math.round(lastBear)}}`,
                  backgroundColor: TV.bear,
                  padding: [2, 6, 2, 6],
                  borderRadius: 2,
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 'bold' as const,
                  fontFamily: "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif",
                  rich: { a: { color: '#fff', fontSize: 10, fontWeight: 'bold' as const } },
                },
              },
            ],
          },
        },
      ],
    };
  }, [history, marketSession, height]);

  // Empty state
  if (history.length < 1 || !option) {
    return (
      <div
        style={{
          height,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(19,23,34,0.5)', borderRadius: 4,
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: TV.textDim }}>⏳ Building pressure timeline...</p>
          <p style={{ fontSize: 9, color: TV.textDim, marginTop: 2, opacity: 0.6 }}>
            Tracking bull vs bear signals in real-time
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: 'rgba(19,23,34,0.4)', borderRadius: 4, padding: '4px 0' }}>
      <ReactECharts
        option={option}
        style={{ height, width: '100%' }}
        opts={{ renderer: 'canvas' }}
        notMerge={true}
      />
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   SERVER API HELPERS
   ────────────────────────────────────────────────────────── */

export async function fetchTimelineHistory(ticker: string): Promise<TimelinePoint[]> {
  try {
    const res = await fetch(`/api/timeline/${encodeURIComponent(ticker)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.points || [])
      .filter((p: any) => p.s > 0 || (p.bp ?? 0) > 0 || (p.brp ?? 0) > 0)
      .map((p: any) => ({
        time: p.t,
        confidence: p.s,
        direction: DIR_REVERSE[p.d] || 'NEUTRAL',
        bullCount: p.bc || 0,
        bearCount: p.brc || 0,
        neutralCount: 0,
        bullPressure: p.bp ?? 0,
        bearPressure: p.brp ?? 0,
      }));
  } catch (e) {
    console.error('[Timeline] Fetch error:', e);
    return [];
  }
}

export function postTimelinePoint(ticker: string, point: TimelinePoint): void {
  fetch(`/api/timeline/${encodeURIComponent(ticker)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      score: point.confidence,
      direction: DIR_MAP[point.direction] ?? 1,
      bullCount: point.bullCount || 0,
      bearCount: point.bearCount || 0,
      bullPressure: point.bullPressure ?? 0,
      bearPressure: point.bearPressure ?? 0,
    }),
  }).catch(() => {});
}
