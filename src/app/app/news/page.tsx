'use client';

import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/toast';
import {
  Newspaper,
  RefreshCw,
  ExternalLink,
  Zap,
  Loader2,
  AlertTriangle,
  TrendingUp,
  Clock,
  Eye,
} from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useChatStore } from '@/stores';
import { WatchlistTickerSelect } from '@/components/trading/watchlist-ticker-select';
import Link from 'next/link';

interface NewsArticle {
  id: string;
  headline: string;
  summary: string;
  author: string;
  source: string;
  url: string | null;
  imageUrl: string | null;
  tickers: string[];
  keywords: string[];
  severity: 'CRISIS' | 'ELEVATED' | 'NORMAL';
  publishedAt: string;
}

interface NewsStats {
  total: number;
  crisis: number;
  elevated: number;
  normal: number;
}

const PRESETS = [
  { id: 'all', label: 'All News' },
  { id: 'crisis', label: 'Crisis Only', severity: 'CRISIS' },
  { id: 'elevated', label: 'Elevated Only', severity: 'ELEVATED' },
  { id: 'watchlist', label: 'Watchlist Only' },
];

function NewsCard({
  article,
  isSelected,
  onClick,
  onAnalyze,
}: {
  article: NewsArticle;
  isSelected: boolean;
  onClick: () => void;
  onAnalyze: () => void;
}) {
  const severityColors = {
    CRISIS: 'border-l-bear bg-bear/5',
    ELEVATED: 'border-l-warning bg-warning/5',
    NORMAL: 'border-l-border',
  };

  const severityBadge = {
    CRISIS: { variant: 'bearish' as const, label: 'CRISIS' },
    ELEVATED: { variant: 'elevated' as const, label: 'ELEVATED' },
    NORMAL: { variant: 'neutral' as const, label: '' },
  };

  const badge = severityBadge[article.severity];

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-4 rounded-lg border border-border cursor-pointer transition-all hover:bg-background-elevated',
        severityColors[article.severity],
        isSelected && 'ring-2 ring-accent'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {badge.label && (
            <Badge variant={badge.variant} className="text-xs">
              {badge.label}
            </Badge>
          )}
          {article.tickers.map((ticker) => (
            <Badge key={ticker} variant="outline" className="text-xs bg-accent/10">
              {ticker}
            </Badge>
          ))}
        </div>
        <span className="text-xs text-text-muted whitespace-nowrap">
          {formatDistanceToNow(new Date(article.publishedAt), { addSuffix: true })}
        </span>
      </div>

      <h3 className="font-semibold text-text-primary mb-2 line-clamp-2">{article.headline}</h3>
      <p className="text-sm text-text-secondary line-clamp-2 mb-3">{article.summary}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <Newspaper className="h-3 w-3" />
          <span>{article.source}</span>
          {article.author && article.author !== 'Unknown' && (
            <>
              <span>•</span>
              <span>{article.author}</span>
            </>
          )}
        </div>
        <div className="flex gap-2">
          {article.url && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                window.open(article.url!, '_blank');
              }}
              className="h-7 text-xs"
            >
              <ExternalLink className="h-3 w-3 mr-1" />
              Read
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onAnalyze();
            }}
            className="h-7 text-xs"
          >
            <Zap className="h-3 w-3 mr-1" />
            AI
          </Button>
        </div>
      </div>
    </div>
  );
}

