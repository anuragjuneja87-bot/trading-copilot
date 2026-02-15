'use client';

import { cn } from '@/lib/utils';

interface GapData {
  ticker: string;
  price: number;
  prevClose: number;
  gap: number;
  gapPercent: number;
  direction: 'up' | 'down';
  volume?: number;
}

interface GapsTemplateProps {
  data: {
    watchlistGaps: GapData[];
    topMovers: GapData[];
  };
  onFollowUp?: (query: string) => void;
}

function formatVolume(volume?: number): string {
  if (!volume) return 'N/A';
  if (volume >= 1_000_000_000) {
    return `${(volume / 1_000_000_000).toFixed(2)}B`;
  }
  if (volume >= 1_000_000) {
    return `${(volume / 1_000_000).toFixed(2)}M`;
  }
  if (volume >= 1_000) {
    return `${(volume / 1_000).toFixed(2)}K`;
  }
  return volume.toString();
}

export function GapsTemplate({ data, onFollowUp }: GapsTemplateProps) {
  const { watchlistGaps, topMovers } = data;

  // Find max absolute gap for bar scaling
  const allGaps = [...watchlistGaps, ...topMovers];
  const maxGap = Math.max(...allGaps.map(g => Math.abs(g.gapPercent)), 1);

  const biggestGapTicker = allGaps.reduce((max, gap) =>
    Math.abs(gap.gapPercent) > Math.abs(max.gapPercent) ? gap : max,
    allGaps[0] || { ticker: '', gapPercent: 0 }
  );

  const handleFollowUp = (query: string) => {
    if (onFollowUp) {
      onFollowUp(query);
    }
  };

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-white">OVERNIGHT GAPS</h2>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(0,230,118,0.15)', color: '#00e676' }}
        >
          ⚡ &lt;1s
        </span>
      </div>

      {/* Watchlist Section */}
      {watchlistGaps.length > 0 && (
        <div className="mb-8">
          <h3
            className="text-[9px] uppercase tracking-wider mb-4"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}
          >
            WATCHLIST GAPS
          </h3>
          <div className="space-y-3">
            {watchlistGaps.map((gap) => {
              const barWidth = (Math.abs(gap.gapPercent) / maxGap) * 100;
              return (
                <div key={gap.ticker} className="flex items-center gap-4">
                  <div className="w-16">
                    <span className="font-semibold text-white">{gap.ticker}</span>
                  </div>
                  <div className="flex-1 relative h-6 bg-[rgba(255,255,255,0.03)] rounded overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded transition-all',
                        gap.direction === 'up' ? 'bg-[#00e676]' : 'bg-[#ff5252]'
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="w-20 text-right">
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        gap.direction === 'up' ? 'text-[#00e676]' : 'text-[#ff5252]'
                      )}
                      style={{ fontFamily: "'Oxanium', monospace" }}
                    >
                      {gap.gapPercent >= 0 ? '+' : ''}{gap.gapPercent.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Top Movers Section */}
      {topMovers.length > 0 && (
        <div className="mb-6">
          <h3
            className="text-[9px] uppercase tracking-wider mb-4"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}
          >
            MARKET TOP MOVERS
          </h3>
          <div className="space-y-3 opacity-70">
            {topMovers.map((gap) => {
              const barWidth = (Math.abs(gap.gapPercent) / maxGap) * 100;
              return (
                <div key={gap.ticker} className="flex items-center gap-4">
                  <div className="w-16">
                    <span className="font-semibold text-white">{gap.ticker}</span>
                  </div>
                  <div className="flex-1 relative h-6 bg-[rgba(255,255,255,0.03)] rounded overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded transition-all',
                        gap.direction === 'up' ? 'bg-[#00e676]' : 'bg-[#ff5252]'
                      )}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                  <div className="w-20 text-right">
                    <span
                      className={cn(
                        'font-mono font-semibold',
                        gap.direction === 'up' ? 'text-[#00e676]' : 'text-[#ff5252]'
                      )}
                      style={{ fontFamily: "'Oxanium', monospace" }}
                    >
                      {gap.gapPercent >= 0 ? '+' : ''}{gap.gapPercent.toFixed(2)}%
                    </span>
                  </div>
                  {gap.volume && (
                    <div className="w-16 text-right">
                      <span className="text-xs text-[#8b99b0]" style={{ fontFamily: "'Oxanium', monospace" }}>
                        {formatVolume(gap.volume)}
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {biggestGapTicker.ticker && (
          <button
            onClick={() => handleFollowUp(`Gap fill probability for ${biggestGapTicker.ticker}`)}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            Gap fill probability for {biggestGapTicker.ticker}
          </button>
        )}
        <button
          onClick={() => handleFollowUp('Flow for gap-up names')}
          className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
        >
          Flow for gap-up names
        </button>
        {watchlistGaps.length > 0 && (
          <button
            onClick={() => handleFollowUp(`Analyze overnight flow for ${watchlistGaps.map(g => g.ticker).join(', ')}`)}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            Analyze overnight flow
          </button>
        )}
      </div>

      {/* New Analysis button */}
      <button
        onClick={() => handleFollowUp('__NEW_ANALYSIS__')}
        className="text-xs text-[#8b99b0] hover:text-white transition-colors"
      >
        ← New Analysis
      </button>
    </div>
  );
}
