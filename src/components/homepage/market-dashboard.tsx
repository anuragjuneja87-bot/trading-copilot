'use client';

import { useState, createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { 
  TrendingUp, 
  TrendingDown, 
  Activity, 
  AlertTriangle,
  Newspaper,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  BarChart3,
  MessageSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLORS } from '@/lib/echarts-theme';
import { useRealtimePrice } from '@/hooks/use-realtime-price';
import type { MarketPulseData, VixData, TickerSnapshot, FearGreedIndex, Mover, NewsItem } from '@/types/market-pulse';

// ============================================
// CONTEXT
// ============================================

const MarketPulseContext = createContext<{
  data: MarketPulseData | null;
  isLoading: boolean;
  lastUpdated: Date | null;
  refresh: () => void;
}>({
  data: null,
  isLoading: true,
  lastUpdated: null,
  refresh: () => {},
});

export const useMarketPulse = () => useContext(MarketPulseContext);

// ============================================
// PROVIDER
// ============================================

export function MarketPulseProvider({ children }: { children: React.ReactNode }) {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['market-pulse-homepage'],
    queryFn: async () => {
      const response = await fetch('/api/market-pulse');
      const result = await response.json();
      if (result.success) {
        setLastUpdated(new Date());
        return result.data as MarketPulseData;
      }
      throw new Error('Failed to fetch market pulse');
    },
    refetchInterval: 60000, // Refresh every 60 seconds
    staleTime: 30000,
  });

  return (
    <MarketPulseContext.Provider value={{ data: data || null, isLoading, lastUpdated, refresh: refetch }}>
      {children}
    </MarketPulseContext.Provider>
  );
}

// ============================================
// LEFT SIDEBAR
// ============================================

export function LeftSidebar() {
  const { data, isLoading } = useMarketPulse();

  if (isLoading) {
    return <SidebarSkeleton side="left" />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="w-[220px] flex-shrink-0 space-y-3 p-4">
      {/* Market Sentiment Badge */}
      <MarketSentimentBadge sentiment={data.marketSentiment} />
      
      {/* VIX Gauge */}
      <VixGauge vix={data.vix} />
      
      {/* Fear & Greed */}
      <FearGreedGauge fearGreed={data.fearGreedIndex} />
      
      {/* SPY Card */}
      <IndexCard data={data.spy} />
      
      {/* QQQ Card */}
      <IndexCard data={data.qqq} />
    </div>
  );
}

// ============================================
// RIGHT SIDEBAR
// ============================================

export function RightSidebar() {
  const { data, isLoading, lastUpdated, refresh } = useMarketPulse();

  if (isLoading) {
    return <SidebarSkeleton side="right" />;
  }

  if (!data) {
    return null;
  }

  return (
    <div className="w-[240px] flex-shrink-0 space-y-3 p-4">
      {/* Last Updated + Refresh */}
      <div className="flex items-center justify-between text-[10px] text-[#4a6070]">
        <span>
          Updated {lastUpdated ? formatTimeAgo(lastUpdated) : 'just now'}
        </span>
        <button 
          onClick={() => refresh()}
          className="p-1.5 rounded hover:bg-[rgba(255,255,255,0.05)] transition-colors"
          title="Refresh"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Top Gainers */}
      <MoversCard 
        title="TOP GAINERS" 
        icon={<TrendingUp className="w-3.5 h-3.5" style={{ color: COLORS.green }} />}
        movers={data.topGainers} 
        type="gainer" 
      />
      
      {/* Top Losers */}
      <MoversCard 
        title="TOP LOSERS" 
        icon={<TrendingDown className="w-3.5 h-3.5" style={{ color: COLORS.red }} />}
        movers={data.topLosers} 
        type="loser" 
      />
      
      {/* Top News */}
      <NewsCard news={data.topNews} />

      {/* Quick Actions */}
      <QuickActions />
    </div>
  );
}

// ============================================
// COMPONENT: Market Sentiment Badge
// ============================================

