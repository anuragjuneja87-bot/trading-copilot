'use client';

import { COLORS } from '@/lib/echarts-theme';

interface KeyLevelsDisplayProps {
  currentPrice: number;
  callWall: number;
  putWall: number;
  maxGamma: number;
  source: string;
}

export function KeyLevelsDisplay({ currentPrice, callWall, putWall, maxGamma, source }: KeyLevelsDisplayProps) {
  const levels = [
    {
      label: 'CALL WALL',
      value: callWall,
      description: 'Resistance — max call open interest',
      color: COLORS.green,
      glow: COLORS.glowGreen,
      distance: currentPrice > 0 ? (((callWall - currentPrice) / currentPrice) * 100).toFixed(2) : '0',
      direction: 'above',
    },
    {
      label: 'MAX GAMMA',
      value: maxGamma,
      description: 'Magnetic pin — highest total gamma',
      color: COLORS.cyan,
      glow: COLORS.glowCyan,
      distance: currentPrice > 0 ? (((maxGamma - currentPrice) / currentPrice) * 100).toFixed(2) : '0',
      direction: maxGamma >= currentPrice ? 'above' : 'below',
    },
    {
      label: 'CURRENT PRICE',
      value: currentPrice,
      description: 'Last traded price',
      color: '#ffffff',
      glow: 'rgba(255,255,255,0.1)',
      distance: '0.00',
      direction: 'current',
    },
    {
      label: 'PUT WALL',
      value: putWall,
      description: 'Support — max put open interest',
      color: COLORS.red,
      glow: COLORS.glowRed,
      distance: currentPrice > 0 ? (((putWall - currentPrice) / currentPrice) * 100).toFixed(2) : '0',
      direction: 'below',
    },
  ];

  return (
    <div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {levels.map((level) => (
          <div
            key={level.label}
            className="rounded-xl p-4 text-center relative overflow-hidden"
            style={{
              background: level.glow,
              border: `1px solid ${level.color}33`,
            }}
          >
            {/* Subtle glow at top */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-1 rounded-b-full"
              style={{ background: level.color, opacity: 0.4 }} />

            <div className="text-[9px] uppercase tracking-wider mb-2 font-bold"
              style={{ color: level.color, fontFamily: "'Oxanium', monospace" }}>
              {level.label}
            </div>
            <div className="text-2xl font-black mb-1"
              style={{ color: level.color, fontFamily: "'Oxanium', monospace" }}>
              ${level.value.toFixed(level.value > 999 ? 0 : 2)}
            </div>
            {level.direction !== 'current' && (
              <div className="text-[10px] mt-1"
                style={{ color: '#4a6070', fontFamily: "'Oxanium', monospace" }}>
                {parseFloat(level.distance) >= 0 ? '+' : ''}{level.distance}% from price
              </div>
            )}
            <div className="text-[9px] mt-2 text-[#4a6070]">
              {level.description}
            </div>
          </div>
        ))}
      </div>

      {/* Source indicator */}
      <div className="text-[9px] text-[#2a4a5a] text-right mt-2" style={{ fontFamily: "'Oxanium', monospace" }}>
        Source: {source === 'calculated' ? 'Live options chain' : 'Estimated from price'}
      </div>
    </div>
  );
}
