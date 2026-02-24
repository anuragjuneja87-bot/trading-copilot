'use client';

import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { ConfidencePoint } from '@/hooks/use-ml-prediction';
import { COLORS } from '@/lib/echarts-theme';

/* ──────────────────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────────────────── */

export interface TimelinePoint extends ConfidencePoint {
  bullCount?: number;
  bearCount?: number;
  neutralCount?: number;
  bullPressure?: number;   // 0-100
  bearPressure?: number;   // 0-100
}

interface ConfidenceTimelineProps {
  history: TimelinePoint[];
  height?: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  ticker: string;
}

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

// Detect crossover points where bull/bear pressure swaps dominance
interface Crossover {
  time: number;
  to: 'BULLISH' | 'BEARISH';
  bullP: number;
  bearP: number;
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
        bullP: currBull,
        bearP: currBear,
      });
    }
  }
  return crosses;
}

const DIR_MAP: Record<string, number> = { BEARISH: 0, NEUTRAL: 1, BULLISH: 2 };
const DIR_REVERSE: Record<number, string> = { 0: 'BEARISH', 1: 'NEUTRAL', 2: 'BULLISH' };

const STORAGE_PREFIX = 'yodha-tl-v3'; // v3 = dual pressure
const MIN_INTERVAL_MS = 5000;

/* ──────────────────────────────────────────────────────────
   COMPONENT
   ────────────────────────────────────────────────────────── */

