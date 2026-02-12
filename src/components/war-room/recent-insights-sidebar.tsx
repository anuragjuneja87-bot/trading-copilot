'use client';

import { useState, useEffect } from 'react';
import { useChatStore } from '@/stores';
import { parseAIResponse } from '@/lib/chat-utils';
import { cn } from '@/lib/utils';

interface RecentInsightsSidebarProps {
  onInsightClick?: (query: string) => void;
  onTrendingClick?: (query: string) => void;
}

const TRENDING_QUERIES = [
  { query: 'NVDA earnings positioning', count: 142 },
  { query: 'SPY gamma wall analysis', count: 89 },
  { query: 'February tech seasonality', count: 67 },
  { query: 'QQQ put/call ratio', count: 54 },
  { query: 'VIX term structure', count: 43 },
];

const TIPS = [
  'Use Quick Look for instant price checks (~1-3s)',
  'Analysis mode includes flow and sentiment (~10-15s)',
  'Full Thesis provides deep historical context (~30-60s)',
  'Click watchlist tickers to get instant theses',
  'Pin insights to reference during trading',
];

export function RecentInsightsSidebar({ onInsightClick, onTrendingClick }: RecentInsightsSidebarProps) {
  const { messages } = useChatStore();
  const [currentTip, setCurrentTip] = useState(0);

  // Rotate tips every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % TIPS.length);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Extract recent insights from messages
  const recentInsights = messages
    .filter((msg) => msg.role === 'assistant' && msg.content)
    .slice(-5)
    .reverse()
    .map((msg) => {
      const parsed = parseAIResponse(msg.content);
      const ticker = parsed.snapshot?.ticker || 'MARKET';
      const verdict = parsed.verdict?.type || 'NEUTRAL';
      const summary = parsed.verdict?.reasoning?.substring(0, 60) || parsed.analysis?.substring(0, 60) || 'Analysis complete';
      const time = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Just now';
      
      return { ticker, verdict, summary, time, content: msg.content };
    });

  const getVerdictColor = (verdict: string) => {
    switch (verdict) {
      case 'BUY':
        return { bg: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.3)', text: '#00e676' };
      case 'SELL':
        return { bg: 'rgba(255,82,82,0.15)', border: 'rgba(255,82,82,0.3)', text: '#ff5252' };
      case 'WAIT':
        return { bg: 'rgba(255,193,7,0.15)', border: 'rgba(255,193,7,0.3)', text: '#ffc107' };
      default:
        return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: '#8b99b0' };
    }
  };

  return (
    <div className="h-full overflow-y-auto" style={{ padding: '20px 16px', borderLeft: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Recent Insights */}
      <div className="mb-6">
        <div className="text-[9px] uppercase tracking-wider mb-3" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
          RECENT INSIGHTS
        </div>
        <div className="space-y-2">
          {recentInsights.length > 0 ? (
            recentInsights.map((insight, idx) => {
              const colors = getVerdictColor(insight.verdict);
              return (
                <div
                  key={idx}
                  onClick={() => onInsightClick?.(insight.content)}
                  className="p-2 rounded cursor-pointer hover:bg-[rgba(0,229,255,0.06)] transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-white">{insight.ticker}</span>
                    <span
                      className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                      style={{ backgroundColor: colors.bg, border: `1px solid ${colors.border}`, color: colors.text }}
                    >
                      {insight.verdict}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#4a6070] line-clamp-2 mb-1">{insight.summary}...</p>
                  <div className="text-[9px] text-[#2a4a5a]">{insight.time}</div>
                </div>
              );
            })
          ) : (
            <div className="text-[10px] text-[#4a6070] p-2">No recent insights yet</div>
          )}
        </div>
      </div>

      {/* Trending Now */}
      <div className="mb-6">
        <div className="text-[9px] uppercase tracking-wider mb-3" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
          TRENDING NOW
        </div>
        <div className="space-y-2">
          {TRENDING_QUERIES.map((item, idx) => (
            <div
              key={idx}
              onClick={() => onTrendingClick?.(item.query)}
              className="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-[rgba(0,229,255,0.06)] transition-colors"
              style={{ border: '1px solid rgba(255,255,255,0.04)' }}
            >
              <span className="text-[11px] text-[#8b99b0] flex-1">{item.query}</span>
              <span className="text-[9px] font-mono text-[#2a4a5a]" style={{ fontFamily: "'Oxanium', monospace" }}>
                {item.count}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Tip Card */}
      <div
        className="p-3 rounded"
        style={{
          background: 'rgba(0,229,255,0.03)',
          border: '1px solid rgba(0,229,255,0.06)',
        }}
      >
        <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#00e5ff', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
          💡 TIP
        </div>
        <p className="text-[10px] text-[#8b99b0] leading-relaxed">{TIPS[currentTip]}</p>
      </div>
    </div>
  );
}
