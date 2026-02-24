'use client';

import { useMemo, useRef } from 'react';
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

// Format ET time from a Date object
function formatET(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  });
}

// Get today's market session boundaries in UTC ms
function getSessionBounds(): { preOpen: number; marketOpen: number; marketClose: number } {
  // Get today's date string in ET timezone
  const now = new Date();
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  const parts = etFormatter.formatToParts(now);
  const y = parseInt(parts.find(p => p.type === 'year')?.value || '2026');
  const m = parseInt(parts.find(p => p.type === 'month')?.value || '1');
  const d = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  
  // Determine if currently EDT or EST by checking ET hour vs UTC hour
  const etHourStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', hour12: false,
  }).format(now);
  const etHour = parseInt(etHourStr);
  const utcHour = now.getUTCHours();
  const etOffset = utcHour - etHour; // 4 for EDT, 5 for EST
  const offsetHours = etOffset < 0 ? etOffset + 24 : etOffset;
  
  // Create UTC timestamps for ET market hours
  const preOpen = Date.UTC(y, m - 1, d, 4 + offsetHours, 0);   // 4:00 AM ET
  const marketOpen = Date.UTC(y, m - 1, d, 9 + offsetHours, 30); // 9:30 AM ET  
  const marketClose = Date.UTC(y, m - 1, d, 16 + offsetHours, 0); // 4:00 PM ET
  
  return { preOpen, marketOpen, marketClose };
}

// Detect flip points where direction changes
function detectFlips(history: TimelinePoint[]): Array<{
  time: number;
  from: string;
  to: string;
  strength: number;
}> {
  const flips: Array<{ time: number; from: string; to: string; strength: number }> = [];
  for (let i = 1; i < history.length; i++) {
    if (history[i].direction !== history[i - 1].direction && 
        history[i].direction !== 'NEUTRAL' && 
        history[i - 1].direction !== 'NEUTRAL') {
      flips.push({
        time: history[i].time,
        from: history[i - 1].direction,
        to: history[i].direction,
        strength: history[i].confidence,
      });
    }
  }
  return flips;
}

// Build colored background segments from history
function buildBiasSegments(history: TimelinePoint[]): Array<{
  start: number;
  end: number;
  direction: string;
}> {
  if (history.length === 0) return [];
  
  const segments: Array<{ start: number; end: number; direction: string }> = [];
  let currentDir = history[0].direction;
  let segStart = history[0].time;
  
  for (let i = 1; i < history.length; i++) {
    if (history[i].direction !== currentDir) {
      segments.push({ start: segStart, end: history[i].time, direction: currentDir });
      currentDir = history[i].direction;
      segStart = history[i].time;
    }
  }
  // Close final segment
  segments.push({ start: segStart, end: history[history.length - 1].time, direction: currentDir });
  
  return segments;
}

/* ──────────────────────────────────────────────────────────
   MAIN COMPONENT
   ────────────────────────────────────────────────────────── */