export function ConfidenceTimeline({ history, height = 160, marketSession, ticker }: ConfidenceTimelineProps) {
  const option = useMemo(() => {
    // Filter out invalid points
    const valid = history.filter(h => h.confidence > 0 || (h.bullPressure ?? 0) > 0 || (h.bearPressure ?? 0) > 0);
    if (valid.length < 1) return null;

    const { marketOpen, marketClose } = getSessionBounds();
    const now = Date.now();
    
    // If only 1 point, synthesize a start
    const eff = valid.length === 1
      ? [{ ...valid[0], time: valid[0].time - 120000 }, valid[0]]
      : valid;
    
    // X-axis: start from 5min before first point
    const xMin = eff[0].time - 5 * 60000;
    const xMax = marketSession === 'open'
      ? Math.max(now + 2 * 60000, eff[eff.length - 1].time + 60000)
      : marketClose;

    // Data series
    const bullData = eff.map(h => [h.time, h.bullPressure ?? Math.max(0, (h.confidence - 50) * 2)]);
    const bearData = eff.map(h => [h.time, h.bearPressure ?? Math.max(0, (50 - h.confidence) * 2)]);

    // Detect crossovers
    const crosses = detectCrossovers(eff);
    const crossMarkPoints = crosses.map(c => ({
      coord: [c.time, Math.max(c.bullP, c.bearP)],
      symbol: c.to === 'BULLISH' ? 'triangle' : 'pin',
      symbolSize: 14,
      symbolRotate: c.to === 'BEARISH' ? 180 : 0,
      itemStyle: {
        color: c.to === 'BULLISH' ? COLORS.green : COLORS.red,
        borderColor: 'rgba(6,8,16,0.9)',
        borderWidth: 1.5,
        shadowColor: (c.to === 'BULLISH' ? COLORS.green : COLORS.red) + '80',
        shadowBlur: 10,
      },
      label: {
        show: true,
        formatter: c.to === 'BULLISH' ? 'BULL ✕' : 'BEAR ✕',
        color: c.to === 'BULLISH' ? COLORS.green : COLORS.red,
        fontSize: 8,
        fontWeight: 'bold' as const,
        fontFamily: "'Oxanium', monospace",
        position: 'top' as const,
        distance: 12,
        padding: [2, 4] as [number, number],
        backgroundColor: 'rgba(6,8,16,0.85)',
        borderRadius: 2,
        borderColor: (c.to === 'BULLISH' ? COLORS.green : COLORS.red) + '40',
        borderWidth: 1,
      },
    }));

    // Current values
    const lastBull = bullData[bullData.length - 1]?.[1] ?? 0;
    const lastBear = bearData[bearData.length - 1]?.[1] ?? 0;
    const lastTime = eff[eff.length - 1].time;
    const lastDir = eff[eff.length - 1].direction || 'NEUTRAL';

    return {
      animation: false,
      grid: {
        top: 20, bottom: 32, left: 42, right: 90,
      },
      xAxis: {
        type: 'time' as const,
        min: xMin,
        max: xMax,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: {
          color: 'rgba(255,255,255,0.25)',
          fontSize: 9,
          fontFamily: "'Oxanium', monospace",
          formatter: (val: number) => formatET(new Date(val)),
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
          lineStyle: { color: 'rgba(255,255,255,0.04)', type: 'dashed' as const },
        },
        axisLabel: {
          color: 'rgba(255,255,255,0.2)',
          fontSize: 9,
          fontFamily: "'Oxanium', monospace",
          formatter: '{value}%',
        },
      },
      tooltip: {
        trigger: 'axis' as const,
        backgroundColor: 'rgba(6,8,16,0.92)',
        borderColor: 'rgba(0,229,255,0.15)',
        borderWidth: 1,
        textStyle: { color: '#e0e0e0', fontSize: 11, fontFamily: "'Oxanium', monospace" },
        axisPointer: {
          type: 'cross' as const,
          lineStyle: { color: 'rgba(0,229,255,0.15)' },
          label: { show: false },
        },
        formatter: (params: any) => {
          if (!Array.isArray(params) || params.length === 0) return '';
          const time = formatET(new Date(params[0].data[0]));
          const bull = params.find((p: any) => p.seriesName === 'Bull')?.data?.[1] ?? 0;
          const bear = params.find((p: any) => p.seriesName === 'Bear')?.data?.[1] ?? 0;
          const net = bull - bear;
          const netColor = net > 0 ? COLORS.green : net < 0 ? COLORS.red : '#ffc107';
          const netLabel = net > 0 ? 'BULLISH' : net < 0 ? 'BEARISH' : 'NEUTRAL';
          return `<div style="font-size:10px;opacity:0.5">${time} ET</div>
            <div style="margin-top:4px">
              <span style="color:${COLORS.green}">▲ Bull: ${Math.round(bull)}%</span>&nbsp;&nbsp;
              <span style="color:${COLORS.red}">▼ Bear: ${Math.round(bear)}%</span>
            </div>
            <div style="margin-top:3px;color:${netColor};font-weight:bold;font-size:12px">
              Net: ${net > 0 ? '+' : ''}${Math.round(net)} → ${netLabel}
            </div>`;
        },
      },
      series: [
        // ── BULL PRESSURE (green area) ──
        {
          name: 'Bull',
          type: 'line' as const,
          data: bullData,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: COLORS.green, width: 2 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: COLORS.green + '30' },
                { offset: 0.7, color: COLORS.green + '08' },
                { offset: 1, color: 'transparent' },
              ],
            },
          },
          markPoint: {
            data: [
              // Current bull value (glowing dot)
              {
                coord: [lastTime, lastBull],
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: {
                  color: COLORS.green,
                  borderColor: COLORS.green + '60',
                  borderWidth: 3,
                  shadowColor: COLORS.green + 'A0',
                  shadowBlur: 12,
                },
                label: { show: false },
              },
              ...crossMarkPoints,
            ],
          },
        },
        // ── BEAR PRESSURE (red area) ──
        {
          name: 'Bear',
          type: 'line' as const,
          data: bearData,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: { color: COLORS.red, width: 2 },
          areaStyle: {
            color: {
              type: 'linear' as const,
              x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: COLORS.red + '25' },
                { offset: 0.7, color: COLORS.red + '06' },
                { offset: 1, color: 'transparent' },
              ],
            },
          },
          markPoint: {
            data: [
              // Current bear value (glowing dot)
              {
                coord: [lastTime, lastBear],
                symbol: 'circle',
                symbolSize: 8,
                itemStyle: {
                  color: COLORS.red,
                  borderColor: COLORS.red + '60',
                  borderWidth: 3,
                  shadowColor: COLORS.red + 'A0',
                  shadowBlur: 12,
                },
                label: { show: false },
              },
            ],
          },
        },
      ],
      // Labels on right side showing current values
      graphic: [
        // Bull pressure label
        {
          type: 'text' as const,
          right: 4,
          top: (() => {
            // Position label at the bull line's Y position
            const pct = 1 - (lastBull / 100);
            return 20 + pct * (height - 52);
          })(),
          style: {
            text: `▲ ${Math.round(lastBull)}`,
            fill: COLORS.green,
            fontSize: 10,
            fontWeight: 'bold' as const,
            fontFamily: "'Oxanium', monospace",
          },
        },
        // Bear pressure label
        {
          type: 'text' as const,
          right: 4,
          top: (() => {
            const pct = 1 - (lastBear / 100);
            return 20 + pct * (height - 52);
          })(),
          style: {
            text: `▼ ${Math.round(lastBear)}`,
            fill: COLORS.red,
            fontSize: 10,
            fontWeight: 'bold' as const,
            fontFamily: "'Oxanium', monospace",
          },
        },
        // Net direction label
        {
          type: 'text' as const,
          right: 4,
          top: 4,
          style: {
            text: `${lastDir === 'BULLISH' ? '▲' : lastDir === 'BEARISH' ? '▼' : '◆'} ${lastDir}`,
            fill: lastDir === 'BULLISH' ? COLORS.green : lastDir === 'BEARISH' ? COLORS.red : '#ffc107',
            fontSize: 9,
            fontWeight: 'bold' as const,
            fontFamily: "'Oxanium', monospace",
          },
        },
      ],
    };
  }, [history, marketSession, height]);

  // Empty state
  if (history.length < 1 || !option) {
    return (
      <div style={{ height, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>⏳ Building pressure timeline...</p>
          <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>Tracking bull vs bear signals in real-time</p>
        </div>
      </div>
    );
  }

  return (
    <ReactECharts
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
    />
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
