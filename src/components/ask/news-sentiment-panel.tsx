'use client';
import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { decodeHTMLEntities } from '@/lib/utils';
import { ExternalLink } from 'lucide-react';

interface NewsSentimentPanelProps {
  ticker: string;
  items: any[];
  loading: boolean;
}

export function NewsSentimentPanel({ ticker, items: news, loading }: NewsSentimentPanelProps) {
  // Calculate aggregate sentiment
  const sentimentSummary = useMemo(() => {
    if (!news || news.length === 0) return null;
    
    let positive = 0;
    let negative = 0;
    let neutral = 0;
    
    news.forEach(item => {
      // Use sentimentValue if available, otherwise parse from sentiment field
      const sentimentValue = item?.sentimentValue || item?.sentiment;
      const s = typeof sentimentValue === 'string' 
        ? sentimentValue.toLowerCase() 
        : String(sentimentValue || '').toLowerCase();
      
      if (s === 'positive' || s === 'bullish' || s.includes('bull')) positive++;
      else if (s === 'negative' || s === 'bearish' || s.includes('bear')) negative++;
      else neutral++;
    });
    
    const total = positive + negative + neutral;
    const score = total > 0 ? ((positive - negative) / total) : 0; // -1 to +1
    
    const overallSentiment = 
      positive > negative ? 'BULLISH' :
      negative > positive ? 'BEARISH' : 'MIXED';
    
    return {
      score,
      label: overallSentiment,
      color: overallSentiment === 'BULLISH' ? COLORS.green : overallSentiment === 'BEARISH' ? COLORS.red : COLORS.yellow,
      positive,
      negative,
      neutral,
      bullish: positive, // Legacy support
      bearish: negative, // Legacy support
    };
  }, [news]);

  const getSentimentColor = (sentiment: string) => {
    if (sentiment === 'positive' || sentiment === 'bullish') return COLORS.green;
    if (sentiment === 'negative' || sentiment === 'bearish') return COLORS.red;
    return COLORS.yellow;
  };
  
  const getSentimentDot = (item: any) => {
    // Use sentimentValue if available, otherwise parse from sentiment field
    const sentimentValue = item?.sentimentValue || item?.sentiment;
    const s = typeof sentimentValue === 'string' 
      ? sentimentValue.toLowerCase() 
      : String(sentimentValue || '').toLowerCase();
    
    if (s === 'positive' || s === 'bullish' || s.includes('bull')) {
      return <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />;
    }
    if (s === 'negative' || s === 'bearish' || s.includes('bear')) {
      return <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />;
    }
    return <div className="w-2 h-2 rounded-full bg-gray-500 flex-shrink-0" />;
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
      className="rounded-xl p-4 flex flex-col h-full max-h-full overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            News & Sentiment
          </h3>
          {/* Always show "Latest" */}
          <span className="text-[10px] text-gray-500 bg-white/5 px-2 py-0.5 rounded">
            Latest
          </span>
        </div>
        {sentimentSummary && (
          <div className="flex items-center gap-2">
            {/* Overall badge */}
            <span className={`
              text-xs px-2 py-0.5 rounded font-medium
              ${sentimentSummary.label === 'BULLISH' ? 'bg-green-500/20 text-green-400' : ''}
              ${sentimentSummary.label === 'BEARISH' ? 'bg-red-500/20 text-red-400' : ''}
              ${sentimentSummary.label === 'MIXED' ? 'bg-gray-500/20 text-gray-400' : ''}
            `}>
              {sentimentSummary.label}
            </span>
            
            {/* Clear breakdown */}
            <span className="text-[10px] text-gray-500">
              <span className="text-green-400">{sentimentSummary.positive}↑</span>
              {' '}
              <span className="text-red-400">{sentimentSummary.negative}↓</span>
              {' '}
              <span className="text-gray-400">{sentimentSummary.neutral}—</span>
            </span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="h-[200px] flex items-center justify-center text-gray-500 text-xs">
          Loading...
        </div>
      ) : news.length > 0 ? (
        <div className="h-[200px] space-y-2 overflow-y-auto">
          {news.map((item, i) => {
            const title = item.title || item.headline || '';
            const source = item.source || item.publisher?.name || 'Market News';
            const url = item.url || item.articleUrl || '#';
            const publishedAt = item.publishedAt || item.publishedUtc || item.published;
            
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
                  {getSentimentDot(item)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-white line-clamp-2">
                      {decodeHTMLEntities(title)}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-0.5">
                      {source !== 'Market News' ? (
                        <span className="text-gray-300">{source}</span>
                      ) : (
                        <span className="text-gray-500">Market News</span>
                      )}
                      <span className="mx-1">•</span>
                      <span>{formatTimeAgo(publishedAt)}</span>
                    </p>
                  </div>
                  <ExternalLink className="w-3 h-3 text-gray-500 flex-shrink-0" />
                </div>
              </a>
            );
          })}
        </div>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-gray-500 text-xs">
          No recent news for {ticker}
        </div>
      )}
    </div>
  );
}