function MarketSentimentBadge({ sentiment }: { sentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' }) {
  const config = {
    RISK_ON: { 
      bg: COLORS.glowGreen, 
      border: 'rgba(0,230,118,0.3)', 
      color: COLORS.green, 
      label: '🟢 RISK ON',
      description: 'Bullish conditions'
    },
    RISK_OFF: { 
      bg: COLORS.glowRed, 
      border: 'rgba(255,82,82,0.3)', 
      color: COLORS.red, 
      label: '🔴 RISK OFF',
      description: 'Defensive stance'
    },
    NEUTRAL: { 
      bg: 'rgba(255,193,7,0.1)', 
      border: 'rgba(255,193,7,0.3)', 
      color: COLORS.yellow, 
      label: '⚪ NEUTRAL',
      description: 'Mixed signals'
    },
  };

  const c = config[sentiment];

  return (
    <div 
      className="rounded-xl p-3 text-center"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <div className="text-sm font-bold" style={{ color: c.color, fontFamily: "'Oxanium', monospace" }}>
        {c.label}
      </div>
      <div className="text-[10px] text-[#8b99b0] mt-0.5">{c.description}</div>
    </div>
  );
}

// ============================================
// COMPONENT: VIX Gauge
// ============================================

function VixGauge({ vix }: { vix: VixData | null }) {
  if (!vix) return null;

  const levelConfig = {
    LOW: { color: COLORS.green, description: 'Low volatility' },
    NORMAL: { color: '#4ade80', description: 'Normal' },
    ELEVATED: { color: COLORS.yellow, description: 'Elevated' },
    HIGH: { color: '#f97316', description: 'High volatility' },
    EXTREME: { color: COLORS.red, description: 'Extreme fear' },
  };

  const config = levelConfig[vix.level];
  const gaugePercent = Math.min(100, (vix.value / 40) * 100);

  return (
    <div 
      className="rounded-xl p-3"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-wider font-bold" 
          style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
          VIX
        </span>
        <AlertTriangle className="w-3.5 h-3.5" style={{ color: config.color }} />
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-bold" style={{ color: config.color, fontFamily: "'Oxanium', monospace" }}>
          {vix.value.toFixed(1)}
        </span>
        <span className={cn("text-[10px] flex items-center", vix.change >= 0 ? 'text-red-400' : 'text-green-400')}>
          {vix.change >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {Math.abs(vix.changePercent).toFixed(1)}%
        </span>
      </div>
      <div className="mt-2">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div 
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${gaugePercent}%`, background: config.color }}
          />
        </div>
        <div className="text-[9px] mt-1" style={{ color: '#4a6070' }}>{config.description}</div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENT: Fear & Greed Gauge
// ============================================

function FearGreedGauge({ fearGreed }: { fearGreed: FearGreedIndex }) {
  const labelConfig: Record<string, { color: string; emoji: string }> = {
    EXTREME_FEAR: { color: COLORS.red, emoji: '😱' },
    FEAR: { color: '#f97316', emoji: '😰' },
    NEUTRAL: { color: COLORS.yellow, emoji: '😐' },
    GREED: { color: '#4ade80', emoji: '😊' },
    EXTREME_GREED: { color: COLORS.green, emoji: '🤑' },
  };

  const config = labelConfig[fearGreed.label] || labelConfig.NEUTRAL;
  const displayLabel = fearGreed.label.replace(/_/g, ' ');

  return (
    <div 
      className="rounded-xl p-3"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] uppercase tracking-wider font-bold" 
          style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
          FEAR & GREED
        </span>
        <span className="text-base">{config.emoji}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-xl font-bold" style={{ color: config.color, fontFamily: "'Oxanium', monospace" }}>
          {fearGreed.score}
        </span>
        <span className="text-[10px]" style={{ color: '#4a6070' }}>/ 100</span>
      </div>
      <div className="mt-2">
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          <div 
            className="h-full rounded-full transition-all duration-500"
            style={{ 
              width: `${fearGreed.score}%`,
              background: `linear-gradient(to right, ${COLORS.red}, #f97316, ${COLORS.yellow}, #4ade80, ${COLORS.green})`
            }}
          />
        </div>
        <div className="text-[9px] font-medium mt-1" style={{ color: config.color }}>{displayLabel}</div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENT: Index Card (SPY/QQQ)
// ============================================

function IndexCard({ data }: { data: TickerSnapshot | null }) {
  if (!data) return null;

  // Use real-time price if available, fallback to static data
  const realtime = useRealtimePrice(data.ticker);
  const price = realtime.price ?? data.price;
  const changePercent = realtime.changePercent ?? data.changePercent;
  const isPositive = changePercent >= 0;

  return (
    <div 
      className="rounded-xl p-3"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
          {data.ticker}
        </span>
        <div className="flex items-center gap-1">
          {realtime.isLive && (
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: COLORS.green }} />
          )}
          {isPositive ? (
            <TrendingUp className="w-3.5 h-3.5" style={{ color: COLORS.green }} />
          ) : (
            <TrendingDown className="w-3.5 h-3.5" style={{ color: COLORS.red }} />
          )}
        </div>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-lg font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
          ${price.toFixed(2)}
        </span>
        <span 
          className="text-xs font-medium"
          style={{ color: isPositive ? COLORS.green : COLORS.red }}
        >
          {isPositive ? '+' : ''}{changePercent.toFixed(2)}%
        </span>
      </div>
      <div className="mt-2 pt-2 grid grid-cols-2 gap-2 text-[10px]" 
        style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div>
          <span style={{ color: '#4a6070' }}>R1: </span>
          <span style={{ color: COLORS.green }}>${data.levels.r1.toFixed(2)}</span>
        </div>
        <div>
          <span style={{ color: '#4a6070' }}>S1: </span>
          <span style={{ color: COLORS.red }}>${data.levels.s1.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// COMPONENT: Movers Card
// ============================================

function MoversCard({ 
  title, 
  icon,
  movers, 
  type 
}: { 
  title: string;
  icon: React.ReactNode;
  movers: Mover[];
  type: 'gainer' | 'loser';
}) {
  const colorStyle = type === 'gainer' ? { color: COLORS.green } : { color: COLORS.red };

  return (
    <div 
      className="rounded-xl p-3"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        {icon}
        <span className="text-[9px] uppercase tracking-wider font-bold" 
          style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
          {title}
        </span>
      </div>
      <div className="space-y-1.5">
        {movers.slice(0, 4).map((mover) => (
          <Link 
            href={`/ask?symbol=${mover.ticker}`}
            key={mover.ticker} 
            className="flex items-center justify-between hover:bg-[rgba(255,255,255,0.03)] rounded px-1 py-0.5 -mx-1 transition-colors"
          >
            <span className="font-medium text-white text-xs" style={{ fontFamily: "'Oxanium', monospace" }}>
              {mover.ticker}
            </span>
            <span className="text-xs font-medium" style={colorStyle}>
              {type === 'gainer' ? '+' : ''}{mover.changePercent.toFixed(1)}%
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ============================================
// COMPONENT: News Card
// ============================================

function NewsCard({ news }: { news: NewsItem[] }) {
  const sentimentConfig = {
    BULLISH: { dot: COLORS.green },
    BEARISH: { dot: COLORS.red },
    NEUTRAL: { dot: COLORS.yellow },
  };

  return (
    <div 
      className="rounded-xl p-3"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center gap-1.5 mb-2">
        <Newspaper className="w-3.5 h-3.5" style={{ color: COLORS.cyan }} />
        <span className="text-[9px] uppercase tracking-wider font-bold" 
          style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
          TOP NEWS
        </span>
      </div>
      <div className="space-y-2">
        {news.slice(0, 4).map((item) => (
          <div key={item.id} className="flex gap-2">
            <div 
              className="w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0"
              style={{ backgroundColor: sentimentConfig[item.sentiment].dot }}
            />
            <div>
              <p className="text-[10px] text-[#c5d0e6] line-clamp-2 leading-tight">
                {item.title}
              </p>
              {item.tickers.length > 0 && (
                <div className="flex gap-1 mt-1">
                  {item.tickers.slice(0, 2).map((ticker) => (
                    <span 
                      key={ticker}
                      className="text-[8px] px-1 py-0.5 rounded"
                      style={{ background: 'rgba(255,255,255,0.05)', color: '#8b99b0' }}
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

// ============================================
// COMPONENT: Quick Actions
// ============================================

function QuickActions() {
  return (
    <div 
      className="rounded-xl p-3"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="text-[9px] uppercase tracking-wider font-bold mb-2" 
        style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
        QUICK ACTIONS
      </div>
      <div className="space-y-1.5">
        <Link 
          href="/flow"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors hover:bg-[rgba(0,229,255,0.08)]"
          style={{ color: '#8b99b0' }}
        >
          <BarChart3 className="w-3.5 h-3.5" style={{ color: COLORS.cyan }} />
          Options Flow
        </Link>
        <Link 
          href="/darkpool"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors hover:bg-[rgba(0,229,255,0.08)]"
          style={{ color: '#8b99b0' }}
        >
          <Activity className="w-3.5 h-3.5" style={{ color: COLORS.cyan }} />
          Dark Pool
        </Link>
        <Link 
          href="/ask"
          className="flex items-center gap-2 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-colors hover:bg-[rgba(0,229,255,0.08)]"
          style={{ color: '#8b99b0' }}
        >
          <MessageSquare className="w-3.5 h-3.5" style={{ color: COLORS.cyan }} />
          Ask AI
        </Link>
      </div>
    </div>
  );
}

// ============================================
// COMPONENT: Sidebar Skeleton
// ============================================

function SidebarSkeleton({ side }: { side: 'left' | 'right' }) {
  const width = side === 'left' ? 'w-[220px]' : 'w-[240px]';
  
  return (
    <div className={`${width} flex-shrink-0 space-y-3 p-4`}>
      {[...Array(5)].map((_, i) => (
        <div 
          key={i} 
          className="rounded-xl p-3 animate-pulse"
          style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
        >
          <div className="h-3 w-16 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          <div className="h-6 w-24 mt-2 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          {i < 3 && (
            <div className="h-1.5 w-full mt-2 rounded" style={{ background: 'rgba(255,255,255,0.05)' }} />
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================
// HELPER: Format time ago
// ============================================

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  
  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1 min ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  return `${Math.floor(seconds / 3600)} hours ago`;
}
