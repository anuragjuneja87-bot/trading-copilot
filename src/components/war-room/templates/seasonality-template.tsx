'use client';

import { cn } from '@/lib/utils';

interface SeasonalityTemplateProps {
  data: {
    narrative: string;
    marketData: {
      prices: Record<string, any>;
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

export function SeasonalityTemplate({ data, onFollowUp }: SeasonalityTemplateProps) {
  const parsed = parseNarrative(data.narrative);
  const month = parsed?.month || new Date().toLocaleString('en-US', { month: 'long' });
  const patterns = parsed?.patterns || [];
  const currentAlignment = parsed?.currentAlignment || '';
  const riskAssessment = parsed?.riskAssessment || 'MEDIUM';
  const actionableNote = parsed?.actionableNote || '';

  const getRiskColor = (risk: string) => {
    const upper = risk.toUpperCase();
    if (upper === 'HIGH') return 'bg-[rgba(255,82,82,0.15)] border-[rgba(255,82,82,0.3)] text-[#ff5252]';
    if (upper === 'MEDIUM') return 'bg-[rgba(255,193,7,0.15)] border-[rgba(255,193,7,0.3)] text-[#ffc107]';
    return 'bg-[rgba(0,230,118,0.15)] border-[rgba(0,230,118,0.3)] text-[#00e676]';
  };

  const parseReturn = (ret: string) => {
    const num = parseFloat(ret.replace('%', ''));
    return { value: num, isPositive: num >= 0 };
  };

  const parseWinRate = (wr: string) => {
    return parseFloat(wr.replace('%', ''));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">{month.toUpperCase()} SEASONALITY ANALYSIS</h2>
          <p className="text-xs text-[#8b99b0] mt-1">Historical patterns & current alignment</p>
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
          {/* Patterns Table */}
          {patterns.length > 0 && (
            <div className="rounded-lg border overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.05)' }}>
              <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] px-4 py-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                Historical Patterns
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                {patterns.map((pattern: any, idx: number) => {
                  const ret = parseReturn(pattern.historicalAvgReturn || '0%');
                  const winRate = parseWinRate(pattern.winRate || '50%');
                  return (
                    <div key={idx} className="grid grid-cols-4 gap-4 px-4 py-3">
                      <div className="font-medium text-white">{pattern.ticker}</div>
                      <div className={cn('font-medium', ret.isPositive ? 'text-[#00e676]' : 'text-[#ff5252]')}>
                        {pattern.historicalAvgReturn}
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(139,153,176,0.2)' }}>
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${winRate}%`, background: '#00e676' }}
                          />
                        </div>
                        <span className="text-xs text-[#8b99b0]">{pattern.winRate}</span>
                      </div>
                      <div className="text-xs text-[#8b99b0]">{pattern.note || ''}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current Alignment */}
          {currentAlignment && (
            <div className="flex items-start gap-2 p-4 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <span className="text-lg">📊</span>
              <div className="flex-1">
                <div className="text-[9px] uppercase tracking-wider text-[#8b99b0] mb-1">Current Alignment</div>
                <p className="text-sm text-[#8b99b0] leading-relaxed">{currentAlignment}</p>
              </div>
            </div>
          )}

          {/* Risk Assessment */}
          <div className="flex items-center justify-between">
            <div className="text-[9px] uppercase tracking-wider text-[#8b99b0]">Risk Assessment</div>
            <span className={`px-3 py-1.5 rounded-full border font-semibold text-xs ${getRiskColor(riskAssessment)}`}>
              {riskAssessment}
            </span>
          </div>

          {/* Actionable Note */}
          {actionableNote && (
            <div className="flex items-start gap-2 p-4 rounded-lg border" style={{ background: 'rgba(0,229,255,0.05)', borderColor: 'rgba(0,229,255,0.2)' }}>
              <span className="text-lg">⚡</span>
              <div className="flex-1">
                <div className="text-[9px] uppercase tracking-wider text-[#00e5ff] mb-1">Actionable</div>
                <p className="text-sm text-[#e0e6f0] font-medium leading-relaxed">{actionableNote}</p>
              </div>
            </div>
          )}
        </>
      )}

      {/* Follow-up pills */}
      <div className="flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
        <button
          onClick={() => onFollowUp?.(`How does VIX affect ${month} performance?`)}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          How does VIX affect {month} performance?
        </button>
        <button
          onClick={() => onFollowUp?.(`Compare vs last year's ${month}`)}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          Compare vs last year's {month}
        </button>
        <button
          onClick={() => onFollowUp?.(`Hedge strategies for ${month}`)}
          className="text-[10px] px-3 py-1.5 rounded-full border transition-colors"
          style={{
            background: 'rgba(255,255,255,0.02)',
            borderColor: 'rgba(0,229,255,0.3)',
            color: '#00e5ff',
          }}
        >
          Hedge strategies for {month}
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
