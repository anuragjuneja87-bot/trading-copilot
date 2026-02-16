'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { decodeHTMLEntities } from '@/lib/utils';

interface LatestSignalsProps {
  ticker?: string;
}

export function LatestSignals({ ticker }: LatestSignalsProps) {
  const [signals, setSignals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSignals = async () => {
      setLoading(true);
      try {
        // Fetch recent news as signals
        const query = ticker ? `tickers=${ticker}` : 'tickers=SPY,QQQ';
        const res = await fetch(`/api/news?${query}&limit=3`);
        const data = await res.json();
        if (data.success) {
          setSignals(data.data?.articles || data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch signals:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchSignals();
  }, [ticker]);

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'positive' || sentiment === 'bullish') return COLORS.green;
    if (sentiment === 'negative' || sentiment === 'bearish') return COLORS.red;
    return COLORS.yellow;
  };

  return (
    <div>
      <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
        Latest Signals
      </h3>

      {loading ? (
        <div className="text-xs text-gray-500">Loading...</div>
      ) : signals.length > 0 ? (
        <div className="space-y-2">
          {signals.map((signal, i) => {
            const title = signal.title || signal.headline || '';
            const sentiment = signal.sentiment || 'neutral';
            
            return (
              <div key={i} className="flex items-start gap-2">
                <span 
                  className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0"
                  style={{ background: getSentimentColor(sentiment) }}
                />
                <p className="text-[11px] text-gray-300 line-clamp-2">
                  {decodeHTMLEntities(title)}
                </p>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-gray-500">No recent signals</p>
      )}
    </div>
  );
}
