'use client';

import { cn } from '@/lib/utils';

interface BullishSetupsTemplateProps {
  data: {
    narrative: string;
    marketData: {
      prices: Record<string, { price: number; changePercent: number; volume: number }>;
      levels: { callWall: number; putWall: number; maxGamma: number; currentPrice: number } | null;
      regime: { status: string; vix: number };
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

export function BullishSetupsTemplate({ data, onFollowUp }: BullishSetupsTemplateProps) {
  const parsed = parseNarrative(data.narrative);
  const setups = parsed?.setups || [];
  const marketBias = parsed?.marketBias || 'Neutral market conditions.';

  const getBiasColor = (bias: string) => {
    const lower = bias.toLowerCase();
    if (lower.includes('bullish')) return 'bg-[rgba(0,230,118,0.15)] border-[rgba(0,230,118,0.3)] text-[#00e676]';
    if (lower.includes('bearish')) return 'bg-[rgba(255,82,82,0.15)] border-[rgba(255,82,82,0.3)] text-[#ff5252]';
    return 'bg-[rgba(255,193,7,0.15)] border-[rgba(255,193,7,0.3)] text-[#ffc107]';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">BULLISH SETUPS</h2>
          <p className="text-xs text-[#8b99b0] mt-1">Live market analysis</p>
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

      {/* Setups */}
      {parsed && (
        <>
          <div className="space-y-4">
            {setups.map((setup: any, idx: number) => (
              <div
                key={idx}
                className="rounded-lg p-4 border"
                style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-bold text-white">{setup.ticker}</span>
                    <span
                      className="text-[9px] px-2 py-0.5 rounded-full font-bold"
                      style={{ background: 'rgba(0,229,255,0.15)', color: '#00e5ff' }}
                    >
                      {setup.setupType || 'Setup'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{
                          background: i < (setup.conviction || 3) ? '#00e5ff' : 'rgba(139,153,176,0.3)',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Entry / Target / Stop */}
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] mb-1">Entry</div>
                    <div className="text-sm font-mono text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                      {setup.entry || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] mb-1">Target</div>
                    <div className="text-sm font-mono text-[#00e676]" style={{ fontFamily: "'Oxanium', monospace" }}>
                      {setup.target || 'N/A'}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] mb-1">Stop</div>
                    <div className="text-sm font-mono text-[#ff5252]" style={{ fontFamily: "'Oxanium', monospace" }}>
                      {setup.stop || 'N/A'}
                    </div>
                  </div>
                </div>

                {/* Reasoning */}
                {setup.reasoning && (
                  <div className="pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                    <p className="text-[11px] text-[#8b99b0] leading-relaxed">{setup.reasoning}</p>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Market Bias */}
          <div className={`rounded-lg p-4 border ${getBiasColor(marketBias)}`}>
            <div className="text-[9px] uppercase tracking-wider mb-2">Market Bias</div>
            <p className="text-sm leading-relaxed">{marketBias}</p>
          </div>
        </>
      )}

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        {setups.length > 0 && (
          <button
            onClick={() => onFollowUp?.(`Full thesis for ${setups[0].ticker}`)}
            className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
            style={{
              background: 'rgba(255,255,255,0.02)',
              borderColor: 'rgba(0,229,255,0.3)',
              color: '#00e5ff',
            }}
          >
            Full thesis for {setups[0].ticker}
          </button>
        )}
        <button
          onClick={() => onFollowUp?.('Show me flow for these tickers')}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          Show me flow for these tickers
        </button>
        <button
          onClick={() => onFollowUp?.('Key levels breakdown')}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          Key levels breakdown
        </button>
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
