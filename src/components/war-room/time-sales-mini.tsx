'use client';

import { COLORS } from '@/lib/echarts-theme';

interface Trade {
  timestamp: number;
  strike: number;
  callPut: 'C' | 'P';
  premium: number;
  isSweep?: boolean;
  aggression?: string;
}

interface TimeSalesMiniProps {
  trades: Trade[];
}

export function TimeSalesMini({ trades }: TimeSalesMiniProps) {
  const recentTrades = trades
    .filter(t => t.premium > 10000) // Only show $10K+ trades
    .slice(0, 5);

  if (recentTrades.length === 0) {
    return (
      <div className="text-[10px] text-gray-500 text-center py-2">
        No significant trades
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      {recentTrades.map((trade, i) => (
        <div 
          key={i}
          className="flex items-center justify-between text-[10px] px-1 py-0.5 rounded"
          style={{ background: 'rgba(255,255,255,0.02)' }}
        >
          <div className="flex items-center gap-1">
            <span 
              className="font-mono font-semibold"
              style={{ color: trade.callPut === 'C' ? COLORS.green : COLORS.red }}
            >
              ${trade.strike}{trade.callPut}
            </span>
            {trade.isSweep && (
              <span className="px-1 rounded text-[8px] bg-cyan-500/20 text-cyan-400">
                SWP
              </span>
            )}
          </div>
          <span className="text-gray-400 font-mono">
            ${(trade.premium / 1000).toFixed(0)}K
          </span>
        </div>
      ))}
    </div>
  );
}
