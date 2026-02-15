'use client';

import { useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';
import { COLORS } from '@/lib/echarts-theme';

interface SpokeSummaryProps {
  symbol: string;
  flowRegime?: string;
  darkPoolRegime?: string;
  levels?: { callWall: number; putWall: number; maxGamma: number; currentPrice: number };
  stats?: any; // flow stats
  onAskAI?: (query: string) => void;
}

export function SpokeSummary({ symbol, flowRegime, darkPoolRegime, levels, stats, onAskAI }: SpokeSummaryProps) {
  const [thesis, setThesis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const refreshThesis = useCallback(async () => {
    setLoading(true);
    setThesis(null);
    const start = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);

    try {
      const res = await fetch('/api/ai/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateType: 'symbol_thesis',
          tickers: [symbol],
          context: { flowRegime, darkPoolRegime, levels, stats },
        }),
      });
      const data = await res.json();
      if (data.success) {
        // Parse narrative — may be JSON or plain text
        let narrative = data.data.narrative;
        try {
          const parsed = JSON.parse(narrative.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim());
          setThesis(parsed.thesis || parsed.summary || JSON.stringify(parsed));
        } catch {
          setThesis(narrative);
        }
      }
    } catch (err) {
      setThesis('Unable to generate thesis. Please try again.');
    } finally {
      clearInterval(timer);
      setLoading(false);
    }
  }, [symbol, flowRegime, darkPoolRegime, levels, stats]);

  return (
    <div>
      {/* Header with refresh button */}
      <div className="flex items-center justify-between mb-3">
        <div className="text-[9px] uppercase tracking-wider"
          style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
          AI THESIS
        </div>
        <button
          onClick={refreshThesis}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
          style={{
            background: loading ? 'rgba(0,229,255,0.05)' : 'rgba(0,229,255,0.1)',
            color: '#00e5ff',
            border: '1px solid rgba(0,229,255,0.2)',
          }}
        >
          <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          {loading ? `Analyzing... ${elapsed}s` : 'Generate Thesis'}
        </button>
      </div>

      {/* Thesis content */}
      {thesis ? (
        <div className="text-[12px] text-[#c0c8d8] leading-relaxed whitespace-pre-wrap">
          {thesis}
        </div>
      ) : !loading ? (
        <div className="text-center py-6">
          <p className="text-[11px] text-[#4a6070]">
            Click "Generate Thesis" to get AI analysis of {symbol}
          </p>
          <p className="text-[9px] text-[#2a4a5a] mt-1">
            Synthesizes options flow, dark pool, gamma levels, and news
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-center py-6">
          <div className="text-sm text-[#8b99b0]">Reading market data...</div>
        </div>
      )}

      {/* Quick question pills */}
      {thesis && (
        <div className="flex flex-wrap gap-2 mt-4">
          {[
            `Is ${symbol} flow bullish or bearish?`,
            `Dark pool accumulation zones for ${symbol}`,
            `Gamma squeeze probability for ${symbol}`,
          ].map((q, i) => (
            <button
              key={i}
              onClick={() => onAskAI?.(q)}
              className="text-[10px] px-3 py-1.5 rounded-full transition-all hover:brightness-110"
              style={{
                background: 'rgba(0,229,255,0.06)',
                border: '1px solid rgba(0,229,255,0.15)',
                color: '#00e5ff',
              }}
            >
              {q}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
