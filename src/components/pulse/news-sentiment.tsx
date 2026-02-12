'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface NewsArticle {
  title: string;
  source: string;
  published: string;
  url: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  tickers?: string[];
}

// Helper function to safely format date
function formatRelativeTime(dateString: string): string {
  if (!dateString) return 'Unknown';
  
  try {
    const date = new Date(dateString);
    // Check if date is valid
    if (isNaN(date.getTime())) {
      return 'Unknown';
    }
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.warn('[NewsSentiment] Invalid date:', dateString, error);
    return 'Unknown';
  }
}

// TODO: Fetch from /api/news with limit=8 and sentiment filter
export function NewsSentiment() {
  const { data: newsData, isLoading } = useQuery<{ articles: NewsArticle[] }>({
    queryKey: ['news', 'pulse'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=8');
      const data = await res.json();
      return data.data || { articles: [] };
    },
    refetchInterval: 60000, // Refresh every minute
  });

  // Mock data fallback if API doesn't return data
  const mockArticles: NewsArticle[] = [
    {
      title: 'Fed Signals Potential Rate Cuts as Inflation Cools',
      source: 'Bloomberg',
      published: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BULLISH',
      tickers: ['SPY', 'QQQ'],
    },
    {
      title: 'Tech Earnings Beat Expectations, AI Stocks Surge',
      source: 'Reuters',
      published: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BULLISH',
      tickers: ['NVDA', 'AMD'],
    },
    {
      title: 'Geopolitical Tensions Escalate, Oil Prices Spike',
      source: 'WSJ',
      published: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BEARISH',
      tickers: ['SPY'],
    },
    {
      title: 'Options Flow Shows Heavy Call Buying in Tech Sector',
      source: 'MarketWatch',
      published: new Date(Date.now() - 75 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BULLISH',
      tickers: ['QQQ'],
    },
    {
      title: 'VIX Spikes Above 30 as Market Volatility Returns',
      source: 'CNBC',
      published: new Date(Date.now() - 90 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BEARISH',
      tickers: ['VIX'],
    },
    {
      title: 'Retail Investors Pile Into Meme Stocks Again',
      source: 'Bloomberg',
      published: new Date(Date.now() - 105 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'NEUTRAL',
      tickers: ['GME', 'AMC'],
    },
    {
      title: 'Crypto Markets Rally on ETF Approval Hopes',
      source: 'CoinDesk',
      published: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BULLISH',
      tickers: ['BTC'],
    },
    {
      title: 'Manufacturing Data Shows Economic Slowdown',
      source: 'Reuters',
      published: new Date(Date.now() - 135 * 60 * 1000).toISOString(),
      url: '#',
      sentiment: 'BEARISH',
      tickers: ['SPY'],
    },
  ];

  const articles = newsData?.articles?.length ? newsData.articles.slice(0, 8) : mockArticles;

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'BULLISH':
        return 'bg-bull/10 text-bull border-bull/20';
      case 'BEARISH':
        return 'bg-bear/10 text-bear border-bear/20';
      default:
        return 'bg-[rgba(255,255,255,0.1)] text-[#6b7a99] border-[rgba(255,255,255,0.1)]';
    }
  };

  return (
    <Card className="p-6 lg:p-8 border-[rgba(255,255,255,0.06)] bg-background-card rounded-xl">
      <h2 className="text-2xl font-bold text-text-primary mb-6">News Sentiment</h2>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="h-32 bg-background-surface rounded-lg animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {articles.map((article, index) => (
            <a
              key={index}
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-4 hover:border-[#00e5ff]/30 hover:bg-[rgba(0,229,255,0.02)] transition-all"
            >
              <div className="flex items-start justify-between mb-2">
                <Badge
                  className={cn('text-[10px] px-2 py-0.5 border', getSentimentColor(article.sentiment))}
                >
                  {article.sentiment}
                </Badge>
                <ExternalLink className="h-3 w-3 text-[#6b7a99] opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
              <h3 className="text-sm font-semibold text-white mb-2 line-clamp-2 group-hover:text-[#00e5ff] transition-colors">
                {article.title}
              </h3>
              <div className="flex items-center justify-between text-xs text-[#6b7a99]">
                <span>{article.source}</span>
                <span>
                  {formatRelativeTime(article.published)}
                </span>
              </div>
              {article.tickers && article.tickers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {article.tickers.slice(0, 3).map((ticker) => (
                    <span
                      key={ticker}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(255,255,255,0.05)] text-[#6b7a99]"
                    >
                      {ticker}
                    </span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      )}

      {/* CTA */}
      <div className="mt-6 pt-6 border-t border-[rgba(255,255,255,0.06)] text-center">
        <Link
          href="/signup"
          className="text-sm text-[#00e5ff] hover:text-[#00b8d4] transition-colors inline-flex items-center gap-1"
        >
          Get AI-synthesized morning briefings delivered before market open
          <ArrowRight className="h-3 w-3" />
          <span className="font-semibold">Sign Up Free</span>
        </Link>
      </div>
    </Card>
  );
}
