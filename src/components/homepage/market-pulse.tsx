'use client';

import { useState, useEffect, createContext, useContext } from 'react';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Newspaper,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { MarketPulseData, VixData, TickerSnapshot, FearGreedIndex, Mover, NewsItem } from '@/types/market-pulse';

// Context
const MarketPulseContext = createContext<{
  data: MarketPulseData | null;
  isLoading: boolean;
  lastUpdated: Date | null;
  refresh: (bypassCache?: boolean) => void;
}>({
  data: null,
  isLoading: true,
  lastUpdated: null,
  refresh: () => {},
});

export const useMarketPulse = () => useContext(MarketPulseContext);

// Provider
export function MarketPulseProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<MarketPulseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchMarketPulse = async (bypassCache = false) => {
    try {
      // Add cache-busting query param if bypassing cache
      const url = bypassCache ? `/api/market-pulse?t=${Date.now()}` : '/api/market-pulse';
      const response = await fetch(url, {
        cache: bypassCache ? 'no-store' : 'default',
      });
      const result = await response.json();

      if (result.success) {
        setData(result.data);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error('Market pulse fetch error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMarketPulse();

    // Auto-refresh every 30 seconds (more frequent to catch market open)
    const interval = setInterval(fetchMarketPulse, 30000);
    return () => clearInterval(interval);
  }, []);

  const refresh = (bypassCache = false) => {
    setIsLoading(true);
    fetchMarketPulse(bypassCache);
  };

  return (
    <MarketPulseContext.Provider value={{ data, isLoading, lastUpdated, refresh }}>
      {children}
    </MarketPulseContext.Provider>
  );
}

// ============================================
// LEFT SIDEBAR COMPONENT
// ============================================

export function MarketPulseLeftSidebar() {
  const { data, isLoading, lastUpdated } = useMarketPulse();

  if (isLoading) {
    return <LeftSidebarSkeleton />;
  }

  if (!data) {
    return null;
  }

  // Check if market is currently open
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const dayOfWeek = etTime.getDay();
  const timeInMinutes = hour * 60 + minute;
  const isMarketOpen = dayOfWeek >= 1 && dayOfWeek <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;

  return (
    <div className="w-64 space-y-4 p-4">
      {/* Market Status & Last Updated */}
      <div className="bg-background-card border border-background-elevated rounded-xl p-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-text-muted font-medium">Market Status</span>
          <span
            className={cn(
              'text-[9px] px-2 py-0.5 rounded-full font-bold',
              isMarketOpen
                ? 'bg-[rgba(0,230,118,0.15)] text-[#00e676]'
                : 'bg-[rgba(139,153,176,0.15)] text-[#8b99b0]'
            )}
          >
            {isMarketOpen ? 'OPEN' : 'CLOSED'}
          </span>
        </div>
        {lastUpdated && (
          <div className="text-[10px] text-text-muted">
            Updated {formatTimeAgo(lastUpdated)}
          </div>
        )}
        {!isMarketOpen && (
          <div className="text-[10px] text-text-muted mt-1">
            Data from last market session
          </div>
        )}
      </div>

      {/* Market Sentiment Badge */}
      <MarketSentimentBadge sentiment={data.marketSentiment} />

      {/* VIX Gauge */}
      <VixGauge vix={data.vix} />

      {/* Fear & Greed Index */}
      <FearGreedGauge fearGreed={data.fearGreedIndex} />

      {/* SPY Card */}
      <IndexCard data={data.spy} />

      {/* QQQ Card */}
      <IndexCard data={data.qqq} />
    </div>
  );
}

function MarketSentimentBadge({ sentiment }: { sentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' }) {
  const config = {
    RISK_ON: {
      bg: 'bg-bull/20',
      border: 'border-bull/40',
      text: 'text-bull',
      label: '🟢 RISK ON',
      description: 'Bullish conditions',
    },
    RISK_OFF: {
      bg: 'bg-bear/20',
      border: 'border-bear/40',
      text: 'text-bear',
      label: '🔴 RISK OFF',
      description: 'Defensive stance',
    },
    NEUTRAL: {
      bg: 'bg-yellow-500/20',
      border: 'border-yellow-500/40',
      text: 'text-yellow-400',
      label: '⚪ NEUTRAL',
      description: 'Mixed signals',
    },
  };

  const c = config[sentiment];

  return (
    <div className={cn('rounded-xl p-4 border', c.bg, c.border)}>
      <div className="text-center">
        <div className={cn('text-lg font-bold', c.text)}>{c.label}</div>
        <div className="text-xs text-text-muted mt-1">{c.description}</div>
      </div>
    </div>
  );
}

function VixGauge({ vix }: { vix: VixData | null }) {
  if (!vix) return null;

  const levelConfig = {
    LOW: { color: 'text-bull', bg: 'bg-bull', description: 'Low volatility' },
    NORMAL: { color: 'text-green-400', bg: 'bg-green-400', description: 'Normal' },
    ELEVATED: { color: 'text-yellow-400', bg: 'bg-yellow-400', description: 'Elevated' },
    HIGH: { color: 'text-orange-400', bg: 'bg-orange-400', description: 'High volatility' },
    EXTREME: { color: 'text-bear', bg: 'bg-bear', description: 'Extreme fear' },
  };

  const config = levelConfig[vix.level];
  const changeIcon = vix.change >= 0 ? (
    <TrendingUp className="w-3 h-3" />
  ) : (
    <TrendingDown className="w-3 h-3" />
  );

  return (
    <div className="bg-background-card border border-background-elevated rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted font-medium">VIX</span>
        <AlertTriangle className={cn('w-4 h-4', config.color)} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold', config.color)}>{vix.value.toFixed(1)}</span>
        <span
          className={cn('text-xs flex items-center', vix.change >= 0 ? 'text-bear' : 'text-bull')}
        >
          {changeIcon}
          {Math.abs(vix.changePercent).toFixed(1)}%
        </span>
      </div>
      <div className="mt-2">
        <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', config.bg)}
            style={{ width: `${Math.min(100, (vix.value / 40) * 100)}%` }}
          />
        </div>
        <div className="text-xs text-text-muted mt-1">{config.description}</div>
      </div>
    </div>
  );
}

function FearGreedGauge({ fearGreed }: { fearGreed: FearGreedIndex }) {
  const labelConfig: Record<string, { color: string; emoji: string }> = {
    EXTREME_FEAR: { color: 'text-bear', emoji: '😱' },
    FEAR: { color: 'text-orange-400', emoji: '😰' },
    NEUTRAL: { color: 'text-yellow-400', emoji: '😐' },
    GREED: { color: 'text-green-400', emoji: '😊' },
    EXTREME_GREED: { color: 'text-bull', emoji: '🤑' },
  };

  const config = labelConfig[fearGreed.label] || labelConfig.NEUTRAL;
  const displayLabel = fearGreed.label.replace('_', ' ');

  return (
    <div className="bg-background-card border border-background-elevated rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-text-muted font-medium">FEAR & GREED</span>
        <span className="text-lg">{config.emoji}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={cn('text-2xl font-bold', config.color)}>{fearGreed.score}</span>
        <span className="text-xs text-text-muted">/ 100</span>
      </div>
      <div className="mt-2">
        <div className="h-2 bg-background-elevated rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${fearGreed.score}%`,
              background: `linear-gradient(to right, #ef4444, #f97316, #eab308, #22c55e, #22c55e)`,
            }}
          />
        </div>
        <div className={cn('text-xs mt-1 font-medium', config.color)}>{displayLabel}</div>
      </div>
    </div>
  );
}

