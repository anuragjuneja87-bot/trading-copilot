'use client';

import { cn } from '@/lib/utils';

interface EODSummaryTemplateProps {
  data: {
    narrative: string;
    marketData: {
      prices: Record<string, any>;
      levels: any;
      regime: any;
      news: any[];
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

export function EODSummaryTemplate({ data, onFollowUp }: EODSummaryTemplateProps) {
  const parsed = parseNarrative(data.narrative);
  const summary = parsed?.summary || '';
  const keyMoves = parsed?.keyMoves || [];
  const newsImpact = parsed?.newsImpact || '';
  const tomorrowSetup = parsed?.tomorrowSetup || '';
  const bias = parsed?.bias || 'NEUTRAL';

  const getBiasColor = (bias: string) => {
    const upper = bias.toUpperCase();
    if (upper.includes('BULLISH')) return 'bg-[rgba(0,230,118,0.15)] border-[rgba(0,230,118,0.3)] text-[#00e676]';
    if (upper.includes('BEARISH')) return 'bg-[rgba(255,82,82,0.15)] border-[rgba(255,82,82,0.3)] text-[#ff5252]';
    return 'bg-[rgba(255,193,7,0.15)] border-[rgba(255,193,7,0.3)] text-[#ffc107]';
  };

  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">END OF DAY SUMMARY</h2>
          <p className="text-xs text-[#8b99b0] mt-1">{today}</p>
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
          {/* Summary */}
          {summary && (
            <div className="p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-sm text-[#e0e6f0] leading-relaxed">{summary}</p>
            </div>
          )}

          {/* Key Moves Table */}
          {keyMoves.length > 0 && (
            <div className="rounded-lg border overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] px-4 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                Key Moves
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {keyMoves.map((move: any, idx: number) => (
                  <div key={idx} className="grid grid-cols-3 gap-4 px-4 py-3">
                    <div className="font-medium text-white">{move.ticker}</div>
                    <div className={cn('font-medium', move.move?.startsWith('+') ? 'text-[#00e676]' : 'text-[#ff5252]')}>
                      {move.move}
                    </div>
                    <div className="text-sm text-[#8b99b0]">{move.note || ''}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* News Impact */}
          {newsImpact && (
            <div className="flex items-start gap-2 p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-lg">📰</span>
              <p className="text-sm text-[#8b99b0] flex-1">{newsImpact}</p>
            </div>
          )}

          {/* Tomorrow Setup */}
          {tomorrowSetup && (
            <div className="p-4 rounded-lg border-l-2" style={{ background: 'rgba(0,229,255,0.05)', borderLeftColor: '#00e5ff', borderColor: 'rgba(0,229,255,0.2)' }}>
              <div className="text-[9px] uppercase tracking-wider text-[#00e5ff] mb-2">Tomorrow's Setup</div>
              <p className="text-sm text-[#e0e6f0] leading-relaxed">{tomorrowSetup}</p>
            </div>
          )}

          {/* Bias Badge */}
          <div className="flex justify-end">
            <span className={`px-4 py-2 rounded-lg border font-semibold text-sm ${getBiasColor(bias)}`}>
              {bias}
            </span>
          </div>
        </>
      )}

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => onFollowUp?.("Full thesis for tomorrow")}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          Full thesis for tomorrow
        </button>
        <button
          onClick={() => onFollowUp?.("After-hours flow")}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          After-hours flow
        </button>
        <button
          onClick={() => onFollowUp?.("Key levels for tomorrow")}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          Key levels for tomorrow
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