export function ConfidenceTimeline({
  history,
  height = 140,
  marketSession,
  ticker,
}: ConfidenceTimelineProps) {
  const chartRef = useRef<any>(null);

  // Build ECharts option
  const option = useMemo(() => {
    // Filter out invalid points (confidence=0 from before signals loaded)
    const validHistory = history.filter(h => h.confidence > 0);
    if (validHistory.length < 1) return null;

    const { marketOpen, marketClose } = getSessionBounds();
    const now = Date.now();
    
    // If only 1 point, create a synthetic start 2min earlier so the line has length
    const effectiveHistory = validHistory.length === 1
      ? [{ ...validHistory[0], time: validHistory[0].time - 120000 }, validHistory[0]]
      : validHistory;
    
    // X-axis: start from 5min before first data point, end at now + buffer
    const dataStart = effectiveHistory[0].time;
    const xMin = dataStart - 5 * 60000; // 5 min padding before first point
    const xMax = marketSession === 'open' 
      ? Math.max(now + 2 * 60000, effectiveHistory[effectiveHistory.length - 1].time + 60000) 
      : marketClose;
    
    // Data: [time, confidence, directionCode] where 0=BEARISH, 1=NEUTRAL, 2=BULLISH
    const lineData = effectiveHistory.map(h => [
      h.time, 
      h.confidence, 
      h.direction === 'BULLISH' ? 2 : h.direction === 'BEARISH' ? 0 : 1,
    ]);
    
    // Bias segments for colored background bands
    const segments = buildBiasSegments(effectiveHistory);
    const markAreaData = segments.map(seg => {
      const color = seg.direction === 'BULLISH' ? COLORS.green
        : seg.direction === 'BEARISH' ? COLORS.red
        : '#ffc107';
      return [{
        xAxis: seg.start,
        itemStyle: { 
          color: {
            type: 'linear',
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: color + '12' },
              { offset: 0.5, color: color + '06' },
              { offset: 1, color: 'transparent' },
            ],
          },
        },
      }, {
        xAxis: seg.end,
      }];
    });

    // Detect flip points
    const flips = detectFlips(effectiveHistory);
    const flipMarkPoints = flips.map(flip => ({
      coord: [flip.time, flip.strength],
      symbol: flip.to === 'BULLISH' ? 'triangle' : 'pin',
      symbolSize: flip.to === 'BULLISH' ? 14 : 12,
      symbolRotate: flip.to === 'BEARISH' ? 180 : 0,
      itemStyle: {
        color: flip.to === 'BULLISH' ? COLORS.green : COLORS.red,
        borderColor: 'rgba(6,8,16,0.9)',
        borderWidth: 1.5,
        shadowColor: (flip.to === 'BULLISH' ? COLORS.green : COLORS.red) + '80',
        shadowBlur: 10,
      },
      label: {
        show: true,
        formatter: flip.to === 'BULLISH' ? 'BULL FLIP' : 'BEAR FLIP',
        color: flip.to === 'BULLISH' ? COLORS.green : COLORS.red,
        fontSize: 8,
        fontWeight: 'bold',
        fontFamily: "'Oxanium', monospace",
        position: flip.to === 'BULLISH' ? 'top' : 'bottom',
        distance: 10,
        padding: [2, 4],
        backgroundColor: 'rgba(6,8,16,0.85)',
        borderRadius: 2,
        borderColor: (flip.to === 'BULLISH' ? COLORS.green : COLORS.red) + '40',
        borderWidth: 1,
      },
    }));
    
    // Current value
    const current = effectiveHistory[effectiveHistory.length - 1];
    const currentColor = current.direction === 'BULLISH' ? COLORS.green
      : current.direction === 'BEARISH' ? COLORS.red
      : '#ffc107';

    return {
      animation: false,
      grid: {
        top: 28,
        right: 52,
        bottom: 28,
        left: 8,
        containLabel: false,
      },
      // Color line segments by direction dimension
      visualMap: {
        show: false,
        dimension: 2, // directionCode: 0=BEAR, 1=NEUTRAL, 2=BULL
        pieces: [
          { value: 0, color: COLORS.red },    // BEARISH
          { value: 1, color: '#ffc107' },      // NEUTRAL
          { value: 2, color: COLORS.green },   // BULLISH
        ],
        seriesIndex: 0, // Only apply to main line
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(6,8,16,0.95)',
        borderColor: 'rgba(255,255,255,0.08)',
        borderWidth: 1,
        textStyle: {
          color: '#e0e6f0',
          fontFamily: "'Oxanium', monospace",
          fontSize: 11,
        },
        formatter: (params: any) => {
          const p = Array.isArray(params) ? params[0] : params;
          if (!p || !p.data) return '';
          const time = formatET(new Date(p.data[0]));
          const val = p.data[0];
          const match = effectiveHistory.find(h => Math.abs(h.time - val) < 30000);
          const dir = match?.direction || 'NEUTRAL';
          const dirColor = dir === 'BULLISH' ? COLORS.green : dir === 'BEARISH' ? COLORS.red : '#ffc107';
          const bulls = match?.bullCount ?? '—';
          const bears = match?.bearCount ?? '—';
          return `<div style="min-width:150px">
            <div style="font-size:10px;color:#8b99b0;margin-bottom:4px">${time} ET</div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px">
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${dirColor}"></span>
              <span style="font-weight:700;color:${dirColor};font-size:12px">${dir}</span>
              <span style="font-size:11px;color:#e0e6f0;margin-left:auto;font-weight:700">${p.data[1]}%</span>
            </div>
            <div style="font-size:10px;color:#6b7b8d;border-top:1px solid rgba(255,255,255,0.06);padding-top:4px;margin-top:4px">
              <span style="color:${COLORS.green}">${bulls} bull</span> · <span style="color:${COLORS.red}">${bears} bear</span> signals
            </div>
          </div>`;
        },
        axisPointer: {
          type: 'cross',
          lineStyle: { color: 'rgba(0,229,255,0.2)', type: 'dashed' },
          crossStyle: { color: 'rgba(0,229,255,0.15)' },
          label: {
            backgroundColor: 'rgba(6,8,16,0.9)',
            borderColor: 'rgba(0,229,255,0.2)',
            color: '#e0e6f0',
            fontFamily: "'Oxanium', monospace",
            fontSize: 9,
            formatter: (params: any) => {
              if (params.axisDimension === 'x') return formatET(new Date(params.value));
              return `${Math.round(params.value)}%`;
            },
          },
        },
      },
      xAxis: {
        type: 'time',
        min: xMin,
        max: xMax,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#4a6070',
          fontSize: 9,
          fontFamily: "'Oxanium', monospace",
          formatter: (val: number) => formatET(new Date(val)),
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 100,
        interval: 25,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#3a4a5a',
          fontSize: 9,
          fontFamily: "'Oxanium', monospace",
          formatter: '{value}%',
        },
        splitLine: {
          lineStyle: { color: 'rgba(255,255,255,0.03)' },
        },
      },
      series: [
        // Main line — colored by visualMap direction
        {
          name: 'Bias Strength',
          type: 'line',
          data: lineData,
          smooth: 0.3,
          symbol: 'none',
          lineStyle: {
            width: 2.5,
            shadowColor: currentColor + '60',
            shadowBlur: 8,
          },
          areaStyle: {
            opacity: 0.08,
          },
          // Bias-colored background bands
          markArea: {
            silent: true,
            data: markAreaData,
          },
          // 50% neutral reference line + market open line
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', width: 1 },
            data: [
              {
                yAxis: 50,
                lineStyle: { color: 'rgba(255,255,255,0.06)' },
                label: {
                  show: true,
                  formatter: '50%',
                  color: '#3a4a5a',
                  fontSize: 8,
                  fontFamily: "'Oxanium', monospace",
                  position: 'end',
                },
              },
              ...(marketSession === 'open' && marketOpen >= xMin && marketOpen <= xMax ? [{
                xAxis: marketOpen,
                lineStyle: { color: 'rgba(0,229,255,0.12)', type: 'solid' as const, width: 1 },
                label: {
                  show: true,
                  formatter: '9:30',
                  color: COLORS.cyan + '50',
                  fontSize: 8,
                  fontFamily: "'Oxanium', monospace",
                  position: 'start' as const,
                },
              }] : []),
            ],
          },
          // Flip point markers
          markPoint: {
            data: flipMarkPoints,
            animation: false,
          },
        },
        // Current value indicator — glowing dot at latest point
        {
          type: 'scatter',
          data: [[current.time, current.confidence]],
          symbol: 'circle',
          symbolSize: 10,
          itemStyle: {
            color: currentColor,
            borderColor: currentColor + '40',
            borderWidth: 4,
            shadowColor: currentColor + 'B0',
            shadowBlur: 16,
          },
          label: {
            show: true,
            formatter: [
              `{val|${current.confidence}%}`,
              `{dir|${current.direction}}`,
            ].join('\n'),
            rich: {
              val: {
                color: '#fff',
                fontSize: 11,
                fontWeight: 'bold',
                fontFamily: "'Oxanium', monospace",
                lineHeight: 14,
              },
              dir: {
                color: currentColor,
                fontSize: 8,
                fontWeight: 'bold',
                fontFamily: "'Oxanium', monospace",
                lineHeight: 12,
              },
            },
            position: 'right',
            distance: 10,
            backgroundColor: 'rgba(6,8,16,0.85)',
            borderColor: currentColor + '30',
            borderWidth: 1,
            borderRadius: 4,
            padding: [3, 6],
          },
          z: 10,
        },
      ],
    };
  }, [history, marketSession, ticker]);

  if (history.length < 1 || !option) {
    return (
      <div 
        className="flex flex-col items-center justify-center rounded-lg"
        style={{ 
          height, 
          background: 'rgba(255,255,255,0.02)', 
          border: '1px dashed rgba(255,255,255,0.06)' 
        }}
      >
        <div className="text-[10px] mb-1" style={{ color: 'rgba(255,255,255,0.2)' }}>
          ⏳ Building confidence timeline...
        </div>
        <div className="text-[9px]" style={{ color: 'rgba(255,255,255,0.12)' }}>
          Tracking signal alignment in real-time
        </div>
      </div>
    );
  }

  return (
    <ReactECharts
      ref={chartRef}
      option={option}
      style={{ height, width: '100%' }}
      opts={{ renderer: 'canvas' }}
      notMerge={true}
    />
  );
}