function DetailPanel({
  article,
  onAnalyze,
  aiAnalysis,
  isAnalyzing,
}: {
  article: NewsArticle | null;
  onAnalyze: () => void;
  aiAnalysis: string | null;
  isAnalyzing: boolean;
}) {
  if (!article) {
    return (
      <div className="h-full flex items-center justify-center text-text-muted p-8">
        <div className="text-center">
          <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p>Select an article to view details</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="space-y-4">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            {article.severity === 'CRISIS' && (
              <Badge variant="bearish">CRISIS</Badge>
            )}
            {article.severity === 'ELEVATED' && (
              <Badge variant="elevated">ELEVATED</Badge>
            )}
            <span className="text-sm text-text-muted">
              {format(new Date(article.publishedAt), 'MMM d, yyyy h:mm a')}
            </span>
          </div>
          <h1 className="text-2xl font-bold text-text-primary mb-4">{article.headline}</h1>
        </div>

        {/* Image */}
        {article.imageUrl && (
          <img
            src={article.imageUrl}
            alt={article.headline}
            className="w-full rounded-lg border border-border"
          />
        )}

        {/* Summary */}
        <div>
          <h2 className="text-lg font-semibold text-text-primary mb-2">Summary</h2>
          <p className="text-text-secondary whitespace-pre-wrap">{article.summary}</p>
        </div>

        {/* Tickers */}
        {article.tickers.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-2">Tickers</h2>
            <div className="flex flex-wrap gap-2">
              {article.tickers.map((ticker) => (
                <Link key={ticker} href={`/app?ticker=${ticker}`}>
                  <Badge variant="outline" className="cursor-pointer hover:bg-accent/10">
                    {ticker}
                  </Badge>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Keywords */}
        {article.keywords.length > 0 && (
          <div>
            <h2 className="text-lg font-semibold text-text-primary mb-2">Keywords</h2>
            <div className="flex flex-wrap gap-2">
              {article.keywords.map((keyword, idx) => (
                <Badge key={idx} variant="neutral" className="text-xs">
                  {keyword}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Source */}
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <Newspaper className="h-4 w-4" />
          <span>{article.source}</span>
          {article.author && article.author !== 'Unknown' && (
            <>
              <span>•</span>
              <span>{article.author}</span>
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4 border-t border-border">
          {article.url && (
            <Button
              variant="outline"
              onClick={() => window.open(article.url!, '_blank')}
              className="flex-1"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Read Full Article
            </Button>
          )}
          <Button onClick={onAnalyze} disabled={isAnalyzing} className="flex-1">
            {isAnalyzing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Get AI Analysis
              </>
            )}
          </Button>
        </div>

        {/* AI Analysis */}
        {aiAnalysis && (
          <div className="mt-6 p-4 rounded-lg bg-background-surface border border-border">
            <h3 className="text-lg font-semibold text-text-primary mb-3">AI Analysis</h3>
            <div className="text-text-secondary whitespace-pre-wrap">{aiAnalysis}</div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function NewsPage() {
  const router = useRouter();
  const { addMessage } = useChatStore();
  const [activePreset, setActivePreset] = useState('all');
  const [selectedTickers, setSelectedTickers] = useState<string[]>([]);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Fetch watchlist for "Watchlist Only" filter
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data?.watchlist || [];
    },
  });

  const watchlistTickers = useMemo(
    () => watchlistData?.map((item: any) => item.ticker) || [],
    [watchlistData]
  );

  // Default ticker filter to all watchlist tickers when available
  useEffect(() => {
    if (!selectedTickers.length && watchlistTickers.length > 0) {
      setSelectedTickers(watchlistTickers);
    }
  }, [watchlistTickers, selectedTickers.length]);

  // Build filters
  const filters = useMemo(() => {
    const f: any = { limit: '50' };
    const preset = PRESETS.find((p) => p.id === activePreset);
    if (preset?.severity) {
      f.severity = preset.severity;
    }
    if (selectedTickers.length > 0) {
      f.ticker = selectedTickers.join(',');
    }
    return f;
  }, [activePreset, selectedTickers]);

  // Fetch news
  const { data: newsData, isLoading, dataUpdatedAt, refetch } = useQuery<{
    articles: NewsArticle[];
    stats: NewsStats;
    meta: { timestamp: string; nextUrl: string | null };
  }>({
    queryKey: ['news', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.severity) params.set('severity', filters.severity);
      if (filters.ticker) params.set('ticker', filters.ticker);
      if (filters.limit) params.set('limit', filters.limit);

      const res = await fetch(`/api/news?${params.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    refetchInterval: autoRefresh ? 60000 : false, // 60 seconds
  });

  // Filter articles for watchlist preset
  const filteredArticles = useMemo(() => {
    if (!newsData?.articles) return [];
    if (activePreset === 'watchlist') {
      return newsData.articles.filter((article) =>
        article.tickers.some((ticker) => watchlistTickers.includes(ticker))
      );
    }
    return newsData.articles;
  }, [newsData, activePreset, watchlistTickers]);

  // Auto-select first article on load
  useEffect(() => {
    if (!selectedArticle && filteredArticles.length > 0) {
      setSelectedArticle(filteredArticles[0]);
    }
  }, [filteredArticles, selectedArticle]);

  const handleAnalyze = async (article: NewsArticle) => {
    setIsAnalyzing(true);
    setAiAnalysis(null);

    try {
      const prompt = `Analyze this news for trading implications:
Headline: ${article.headline}
Summary: ${article.summary}
Tickers: ${article.tickers.join(', ')}
Keywords: ${article.keywords.join(', ')}

Provide:
1. Impact assessment (bullish/bearish/neutral)
2. Affected tickers and why
3. Trading recommendation
4. Key levels to watch`;

      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
      });

      const data = await res.json();
      if (data.success) {
        setAiAnalysis(data.data.message || 'No analysis available');
      } else {
        showToast(data.error || 'Failed to get AI analysis', 'error');
      }
    } catch (error: any) {
      showToast(error.message || 'Failed to get AI analysis', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const stats = newsData?.stats;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Newspaper className="h-6 w-6 text-accent" />
              <h1 className="text-2xl font-bold text-text-primary">News Feed</h1>
            </div>
            <p className="text-sm text-text-secondary">Real-time Benzinga news with AI sentiment</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoRefresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="autoRefresh" className="text-sm text-text-secondary">
                Auto-refresh
              </label>
            </div>
            {dataUpdatedAt && (
              <span className="text-xs text-text-muted">
                Last updated: {format(dataUpdatedAt, 'h:mm:ss a')}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
              <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="sticky top-[120px] z-10 bg-background-surface border-b border-border p-4">
        <div className="flex flex-col gap-4">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => {
              const count =
                preset.id === 'crisis'
                  ? stats?.crisis
                  : preset.id === 'elevated'
                  ? stats?.elevated
                  : undefined;
              return (
                <Button
                  key={preset.id}
                  variant={activePreset === preset.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActivePreset(preset.id)}
                >
                  {preset.label}
                  {count !== undefined && count > 0 && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {count}
                    </Badge>
                  )}
                </Button>
              );
            })}
          </div>

          {/* Ticker Filter */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-muted whitespace-nowrap">Tickers:</label>
            <WatchlistTickerSelect
              value={selectedTickers}
              onChange={setSelectedTickers}
              placeholder="Select from watchlist"
              multiple={true}
              className="max-w-xs"
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: News List */}
        <div className="w-full lg:w-[60%] border-r border-border overflow-y-auto p-6">
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-32 bg-background-elevated animate-pulse rounded-lg" />
              ))}
            </div>
          ) : filteredArticles.length === 0 ? (
            <div className="text-center py-12 text-text-muted">
              <Newspaper className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No news articles found</p>
              <p className="text-sm mt-2">Try adjusting your filters</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredArticles.map((article) => (
                <NewsCard
                  key={article.id}
                  article={article}
                  isSelected={selectedArticle?.id === article.id}
                  onClick={() => {
                    setSelectedArticle(article);
                    setAiAnalysis(null);
                  }}
                  onAnalyze={() => handleAnalyze(article)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: Detail Panel */}
        <div className="hidden lg:block w-[40%] border-l border-border bg-background-surface">
          <DetailPanel
            article={selectedArticle}
            onAnalyze={() => selectedArticle && handleAnalyze(selectedArticle)}
            aiAnalysis={aiAnalysis}
            isAnalyzing={isAnalyzing}
          />
        </div>
      </div>
    </div>
  );
}
