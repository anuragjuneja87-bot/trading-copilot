'use client';

import { COLORS } from '@/lib/echarts-theme';
import type { DarkPoolPrint } from '@/types/darkpool';

interface DPPrintsTableProps {
  prints: DarkPoolPrint[];
}

export function DPPrintsTable({ prints }: DPPrintsTableProps) {
  return (
    <div className="overflow-x-auto rounded-lg" style={{ border: `1px solid ${COLORS.cardBorder}` }}>
      <table className="w-full">
        <thead>
          <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
            {['Ticker', 'Price', 'Size', 'Value', 'Side', 'Significance', 'Time'].map(h => (
              <th key={h} className="px-4 py-3 text-left text-[9px] uppercase tracking-wider"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {prints.map((p) => (
            <tr key={p.id}
              className="transition-colors hover:bg-[rgba(0,229,255,0.03)]"
              style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
              {/* Ticker */}
              <td className="px-4 py-2.5">
                <span className="text-[12px] font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                  {p.ticker}
                </span>
              </td>
              {/* Price */}
              <td className="px-4 py-2.5">
                <span className="text-[12px] text-[#e0e6f0]" style={{ fontFamily: "'Oxanium', monospace" }}>
                  ${p.price.toFixed(2)}
                </span>
              </td>
              {/* Size */}
              <td className="px-4 py-2.5">
                <span className="text-[12px] text-[#8b99b0]" style={{ fontFamily: "'Oxanium', monospace" }}>
                  {(p.size).toLocaleString()}
                </span>
              </td>
              {/* Value */}
              <td className="px-4 py-2.5">
                <span className="text-[12px] font-semibold" style={{
                  fontFamily: "'Oxanium', monospace",
                  color: p.value >= 10_000_000 ? COLORS.cyan
                    : p.value >= 5_000_000 ? COLORS.green
                    : p.value >= 1_000_000 ? COLORS.yellow
                    : '#e0e6f0',
                }}>
                  ${(p.value / 1e6).toFixed(2)}M
                </span>
              </td>
              {/* Side */}
              <td className="px-4 py-2.5">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{
                    background: p.side === 'BULLISH' ? COLORS.glowGreen
                      : p.side === 'BEARISH' ? COLORS.glowRed
                      : 'rgba(255,255,255,0.05)',
                    color: p.side === 'BULLISH' ? COLORS.green
                      : p.side === 'BEARISH' ? COLORS.red
                      : COLORS.muted,
                    fontFamily: "'Oxanium', monospace",
                  }}>
                  {p.side}
                </span>
              </td>
              {/* Significance */}
              <td className="px-4 py-2.5">
                <span className="text-[11px]" style={{
                  color: p.significance >= 4 ? COLORS.cyan : p.significance >= 3 ? COLORS.yellow : COLORS.muted,
                }}>
                  {'●'.repeat(p.significance)}{'○'.repeat(5 - p.significance)}
                </span>
              </td>
              {/* Time */}
              <td className="px-4 py-2.5">
                <span className="text-[11px] text-[#4a6070]" style={{ fontFamily: "'Oxanium', monospace" }}>
                  {new Date(p.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