/* ──────────────────────────────────────────────────────────
   HISTORY MANAGER — localStorage persistence
   ────────────────────────────────────────────────────────── */

const STORAGE_PREFIX = 'yodha-timeline';
const MIN_INTERVAL_MS = 5000; // Min 5s between points

function getStorageKey(ticker: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${STORAGE_PREFIX}-${ticker}-${today}`;
}

export function loadTimelineHistory(ticker: string): TimelinePoint[] {
  try {
    const key = getStorageKey(ticker);
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Filter out invalid 0-confidence points from before signals loaded
    return Array.isArray(parsed) ? parsed.filter((p: any) => p.confidence > 0) : [];
  } catch {
    return [];
  }
}

export function saveTimelineHistory(ticker: string, history: TimelinePoint[]): void {
  try {
    const key = getStorageKey(ticker);
    // Cap at 2000 points (~16hrs at 30s intervals)
    const capped = history.length > 2000 ? history.slice(-2000) : history;
    localStorage.setItem(key, JSON.stringify(capped));
  } catch { /* storage full */ }
}

export function appendTimelinePoint(
  ticker: string,
  existing: TimelinePoint[],
  point: TimelinePoint,
): TimelinePoint[] {
  // Deduplicate: skip if last point is too recent
  const last = existing[existing.length - 1];
  if (last && (point.time - last.time) < MIN_INTERVAL_MS) {
    return existing;
  }
  
  const next = [...existing, point];
  saveTimelineHistory(ticker, next);
  return next;
}

// Clean up old days
export function cleanOldTimelines(): void {
  try {
    const today = new Date().toISOString().slice(0, 10);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX) && !k.endsWith(today)) {
        localStorage.removeItem(k);
      }
    }
  } catch { /* ignore */ }
}
