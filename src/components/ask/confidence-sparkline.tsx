'use client';

import { useMemo, useRef, useState, useEffect } from 'react';
import type { ConfidencePoint } from '@/hooks/use-ml-prediction';
import { COLORS } from '@/lib/echarts-theme';

interface ConfidenceSparklineProps {
  history: ConfidencePoint[];
  height?: number;
  threshold?: number; // Default 80
}

/**
 * Intraday confidence sparkline for the Yodha Analysis panel.
 * Shows move_probability over time with direction-colored segments
 * and a dashed 80% threshold line.
 * Auto-sizes to container width.
 */
export function ConfidenceSparkline({
  history,
  height = 48,
  threshold = 80,
}: ConfidenceSparklineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(Math.floor(entry.contentRect.width));
      }
    });
    observer.observe(containerRef.current);
    // Set initial width
    setWidth(Math.floor(containerRef.current.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  if (history.length < 2) return <div ref={containerRef} />;

  return (
    <div ref={containerRef} className="w-full">
      <ConfidenceSparklineSVG history={history} width={width} height={height} threshold={threshold} />
    </div>
  );
}

function ConfidenceSparklineSVG({
  history,
  width,
  height,
  threshold,
}: {
  history: ConfidencePoint[];
  width: number;
  height: number;
  threshold: number;
}) {

  const { points, gradientStops, yMin, yMax, thresholdY, timeLabels } = useMemo(() => {
    const confidences = history.map(h => h.confidence);
    
    // Y-axis: 0-100 always (confidence is a percentage)
    const yMin = 0;
    const yMax = 100;
    const yRange = yMax - yMin;

    const padding = { top: 4, bottom: 14, left: 0, right: 0 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    // Map points to SVG coordinates
    const pts = history.map((h, i) => {
      const x = padding.left + (i / (history.length - 1)) * plotW;
      const y = padding.top + plotH - ((h.confidence - yMin) / yRange) * plotH;
      return { x, y, direction: h.direction, confidence: h.confidence, time: h.time };
    });

    // Build gradient stops for direction coloring
    const stops = pts.map((p, i) => {
      const offset = i / (pts.length - 1);
      const color = p.direction === 'BULLISH' ? COLORS.green
        : p.direction === 'BEARISH' ? COLORS.red
        : '#ffc107';
      return { offset, color };
    });

    // Threshold Y position
    const thY = padding.top + plotH - ((threshold - yMin) / yRange) * plotH;

    // Time labels (first and last)
    const fmt = (ms: number) => {
      const d = new Date(ms);
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    };
    const labels = {
      first: { text: fmt(history[0].time), x: padding.left },
      last: { text: fmt(history[history.length - 1].time), x: padding.left + plotW },
    };

    return { points: pts, gradientStops: stops, yMin, yMax, thresholdY: thY, timeLabels: labels };
  }, [history, width, height, threshold]);

  // SVG polyline path
  const linePath = points.map(p => `${p.x},${p.y}`).join(' ');

  // Area fill path (under the line)
  const areaPath = `M${points[0].x},${height - 14} ` +
    points.map(p => `L${p.x},${p.y}`).join(' ') +
    ` L${points[points.length - 1].x},${height - 14} Z`;

  const gradientId = `conf-grad-${Math.random().toString(36).slice(2, 8)}`;
  const areaGradientId = `conf-area-${Math.random().toString(36).slice(2, 8)}`;

  // Current direction for endpoint dot color
  const current = points[points.length - 1];
  const dotColor = current.direction === 'BULLISH' ? COLORS.green
    : current.direction === 'BEARISH' ? COLORS.red
    : '#ffc107';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="block"
      style={{ overflow: 'visible' }}
    >
      <defs>
        {/* Line gradient */}
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
          {gradientStops.map((s, i) => (
            <stop key={i} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
        {/* Area fill gradient (same colors, faded) */}
        <linearGradient id={areaGradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={dotColor} stopOpacity="0.15" />
          <stop offset="1" stopColor={dotColor} stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* 80% threshold line */}
      <line
        x1={0}
        y1={thresholdY}
        x2={width}
        y2={thresholdY}
        stroke="rgba(255,255,255,0.12)"
        strokeWidth="1"
        strokeDasharray="3,3"
      />
      <text
        x={width - 1}
        y={thresholdY - 3}
        textAnchor="end"
        fill="rgba(255,255,255,0.2)"
        fontSize="8"
        fontFamily="monospace"
      >
        80%
      </text>

      {/* Area fill */}
      <path
        d={areaPath}
        fill={`url(#${areaGradientId})`}
      />

      {/* Confidence line */}
      <polyline
        points={linePath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Current value dot */}
      <circle
        cx={current.x}
        cy={current.y}
        r="3"
        fill={dotColor}
      />
      <circle
        cx={current.x}
        cy={current.y}
        r="5"
        fill="none"
        stroke={dotColor}
        strokeWidth="1"
        strokeOpacity="0.4"
      />

      {/* Time labels */}
      <text
        x={timeLabels.first.x}
        y={height - 2}
        textAnchor="start"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="monospace"
      >
        {timeLabels.first.text}
      </text>
      <text
        x={timeLabels.last.x}
        y={height - 2}
        textAnchor="end"
        fill="rgba(255,255,255,0.25)"
        fontSize="8"
        fontFamily="monospace"
      >
        {timeLabels.last.text}
      </text>
    </svg>
  );
}