function IndexCard({ data }: { data: TickerSnapshot | null }) {
  if (!data) return null;

  const isPositive = data.changePercent >= 0;
  
  // Check if market is currently open (ET timezone)
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hour = etTime.getHours();
  const minute = etTime.getMinutes();
  const dayOfWeek = etTime.getDay(); // 0 = Sunday, 6 = Saturday
  const timeInMinutes = hour * 60 + minute;
  
  // Market hours: 9:30 AM - 4:00 PM ET, Monday-Friday
  const isMarketOpen = dayOfWeek >= 1 && dayOfWeek <= 5 && timeInMinutes >= 570 && timeInMinutes < 960;
  
  // Format last trade time if available
  let lastTradeTimeStr = null;
  if (data.lastTradeTime) {
    const tradeTime = new Date(data.lastTradeTime);
    const tradeET = new Date(tradeTime.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hours = tradeET.getHours();
    const minutes = tradeET.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    lastTradeTimeStr = `${displayHours}:${minutes.toString().padStart(2, '0')} ${ampm} ET`;
  }
  
  // If market is closed, show a small indicator
  const marketStatus = isMarketOpen ? null : (
    <span className="text-[9px] text-text-muted">Market Closed</span>
  );

  return (
    <div className="bg-background-card border border-background-elevated rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-text-primary">{data.ticker}</span>
        <div className="flex items-center gap-1">
          {marketStatus}
          {isPositive ? (
            <TrendingUp className="w-4 h-4 text-bull" />
          ) : (
            <TrendingDown className="w-4 h-4 text-bear" />
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold text-text-primary">${data.price.toFixed(2)}</span>
        <span className={cn('text-sm font-medium', isPositive ? 'text-bull' : 'text-bear')}>
          {isPositive ? '+' : ''}
          {data.changePercent.toFixed(2)}%
        </span>
      </div>
      {!isMarketOpen && lastTradeTimeStr && (
        <div className="mt-1">
          <span className="text-[9px] text-text-muted">Last trade: {lastTradeTimeStr}</span>
        </div>
      )}
      {!isMarketOpen && !lastTradeTimeStr && (
        <div className="mt-1">
          <span className="text-[9px] text-text-muted">Last trade from market hours</span>
        </div>
      )}
      <div className="mt-3 pt-3 border-t border-background-elevated">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-text-muted">R1:</span>
            <span className="text-bull ml-1">${data.levels.r1.toFixed(2)}</span>
          </div>
          <div>
            <span className="text-text-muted">S1:</span>
            <span className="text-bear ml-1">${data.levels.s1.toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LeftSidebarSkeleton() {
  return (
    <div className="w-64 space-y-4 p-4">
      {[...Array(5)].map((_, i) => (
        <div
          key={i}
          className="bg-background-card border border-background-elevated rounded-xl p-4 animate-pulse"
        >
          <div className="h-4 bg-background-elevated rounded w-1/2 mb-2" />
          <div className="h-8 bg-background-elevated rounded w-3/4" />
        </div>
      ))}
    </div>
  );
}

// ============================================
// RIGHT SIDEBAR COMPONENT
// ============================================

export function MarketPulseRightSidebar() {
  const { data, isLoading, lastUpdated, refresh } = useMarketPulse();

  if (isLoading) {
    return <RightSidebarSkeleton />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="w-72 space-y-4 p-4">
      {/* Last Updated */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>Updated {lastUpdated ? formatTimeAgo(lastUpdated) : 'just now'}</span>
        <button
          onClick={() => refresh(true)}
          className="p-1 hover:bg-background-elevated rounded transition-colors"
          title="Force Refresh (bypass cache)"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Top Gainers */}
      <MoversCard
        title="TOP GAINERS"
        icon={<TrendingUp className="w-4 h-4 text-bull" />}
        movers={data.topGainers}
        type="gainer"
      />

      {/* Top Losers */}
      <MoversCard
        title="TOP LOSERS"
        icon={<TrendingDown className="w-4 h-4 text-bear" />}
        movers={data.topLosers}
        type="loser"
      />

      {/* Top News */}
      <NewsCard news={data.topNews} />
    </div>
  );
}

function MoversCard({
  title,
  icon,
  movers,
  type,
}: {
  title: string;
  icon: React.ReactNode;
  movers: Mover[];
  type: 'gainer' | 'loser';
}) {
  const colorClass = type === 'gainer' ? 'text-bull' : 'text-bear';

  return (
    <div className="bg-background-card border border-background-elevated rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <span className="text-xs font-medium text-text-muted">{title}</span>
      </div>
      <div className="space-y-2">
        {movers.slice(0, 4).map((mover) => (
          <div key={mover.ticker} className="flex items-center justify-between">
            <span className="font-medium text-text-primary text-sm">{mover.ticker}</span>
            <span className={cn('text-sm font-medium', colorClass)}>
              {type === 'gainer' ? '+' : ''}
              {mover.changePercent.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NewsCard({ news }: { news: NewsItem[] }) {
  const sentimentConfig = {
    BULLISH: { dot: 'bg-bull' },
    BEARISH: { dot: 'bg-bear' },
    NEUTRAL: { dot: 'bg-yellow-400' },
  };

  return (
    <div className="bg-background-card border border-background-elevated rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Newspaper className="w-4 h-4 text-accent" />
        <span className="text-xs font-medium text-text-muted">TOP NEWS</span>
      </div>
      <div className="space-y-3">
        {news.slice(0, 4).map((item) => (
          <div key={item.id} className="flex gap-2">
            <div
              className={cn(
                'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                sentimentConfig[item.sentiment].dot
              )}
            />
            <div>
              <p className="text-xs text-text-primary line-clamp-2 leading-tight">{item.title}</p>
              {item.tickers.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {item.tickers.slice(0, 2).map((ticker) => (
                    <span
                      key={ticker}
                      className="text-[10px] px-1.5 py-0.5 bg-background-elevated rounded text-text-muted"
                    >
                      {ticker}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RightSidebarSkeleton() {
  return (
    <div className="w-72 space-y-4 p-4">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="bg-background-card border border-background-elevated rounded-xl p-4 animate-pulse"
        >
          <div className="h-4 bg-background-elevated rounded w-1/2 mb-3" />
          <div className="space-y-2">
            {[...Array(4)].map((_, j) => (
              <div key={j} className="h-4 bg-background-elevated rounded" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  return `${Math.floor(seconds / 3600)} hours ago`;
}

// ============================================
// MOBILE COMPONENTS
// ============================================

export function MobileMarketPulse() {
  const { data, isLoading } = useMarketPulse();

  if (isLoading || !data) return null;

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-bold text-text-primary">Market Pulse</h3>

      {/* Horizontal scroll for index cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4">
        {data.spy && <MobileIndexCard data={data.spy} />}
        {data.qqq && <MobileIndexCard data={data.qqq} />}
        {data.vix && <MobileVixCard vix={data.vix} />}
      </div>

      {/* Movers row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-background-card border border-background-elevated rounded-xl p-3">
          <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
            <TrendingUp className="w-3 h-3 text-bull" />
            Gainers
          </div>
          {data.topGainers.slice(0, 3).map((m) => (
            <div key={m.ticker} className="flex justify-between text-sm">
              <span className="text-text-primary">{m.ticker}</span>
              <span className="text-bull">+{m.changePercent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div className="bg-background-card border border-background-elevated rounded-xl p-3">
          <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
            <TrendingDown className="w-3 h-3 text-bear" />
            Losers
          </div>
          {data.topLosers.slice(0, 3).map((m) => (
            <div key={m.ticker} className="flex justify-between text-sm">
              <span className="text-text-primary">{m.ticker}</span>
              <span className="text-bear">{m.changePercent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileIndexCard({ data }: { data: TickerSnapshot }) {
  const isPositive = data.changePercent >= 0;
  return (
    <div className="flex-shrink-0 w-36 bg-background-card border border-background-elevated rounded-xl p-3">
      <div className="text-sm font-bold text-text-primary">{data.ticker}</div>
      <div className="text-lg font-bold text-text-primary">${data.price.toFixed(2)}</div>
      <div className={cn('text-sm', isPositive ? 'text-bull' : 'text-bear')}>
        {isPositive ? '+' : ''}
        {data.changePercent.toFixed(2)}%
      </div>
    </div>
  );
}

function MobileVixCard({ vix }: { vix: VixData }) {
  return (
    <div className="flex-shrink-0 w-36 bg-background-card border border-background-elevated rounded-xl p-3">
      <div className="text-sm font-bold text-text-primary">VIX</div>
      <div className="text-lg font-bold text-yellow-400">{vix.value.toFixed(1)}</div>
      <div className="text-sm text-text-muted">{vix.level}</div>
    </div>
  );
}
