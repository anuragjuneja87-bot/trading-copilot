'use client';

import { cn } from '@/lib/utils';

interface AfterhoursTemplateProps {
  data: {
    narrative: string;
    marketData: {
      prices: Record<string, any>;
      gaps: Array<{ ticker: string; gapPercent: number; direction: string }>;
      regime: any;
    };
    elapsed: number;
  };
  onFollowUp?: (query: string) => void;
}

const parseNarrative = (narrative: string) => {
  try {
    const cleaned = narrative.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.warn('Failed to parse DIM 2 narrative as JSON:', err);
    return null;
  }
};

export function AfterhoursTemplate({ data, onFollowUp }: AfterhoursTemplateProps) {
  const parsed = parseNarrative(data.narrative);
  const topMovers = parsed?.topMovers || [];
  const marketOutlook = parsed?.marketOutlook || '';
  const tomorrowSetups = parsed?.tomorrowSetups || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">AFTER-HOURS MOVERS</h2>
          <p className="text-xs text-[#8b99b0] mt-1">Extended hours activity</p>
        </div>
        <span
          className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
          style={{ background: 'rgba(0,229,255,0.15)', color: '#00e5ff' }}
        >
          ⏱ {data.elapsed.toFixed(1)}s
        </span>
      </div>

      {/* Fallback if JSON parsing fails */}
      {!parsed && (
        <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <p className="text-sm text-[#8b99b0] whitespace-pre-wrap">{data.narrative}</p>
        </div>
      )}

      {parsed && (
        <>
          {/* Top Movers */}
          <div className="space-y-3">
            {topMovers.map((mover: any, idx: number) => (
              <div
                key={idx}
                className="rounded-lg p-4 border"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-lg font-bold text-white">{mover.ticker}</span>
                  <span className={cn('text-lg font-bold', mover.move?.startsWith('+') ? 'text-[#00e676]' : 'text-[#ff5252]')}>
                    {mover.move}
                  </span>
                </div>
                {mover.reason && (
                  <p className="text-sm text-[#8b99b0] mb-2">{mover.reason}</p>
                )}
                {mover.tomorrowImplication && (
                  <div className="pt-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] mb-1">Tomorrow</div>
                    <p className="text-xs text-[#8b99b0]">{mover.tomorrowImplication}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Market Outlook */}
          {marketOutlook && (
            <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] mb-2">Market Outlook</div>
              <p className="text-sm text-[#e0e6f0] leading-relaxed">{marketOutlook}</p>
            </div>
          )}

          {/* Tomorrow Setups */}
          {tomorrowSetups.length > 0 && (
            <div className="space-y-3">
              <div className="text-[9px] uppercase tracking-wider text-[#8b99b0]">Tomorrow Setups</div>
              {tomorrowSetups.map((setup: any, idx: number) => (
                <div
                  key={idx}
                  className="rounded-lg p-4 border"
                  style={{ background: 'rgba(0,229,255,0.05)', borderColor: 'rgba(0,229,255,0.2)' }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium text-white">{setup.ticker}</span>
                  </div>
                  <p className="text-sm text-[#e0e6f0] mb-2">{setup.setup}</p>
                  {setup.risk && (
                    <div className="pt-2 border-t" style={{ borderColor: 'rgba(0,229,255,0.2)' }}>
                      <div className="text-[9px] uppercase tracking-wider text-[#ffc107] mb-1">Risk</div>
                      <p className="text-xs text-[#8b99b0]">{setup.risk}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        {topMovers.length > 0 && (
          <button
            onClick={() => onFollowUp?.(`Pre-market setup for ${topMovers[0].ticker}`)}
            className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderColor: 'rgba(0,229,255,0.3)',
              color: '#00e5ff',
            }}
          >
            Pre-market setup for {topMovers[0].ticker}
          </button>
        )}
        {topMovers.length > 0 && (
          <button
            onClick={() => onFollowUp?.(`Full thesis for ${topMovers[0].ticker}`)}
            className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderColor: 'rgba(0,229,255,0.3)',
              color: '#00e5ff',
            }}
          >
            Full thesis for {topMovers[0].ticker}
          </button>
        )}
        <button
          onClick={() => onFollowUp?.('__NEW_ANALYSIS__')}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(139,153,176,0.3)',
            color: '#8b99b0',
          }}
        >
          ← New Analysis
        </button>
      </div>
    </div>
  );
}
