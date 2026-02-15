'use client';

import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';

interface TickerData {
  ticker: string;
  price: number;
  prevClose: number;
  change: number;
  changePercent: number;
  gap: number;
  gapPercent: number;
  volume: number;
  callWall?: number;
  putWall?: number;
  maxGamma?: number;
}

interface PremarketTemplateProps {
  data: {
    tickers: TickerData[];
    marketStatus: string;
    timestamp: string;
  };
  onFollowUp?: (query: string) => void;
}

function formatVolume(volume: number): string {
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

export function PremarketTemplate({ data, onFollowUp }: PremarketTemplateProps) {
  const { tickers, marketStatus, timestamp } = data;
  const spyTicker = tickers.find(t => t.ticker === 'SPY');

  const handleFollowUp = (query: string) => {
    if (onFollowUp) {
      onFollowUp(query);
    }
  };

  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-white mb-1">PRE-MARKET SETUP</h2>
          <p className="text-xs text-[#8b99b0]">
            {formatDistanceToNow(new Date(timestamp), { addSuffix: true })} · {marketStatus}
          </p>
        </div>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(0,230,118,0.15)', color: '#00e676' }}
        >
          ⚡ &lt;1s
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto mb-6">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.05)]">
              <th className="text-left py-2 text-[9px] uppercase tracking-wider" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                Ticker
              </th>
              <th className="text-right py-2 text-[9px] uppercase tracking-wider" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                Price
              </th>
              <th className="text-right py-2 text-[9px] uppercase tracking-wider" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                Gap
              </th>
              <th className="text-right py-2 text-[9px] uppercase tracking-wider" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                Volume
              </th>
              {spyTicker && (
                <th className="text-right py-2 text-[9px] uppercase tracking-wider" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                  Key Levels
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {tickers.map((ticker) => (
              <tr key={ticker.ticker} className="border-b border-[rgba(255,255,255,0.03)]">
                <td className="py-3">
                  <span className="font-semibold text-white">{ticker.ticker}</span>
                </td>
                <td className="text-right py-3">
                  <span className="font-mono text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                    ${ticker.price.toFixed(2)}
                  </span>
                </td>
                <td className="text-right py-3">
                  <span
                    className={cn(
                      'font-mono font-semibold',
                      ticker.gapPercent >= 0 ? 'text-[#00e676]' : 'text-[#ff5252]'
                    )}
                    style={{ fontFamily: "'Oxanium', monospace" }}
                  >
                    {ticker.gapPercent >= 0 ? '+' : ''}{ticker.gapPercent.toFixed(2)}%
                  </span>
                </td>
                <td className="text-right py-3">
                  <span className="text-sm text-[#8b99b0]" style={{ fontFamily: "'Oxanium', monospace" }}>
                    {formatVolume(ticker.volume)}
                  </span>
                </td>
                {spyTicker && ticker.ticker === 'SPY' && (
                  <td className="text-right py-3">
                    <div className="flex flex-col gap-1 text-xs">
                      <span className="text-[#00e5ff]" style={{ fontFamily: "'Oxanium', monospace" }}>
                        C: ${ticker.callWall?.toFixed(0) || 'N/A'}
                      </span>
                      <span className="text-[#ff5252]" style={{ fontFamily: "'Oxanium', monospace" }}>
                        P: ${ticker.putWall?.toFixed(0) || 'N/A'}
                      </span>
                      <span className="text-[#00e5ff]" style={{ fontFamily: "'Oxanium', monospace" }}>
                        γ: ${ticker.maxGamma?.toFixed(0) || 'N/A'}
                      </span>
                    </div>
                  </td>
                )}
                {spyTicker && ticker.ticker !== 'SPY' && <td className="text-right py-3" />}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {tickers.length > 0 && (
          <button
            onClick={() => handleFollowUp(`Full thesis for ${tickers[0].ticker}`)}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            Full thesis for {tickers[0].ticker}
          </button>
        )}
        <button
          onClick={() => handleFollowUp('Analyze gaps vs levels')}
          className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
        >
          Analyze gaps vs levels
        </button>
        {spyTicker && (
          <button
            onClick={() => handleFollowUp('SPY gamma squeeze risk')}
            className="px-3 py-1.5 rounded-full text-xs bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)] text-[#8b99b0] hover:text-white transition-colors"
          >
            SPY gamma squeeze risk
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
