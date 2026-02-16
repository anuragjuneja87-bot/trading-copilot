'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { decodeHTMLEntities } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

interface NewsSentimentPanelProps {
  ticker: string;
}

export function NewsSentimentPanel({ ticker }: NewsSentimentPanelProps) {
  const [news, setNews] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchNews = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/news?tickers=${ticker}&limit=5`);
        const data = await res.json();
        if (data.success) {
          setNews(data.data?.articles || data.data || []);
        }
      } catch (err) {
        console.error('Failed to fetch news:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchNews();

    const handleRefresh = () => fetchNews();
    window.addEventListener('refresh-ask-data', handleRefresh);
    return () => window.removeEventListener('refresh-ask-data', handleRefresh);
  }, [ticker]);

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'positive' || sentiment === 'bullish') return COLORS.green;
    if (sentiment === 'negative' || sentiment === 'bearish') return COLORS.red;
    return COLORS.yellow;
  };

  const formatTimeAgo = (date: string | Date) => {
    if (!date) return 'Recently';
    const d = typeof date === 'string' ? new Date(date) : date;
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);
    
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHour < 24) return `${diffHour}h ago`;
    if (diffDay < 7) return `${diffDay}d ago`;
    return d.toLocaleDateString();
  };

  return (
    <div 
      className="rounded-xl p-4 flex flex-col overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex-shrink-0">
        News & Sentiment
      </h3>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
          Loading...
        </div>
      ) : news.length > 0 ? (
        <div className="flex-1 space-y-2 overflow-y-auto">
          {news.map((item, i) => {
            const title = item.title || item.headline || '';
            const source = item.source || item.publisher?.name || 'Unknown';
            const url = item.url || item.articleUrl || '#';
            const publishedAt = item.publishedAt || item.publishedUtc || item.published;
            const sentiment = item.sentiment || 'neutral';
            
            return (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block p-2 rounded-lg transition-all hover:bg-white/5"
                style={{ background: 'rgba(255,255,255,0.02)' }}
              >
                <div className="flex items-start gap-2">
                  <span 
                    className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: getSentimentColor(sentiment) }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white line-clamp-2">
                      {decodeHTMLEntities(title)}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {source} • {formatTimeAgo(publishedAt)}
                    </p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-gray-500 flex-shrink-0" />
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">
          No recent news for {ticker}
        </div>
      )}
    </div>
  );
}
