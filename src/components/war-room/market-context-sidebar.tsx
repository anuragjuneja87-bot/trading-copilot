'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkline } from './sparkline';
import { FearGauge } from './fear-gauge';
import { cn } from '@/lib/utils';

interface MarketContextSidebarProps {
  watchlist?: string[];
  onTickerClick?: (ticker: string) => void;
}

export function MarketContextSidebar({ watchlist = [], onTickerClick }: MarketContextSidebarProps) {
  // Fetch market data
  const { data: prices } = useQuery({
    queryKey: ['market-prices', watchlist],
    queryFn: async () => {
      if (watchlist.length === 0) return {};
      const res = await fetch(`/api/market/prices?tickers=${watchlist.join(',')}`);
      const data = await res.json();
      return data.data || {};
    },
    refetchInterval: 30000,
  });

  const { data: levels } = useQuery({
    queryKey: ['key-levels', 'SPY'],
    queryFn: async () => {
      const res = await fetch('/api/levels?ticker=SPY');
      const data = await res.json();
      return data.data || {};
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const { data: regime } = useQuery({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data || {};
    },
    refetchInterval: 60000,
  });

  const { data: news } = useQuery({
    queryKey: ['news', 'latest'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=3');
      const data = await res.json();
      return data.data?.articles || [];
    },
    refetchInterval: 60000,
  });

  // Calculate Fear & Greed from VIX
  const vix = regime?.vix || 20;
  let fearGreedValue = 50;
  let fearGreedLabel = 'NEUTRAL';
  if (vix < 20) {
    fearGreedValue = 70 + (20 - vix) * 1.5; // Greed
    fearGreedLabel = 'GREED';
  } else if (vix > 30) {
    fearGreedValue = 30 - (vix - 30) * 1.5; // Fear
    fearGreedLabel = vix > 40 ? 'EXTREME FEAR' : 'FEAR';
  }
  fearGreedValue = Math.max(0, Math.min(100, fearGreedValue));

  // Generate sparkline data (mock for now - use intraday prices if available)
  const getSparklineData = (ticker: string): number[] => {
    const price = prices?.[ticker]?.price || 0;
    // Generate 8 points around the current price
    return Array.from({ length: 8 }, (_, i) => price + (Math.random() - 0.5) * price * 0.02);
  };

  const getSentimentColor = (ticker: string): 'green' | 'red' | 'yellow' => {
    const change = prices?.[ticker]?.changePercent || 0;
    if (change > 0.5) return 'green';
    if (change < -0.5) return 'red';
    return 'yellow';
  };

  const getSentimentDot = (color: 'green' | 'red' | 'yellow') => {
    const bgColor = color === 'green' ? '#00e676' : color === 'red' ? '#ff5252' : '#ffc107';
    return (
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: bgColor }} />
    );
  };

  return (
    <div className="h-full overflow-y-auto" style={{ padding: '20px 16px', borderRight: '1px solid rgba(255,255,255,0.04)' }}>
      {/* Fear & Greed Gauge */}
      <div className="mb-6">
        <FearGauge value={Math.round(fearGreedValue)} label={fearGreedLabel} />
      </div>

      {/* Watchlist Tickers */}
      {watchlist.length > 0 && (
        <div className="mb-6">
          <div className="text-[9px] uppercase tracking-wider mb-3" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            WATCHLIST
          </div>
          <div className="space-y-2">
            {watchlist.slice(0, 5).map((ticker) => {
              const price = prices?.[ticker]?.price || 0;
              const change = prices?.[ticker]?.changePercent || 0;
              const sentiment = getSentimentColor(ticker);
              const sparklineData = getSparklineData(ticker);
              
              return (
                <div
                  key={ticker}
                  onClick={() => onTickerClick?.(ticker)}
                  className="flex items-center justify-between p-2 rounded cursor-pointer hover:bg-[rgba(0,229,255,0.06)] transition-colors"
                  style={{ border: '1px solid rgba(255,255,255,0.04)' }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-xs font-bold text-white">{ticker}</span>
                      {getSentimentDot(sentiment)}
                      <span className="text-[10px] text-[#4a6070]">+$14K delta</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Sparkline data={sparklineData} color="#00e5ff" />
                    <span
                      className="text-[10px] font-mono font-semibold"
                      style={{ color: change >= 0 ? '#00e676' : '#ff5252' }}
                    >
                      {change >= 0 ? '+' : ''}{change.toFixed(2)}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SPY Key Levels */}
      {levels && (
        <div className="mb-6">
          <div className="text-[9px] uppercase tracking-wider mb-3" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            SPY KEY LEVELS
          </div>
          <div className="space-y-2">
            {[
              { label: 'Call Wall', value: levels.callWall, color: '#00e676' },
              { label: 'Put Wall', value: levels.putWall, color: '#ff5252' },
              { label: 'Max Gamma', value: levels.maxGamma, color: '#00e5ff' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex justify-between items-center py-1.5 border-b border-[rgba(255,255,255,0.04)]">
                <span className="text-[10px] text-[#4a6070]">{label}</span>
                <span className="text-xs font-mono font-semibold" style={{ color, fontFamily: "'Oxanium', monospace" }}>
                  ${value?.toFixed(0) || '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Latest Signals (News) */}
      {news && news.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider mb-3" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            LATEST SIGNALS
          </div>
          <div className="space-y-2">
            {news.slice(0, 3).map((article: any, idx: number) => {
              const sentiment = article.sentimentLabel || 'NEUTRAL';
              const dotColor = sentiment === 'BULLISH' ? '#00e676' : sentiment === 'BEARISH' ? '#ff5252' : '#ffc107';
              
              return (
                <div key={idx} className="p-2 rounded" style={{ border: '1px solid rgba(255,255,255,0.04)' }}>
                  <div className="flex items-start gap-2 mb-1">
                    <div className="w-1.5 h-1.5 rounded-full mt-1 flex-shrink-0" style={{ backgroundColor: dotColor }} />
                    <p className="text-[10px] text-[#8b99b0] line-clamp-2 leading-snug">{article.title || article.headline}</p>
                  </div>
                  <div className="text-[9px] text-[#2a4a5a] ml-3.5">
                    {article.published ? new Date(article.published).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : 'Just now'}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
