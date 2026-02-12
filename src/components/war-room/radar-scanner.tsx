'use client';

import { useEffect, useState } from 'react';

const SCANNER_SEGMENTS = ['Price', 'Flow', 'Gamma', 'News', 'Sentiment', 'Volume'];

interface RadarScannerProps {
  activeSegments?: number[];
  completedSegments?: number[];
  centerData?: {
    ticker?: string;
    price?: string;
    status?: string;
  };
  currentStep?: string;
  elapsed?: number;
  onCancel?: () => void;
}

export function RadarScanner({
  activeSegments = [],
  completedSegments = [],
  centerData = {},
  currentStep = 'Initializing...',
  elapsed = 0,
  onCancel,
}: RadarScannerProps) {
  const [sweepRotation, setSweepRotation] = useState(0);

  useEffect(() => {
    if (activeSegments.length > 0 && !activeSegments.every((i) => completedSegments.includes(i))) {
      const interval = setInterval(() => {
        setSweepRotation((prev) => (prev + 2) % 360);
      }, 16); // ~60fps
      return () => clearInterval(interval);
    }
  }, [activeSegments, completedSegments]);

  const cx = 110;
  const cy = 110;
  const r = 85;

  return (
    <div className="space-y-4">
      <div className="relative" style={{ width: 220, height: 220, margin: '0 auto' }}>
        <svg width="220" height="220" viewBox="0 0 220 220">
          {/* Concentric circles */}
          {[85, 60, 35].map((rad) => (
            <circle
              key={rad}
              cx={cx}
              cy={cy}
              r={rad}
              fill="none"
              stroke="rgba(0,229,255,0.06)"
              strokeWidth="0.5"
            />
          ))}

          {/* Radial lines */}
          {SCANNER_SEGMENTS.map((_, i) => {
            const a = ((i * 60 - 90) * Math.PI) / 180;
            return (
              <line
                key={i}
                x1={cx}
                y1={cy}
                x2={cx + r * Math.cos(a)}
                y2={cy + r * Math.sin(a)}
                stroke="rgba(0,229,255,0.08)"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Segments */}
          {SCANNER_SEGMENTS.map((seg, i) => {
            const startA = ((i * 60 - 90) * Math.PI) / 180;
            const endA = (((i + 1) * 60 - 90) * Math.PI) / 180;
            const midA = ((i * 60 + 30 - 90) * Math.PI) / 180;
            const isActive = activeSegments.includes(i);
            const isComplete = completedSegments.includes(i);
            const x1 = cx + r * Math.cos(startA);
            const y1 = cy + r * Math.sin(startA);
            const x2 = cx + r * Math.cos(endA);
            const y2 = cy + r * Math.sin(endA);
            const lx = cx + (r + 14) * Math.cos(midA);
            const ly = cy + (r + 14) * Math.sin(midA);

            return (
              <g key={i}>
                <path
                  d={`M${cx},${cy} L${x1},${y1} A${r},${r} 0 0,1 ${x2},${y2} Z`}
                  fill={
                    isComplete
                      ? 'rgba(0,230,118,0.08)'
                      : isActive
                      ? 'rgba(0,229,255,0.12)'
                      : 'rgba(255,255,255,0.01)'
                  }
                  stroke={
                    isComplete
                      ? 'rgba(0,230,118,0.3)'
                      : isActive
                      ? 'rgba(0,229,255,0.4)'
                      : 'rgba(255,255,255,0.04)'
                  }
                  strokeWidth="1"
                  style={{ transition: 'all 0.6s ease' }}
                />
                <text
                  x={lx}
                  y={ly}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isComplete ? '#00e676' : isActive ? '#00e5ff' : '#2a4a5a'}
                  fontSize="7"
                  fontWeight="700"
                  fontFamily="'Oxanium', monospace"
                  letterSpacing="0.5"
                >
                  {seg.toUpperCase()}
                </text>
                {isComplete && (
                  <text
                    x={cx + 55 * Math.cos(midA)}
                    y={cy + 55 * Math.sin(midA)}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#00e676"
                    fontSize="10"
                  >
                    ✓
                  </text>
                )}
              </g>
            );
          })}

          {/* Sweep line */}
          {activeSegments.length > 0 && !activeSegments.every((i) => completedSegments.includes(i)) && (
            <g>
              <animateTransform
                attributeName="transform"
                attributeType="XML"
                type="rotate"
                from={`0 ${cx} ${cy}`}
                to={`360 ${cx} ${cy}`}
                dur="3s"
                repeatCount="indefinite"
              />
              <line
                x1={cx}
                y1={cy}
                x2={cx + r}
                y2={cy}
                stroke="#00e5ff"
                strokeWidth="1.5"
                opacity="0.6"
              />
            </g>
          )}
        </svg>

        {/* Center content */}
        <div
          className="absolute"
          style={{
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
          }}
        >
          {centerData.ticker && (
            <>
              <div
                style={{
                  fontSize: '16px',
                  fontWeight: 800,
                  color: '#fff',
                  fontFamily: "'Oxanium', monospace",
                  letterSpacing: '2px',
                }}
              >
                {centerData.ticker}
              </div>
              {centerData.price && (
                <div
                  style={{
                    fontSize: '13px',
                    color: '#00e5ff',
                    fontWeight: 600,
                    fontFamily: "'Oxanium', monospace",
                    marginTop: '2px',
                  }}
                >
                  {centerData.price}
                </div>
              )}
              {centerData.status && (
                <div
                  style={{
                    fontSize: '8px',
                    color: '#4a6070',
                    letterSpacing: '1px',
                    marginTop: '4px',
                  }}
                >
                  {centerData.status}
                </div>
              )}
            </>
          )}
          {!centerData.ticker && (
            <div
              style={{
                fontSize: '8px',
                color: '#2a4a5a',
                letterSpacing: '1.5px',
                fontFamily: "'Oxanium', monospace",
              }}
            >
              SCANNING
            </div>
          )}
        </div>
      </div>

      {/* Status text and timer */}
      <div className="space-y-2 text-center">
        <div className="text-sm text-[#8b99b0]">{currentStep}</div>
        <div
          className="text-2xl font-bold"
          style={{ color: '#00e5ff', fontFamily: "'Oxanium', monospace" }}
        >
          {elapsed}s
        </div>
        {onCancel && (
          <button
            onClick={onCancel}
            className="text-xs text-[#6b7a99] hover:text-red-400 transition-colors flex items-center gap-1 mx-auto"
          >
            <span>✕</span>
            <span>Cancel</span>
          </button>
        )}
      </div>
    </div>
  );
}
