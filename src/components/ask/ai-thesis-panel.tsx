'use client';

import { useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { Sparkles, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

interface AIThesisPanelProps {
  ticker: string;
}

export function AIThesisPanel({ ticker }: AIThesisPanelProps) {
  const [thesis, setThesis] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const generateThesis = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/ai/format', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          templateType: 'symbol_thesis',
          tickers: [ticker],
        }),
      });
      const data = await res.json();
      if (data.success) {
        setThesis(data.data.narrative || 'No thesis generated');
        setExpanded(true);
      }
    } catch (err) {
      console.error('Failed to generate thesis:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="rounded-xl p-4 flex items-center justify-between"
      style={{ 
        background: 'linear-gradient(135deg, rgba(0,229,255,0.05) 0%, rgba(124,77,255,0.05) 100%)',
        border: '1px solid rgba(0,229,255,0.2)',
      }}
    >
      <div className="flex items-center gap-3">
        <div 
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ background: 'rgba(0,229,255,0.15)' }}
        >
          <Sparkles className="w-5 h-5" style={{ color: COLORS.cyan }} />
        </div>
        <div>
          <h3 className="text-sm font-bold text-white">AI Thesis</h3>
          <p className="text-xs text-gray-400">
            {thesis 
              ? (expanded ? thesis : thesis.slice(0, 100) + '...')
              : 'Click to generate AI synthesis of flow, dark pool, levels & news'
            }
          </p>
        </div>
      </div>

      <button
        onClick={thesis ? () => setExpanded(!expanded) : generateThesis}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all"
        style={{
          background: 'rgba(0,229,255,0.15)',
          border: '1px solid rgba(0,229,255,0.3)',
          color: COLORS.cyan,
        }}
      >
        {loading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Analyzing...
          </>
        ) : thesis ? (
          <>
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {expanded ? 'Collapse' : 'Expand'}
          </>
        ) : (
          <>
            <Sparkles className="w-4 h-4" />
            Generate
          </>
        )}
      </button>
    </div>
  );
}
