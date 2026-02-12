'use client';

import { useState, useEffect } from 'react';
import { ChatPanel } from '@/components/trading/chat-panel';
import { AutoBriefing } from '@/components/command-center/auto-briefing';
import { AutoQuickThesis } from '@/components/command-center/auto-quick-thesis';
import { AutoKeyLevels } from '@/components/command-center/auto-key-levels';
import { EnhancedWatchlist } from '@/components/command-center/enhanced-watchlist';
import { CommandPalette } from '@/components/command-center/command-palette';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronUp,
  Sparkles,
  BarChart3,
  Eye,
  AlertTriangle,
  Target,
  Keyboard,
  HelpCircle,
} from 'lucide-react';
import Link from 'next/link';

interface PanelProps {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function CollapsiblePanel({ title, icon, children, defaultOpen = true }: PanelProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] overflow-hidden"
      style={{ borderRadius: '12px' }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-4 hover:bg-[rgba(255,255,255,0.04)] transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-semibold text-text-primary">{title}</span>
        </div>
        {isOpen ? (
          <ChevronUp className="h-4 w-4 text-text-muted" />
        ) : (
          <ChevronDown className="h-4 w-4 text-text-muted" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 border-t border-[rgba(255,255,255,0.06)]">{children}</div>
      )}
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
    refetchInterval: 60000,
  });

  const criticalNews = newsData?.articles?.filter(
    (article: any) => article.severity === 'CRISIS' || article.severity === 'ELEVATED'
  ) || [];

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-[rgba(255,255,255,0.05)] animate-pulse rounded-lg" />
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
          className="block p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
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
                {article.tickers?.slice(0, 3).map((ticker: string) => (
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
        <button className="w-full mt-2 px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors text-sm text-text-primary">
          View All News
        </button>
      </Link>
    </div>
  );
}

export default function CommandCenterPage() {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [chatQuery, setChatQuery] = useState<string | undefined>(undefined);

  // Fetch watchlist
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data;
    },
  });

  const watchlistTickers =
    watchlistData?.watchlist?.map((item: any) => item.ticker) || [];
  const topTicker = watchlistTickers[0] || 'SPY';

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
      // ESC to close
      if (e.key === 'Escape' && commandPaletteOpen) {
        setCommandPaletteOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [commandPaletteOpen]);

  const handleTickerClick = (ticker: string) => {
    setSelectedTicker(ticker);
    setChatQuery(`Build a thesis on ${ticker}`);
  };

  const handleCommandQuery = (query: string) => {
    setChatQuery(query);
  };

  return (
    <>
      <div className="flex flex-col h-full">
        {/* Main Content */}
        <div className="flex-1 flex flex-col lg:flex-row min-h-0">
          {/* Left Column - Context Panels */}
          <div className="w-full lg:w-[380px] border-r border-[rgba(255,255,255,0.06)] overflow-y-auto p-4 space-y-4 bg-background order-2 lg:order-1">
            {/* Morning Briefing */}
            <CollapsiblePanel
              title="Morning Briefing"
              icon={<Sparkles className="h-4 w-4 text-accent" />}
              defaultOpen={true}
            >
              <AutoBriefing prompt="Give me a concise morning briefing" />
            </CollapsiblePanel>

            {/* Quick Thesis */}
            <CollapsiblePanel
              title="Quick Thesis"
              icon={<Target className="h-4 w-4 text-warning" />}
              defaultOpen={true}
            >
              <AutoQuickThesis tickers={watchlistTickers} />
            </CollapsiblePanel>

            {/* Key Levels */}
            <CollapsiblePanel
              title="Key Levels"
              icon={<BarChart3 className="h-4 w-4 text-bull" />}
              defaultOpen={true}
            >
              <AutoKeyLevels defaultTicker={topTicker} />
            </CollapsiblePanel>

            {/* Watchlist */}
            <CollapsiblePanel
              title="Watchlist"
              icon={<Eye className="h-4 w-4 text-warning" />}
              defaultOpen={true}
            >
              <EnhancedWatchlist onTickerClick={handleTickerClick} />
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
          <div className="flex-1 flex flex-col overflow-hidden relative order-1 lg:order-2">
            {/* Mobile Back Button */}
            <div className="lg:hidden flex items-center gap-2 p-4 border-b border-[rgba(255,255,255,0.06)]">
              <button
                onClick={() => router.back()}
                className="p-2 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <ChevronUp className="h-5 w-5 text-text-muted rotate-90" />
              </button>
              <span className="text-sm font-medium text-text-primary">AI Chat</span>
            </div>

            {/* Keyboard Shortcut Hint - Desktop only */}
            <div className="hidden lg:flex absolute top-4 right-4 z-10 items-center gap-2">
              <button
                onClick={() => setCommandPaletteOpen(true)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors text-xs text-text-muted"
              >
                <Keyboard className="h-3 w-3" />
                <kbd className="px-1 py-0.5 rounded text-[10px] border border-[rgba(255,255,255,0.1)]">
                  ⌘K
                </kbd>
              </button>
            </div>

            <ChatPanel
              watchlist={watchlistTickers}
              initialMessage={chatQuery}
              key={chatQuery} // Force re-render when query changes
            />
          </div>
        </div>
      </div>

      {/* Command Palette */}
      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        watchlist={watchlistTickers}
        onQuery={handleCommandQuery}
      />
    </>
  );
}
