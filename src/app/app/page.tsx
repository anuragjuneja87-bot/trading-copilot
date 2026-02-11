'use client';

import { useState } from 'react';
import { RegimeBar } from '@/components/trading/regime-bar';
import { ChatPanel } from '@/components/trading/chat-panel';
import { QuickThesis } from '@/components/trading/quick-thesis';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Sparkles,
  BarChart3,
  Eye,
  AlertTriangle,
  Settings,
  Loader2,
  Target,
  Newspaper,
} from 'lucide-react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';

interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  actionButton?: React.ReactNode;
}

function CollapsiblePanel({ title, icon, children, defaultOpen = true, actionButton }: PanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-border rounded-lg bg-background-card overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-background-elevated transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-text-primary">{title}</span>
        </div>
        <div className="flex items-center gap-2">
          {actionButton}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-text-muted" />
          ) : (
            <ChevronDown className="h-4 w-4 text-text-muted" />
          )}
        </div>
      </button>
      {isOpen && <div className="p-4 border-t border-border">{children}</div>}
    </div>
  );
}

function AIPanel({ prompt, title }: { prompt: string; title: string }) {
  const [response, setResponse] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLoad = async () => {
    setIsLoading(true);
    setResponse('');

    try {
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: prompt }),
      });

      const data = await res.json();
      if (data.success) {
        // API returns the AI text under data.message
        const message = data.data?.message || data.message;
        setResponse(message || 'No response received');
      } else {
        setResponse(`Error: ${data.error || 'Failed to get response'}`);
      }
    } catch (error: any) {
      setResponse(`Error: ${error.message || 'Failed to get response'}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button onClick={handleLoad} disabled={isLoading} size="sm" variant="outline" className="w-full">
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading...
          </>
        ) : (
          <>
            <RefreshCw className="h-4 w-4 mr-2" />
            Load {title}
          </>
        )}
      </Button>
      {response && (
        <div className="text-sm text-text-secondary whitespace-pre-wrap bg-background-surface p-3 rounded border border-border">
          {response}
        </div>
      )}
    </div>
  );
}

function WatchlistPanel() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const response = await res.json();
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch watchlist');
      }
      // Ensure we return an array
      const watchlist = response.data?.watchlist || [];
      return Array.isArray(watchlist) ? watchlist : [];
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-background-elevated animate-pulse rounded" />
        ))}
      </div>
    );
  }

  // Ensure data is an array before checking length or mapping
  const watchlistItems = Array.isArray(data) ? data : [];

  if (error || !watchlistItems || watchlistItems.length === 0) {
    return (
      <div className="text-center py-8">
        <Eye className="h-12 w-12 text-text-muted mx-auto mb-4 opacity-50" />
        <p className="text-text-primary font-medium mb-2">Your watchlist is empty</p>
        <p className="text-sm text-text-muted mb-4">Add tickers to track their performance</p>
        <Link href="/app/settings">
          <Button variant="outline" size="sm">
            Add Ticker
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {watchlistItems.map((item: any) => (
        <div
          key={item.id}
          className="flex items-center justify-between p-3 bg-background-surface rounded border border-border"
        >
          <div>
            <div className="font-semibold text-text-primary">{item.ticker}</div>
            {item.price !== null && (
              <div className="text-sm text-text-secondary">
                ${item.price.toFixed(2)}
                {item.changePercent !== null && (
                  <span
                    className={`ml-2 ${
                      item.changePercent >= 0 ? 'text-bull' : 'text-bear'
                    }`}
                  >
                    {item.changePercent >= 0 ? '+' : ''}
                    {item.changePercent.toFixed(2)}%
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      ))}
      <Link href="/app/settings">
        <Button variant="outline" size="sm" className="w-full mt-2">
          <Settings className="h-4 w-4 mr-2" />
          Edit Watchlist
        </Button>
      </Link>
    </div>
  );
}

function NewsPulsePanel() {
  const { data: newsData, isLoading } = useQuery({
    queryKey: ['newsPulse'],
    queryFn: async () => {
      const res = await fetch('/api/news?limit=10');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  // Filter to only CRISIS and ELEVATED
  const criticalNews = newsData?.articles?.filter(
    (article: any) => article.severity === 'CRISIS' || article.severity === 'ELEVATED'
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-background-elevated animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (criticalNews.length === 0) {
    return (
      <div className="text-center py-4 text-text-muted text-sm">
        <p>No critical news alerts</p>
        <Link href="/app/news" className="text-accent hover:underline mt-2 inline-block">
          View All News
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {criticalNews.slice(0, 5).map((article: any) => (
        <Link
          key={article.id}
          href="/app/news"
          className="block p-3 rounded border border-border bg-background-surface hover:bg-background-elevated transition-colors"
        >
          <div className="flex items-start gap-2 mb-1">
            <div
              className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                article.severity === 'CRISIS' ? 'bg-bear' : 'bg-warning'
              }`}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary line-clamp-2">
                {article.headline}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {article.tickers.slice(0, 3).map((ticker: string) => (
                  <span key={ticker} className="text-xs text-accent">
                    {ticker}
                  </span>
                ))}
                <span className="text-xs text-text-muted">
                  {new Date(article.publishedAt).toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
      <Link href="/app/news">
        <Button variant="outline" size="sm" className="w-full mt-2">
          View All News
        </Button>
      </Link>
    </div>
  );
}

export default function CommandCenterPage() {
  // Fetch watchlist for Quick Thesis
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data;
    },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Regime Bar */}
      <RegimeBar />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column - Context Panels */}
        <div className="w-full lg:w-[380px] border-r border-border overflow-y-auto p-4 space-y-4 bg-background">
          {/* Morning Briefing */}
          <CollapsiblePanel
            title="Morning Briefing"
            icon={<Sparkles className="h-4 w-4 text-accent" />}
            defaultOpen={true}
          >
            <AIPanel prompt="Give me a concise morning briefing" title="Briefing" />
          </CollapsiblePanel>

          {/* Quick Thesis */}
          <CollapsiblePanel
            title="Quick Thesis"
            icon={<Target className="h-4 w-4 text-warning" />}
            defaultOpen={true}
          >
            <QuickThesis
              tickers={
                watchlistData?.watchlist?.map((item: any) => item.ticker) || []
              }
            />
          </CollapsiblePanel>

          {/* Key Levels */}
          <CollapsiblePanel
            title="Key Levels"
            icon={<BarChart3 className="h-4 w-4 text-bull" />}
            defaultOpen={true}
          >
            <AIPanel prompt="Key levels for SPY and QQQ today" title="Levels" />
          </CollapsiblePanel>

          {/* Watchlist */}
          <CollapsiblePanel
            title="Watchlist"
            icon={<Eye className="h-4 w-4 text-warning" />}
            defaultOpen={true}
          >
            <WatchlistPanel />
          </CollapsiblePanel>

          {/* News Pulse */}
          <CollapsiblePanel
            title="News Pulse"
            icon={<AlertTriangle className="h-4 w-4 text-bear" />}
            defaultOpen={false}
          >
            <NewsPulsePanel />
          </CollapsiblePanel>
        </div>

        {/* Right Column - Chat */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <ChatPanel />
        </div>
      </div>
    </div>
  );
}
