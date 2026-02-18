'use client';

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface Card {
  icon: string;
  title: string;
  subtitle: string;
  metric: string;
  metricColor: string;
  query: string;
  dimension: 1 | 2 | 3 | 4;
  apiEndpoint?: string;
  overrideTickers?: string[];  // Forces specific tickers instead of watchlist
}

interface MissionBriefingCardsProps {
  watchlist?: string[];
  onCardClick?: (query: string, dimension?: number, apiEndpoint?: string, overrideTickers?: string[]) => void;
}

export function MissionBriefingCards({ watchlist = [], onCardClick }: MissionBriefingCardsProps) {
  const [hoveredCard, setHoveredCard] = useState<number | null>(null);

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
  });

  const { data: regime } = useQuery({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data || {};
    },
  });

  // Determine time of day (ET)
  const timeOfDay = useMemo(() => {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const hour = etTime.getHours();
    if (hour >= 4 && hour < 9.5) return 'pre-market';
    if (hour >= 9.5 && hour < 16) return 'market';
    return 'after-hours';
  }, []);

  // Generate dynamic cards based on time and market data
  const cards = useMemo(() => {
    const spyPrice = prices?.SPY?.price || 0;
    const spyChange = prices?.SPY?.changePercent || 0;
    const topTicker = watchlist[0] || 'SPY';
    const topTickerPrice = prices?.[topTicker]?.price || 0;
    const topTickerChange = prices?.[topTicker]?.changePercent || 0;
    const callWall = levels?.callWall || 0;
    const month = new Date().getMonth() + 1;

    if (timeOfDay === 'pre-market') {
      const watchlistTickers = watchlist.slice(0, 3).join(',') || 'SPY,QQQ,NVDA';
      const highImpactEvents = 2; // Placeholder - would count from economic calendar
      
      return [
        {
          icon: '📈',
          title: 'Pre-Market Movers',
          subtitle: `Scanning ${watchlist.slice(0, 3).join(', ') || 'market'}`,
          metric: `${topTickerChange >= 0 ? '+' : ''}${topTickerChange.toFixed(2)}%`,
          metricColor: topTickerChange >= 0 ? '#00e676' : '#ff5252',
          query: `Analyze pre-market movers for ${watchlist.slice(0, 3).join(', ') || 'SPY, QQQ'}. Top mover: ${topTicker} at ${topTickerChange >= 0 ? '+' : ''}${topTickerChange.toFixed(2)}%. Include gap analysis and overnight flow.`,
          dimension: 1 as const,
          apiEndpoint: '/api/premarket-setup',
        },
        {
          icon: '🌙',
          title: 'Overnight Gap Analysis',
          subtitle: 'Futures gap and overnight flow',
          metric: `${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%`,
          metricColor: spyChange >= 0 ? '#00e676' : '#ff5252',
          query: `Analyze SPY overnight gap: ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%. Current price $${spyPrice.toFixed(2)}. Include futures positioning, overnight options flow, and gap fill probability.`,
          dimension: 1 as const,
          apiEndpoint: '/api/overnight-gaps',
        },
        {
          icon: '🎯',
          title: "Today's Key Levels",
          subtitle: 'Call/put wall and gamma pinning zones',
          metric: `$${callWall.toFixed(0)}`,
          metricColor: '#00e5ff',
          query: `Analyze SPY key levels for today: Call wall at $${callWall.toFixed(0)}, Put wall at $${levels?.putWall?.toFixed(0) || 0}, Max gamma at $${levels?.maxGamma?.toFixed(0) || 0}. Include gamma squeeze risk and pinning probability.`,
          dimension: 1 as const,
          apiEndpoint: '/api/levels',
        },
        {
          icon: '📅',
          title: "Today's Economic Calendar",
          subtitle: 'Key events, earnings, and data releases',
          metric: `${highImpactEvents} events`,
          metricColor: '#ffc107',
          query: "Show me today's economic calendar",
          dimension: 1 as const,
          apiEndpoint: '/api/economic-calendar',
        },
        {
          icon: '💎',
          title: 'Highest Conviction Flow',
          subtitle: 'Top unusual options activity',
          metric: '$45M',
          metricColor: '#00e5ff',
          query: `Show me the highest conviction options flow right now. Focus on unusual activity, sweeps, and institutional positioning. Include premium, delta-adjusted flow, and smart money signals.`,
          dimension: 3 as const,
        },
      ];
    } else if (timeOfDay === 'market') {
      const highImpactEvents = 1; // Placeholder
      
      return [
        {
          icon: '⚡',
          title: 'Gamma Squeeze Risk',
          subtitle: 'Call wall acting as magnet',
          metric: `+2.4B GEX`,
          metricColor: '#00e676',
          query: `Analyze SPY gamma squeeze risk. Call wall at $${callWall.toFixed(0)}, current GEX +2.4B. Include flow, positioning, and probability of squeeze.`,
          dimension: 2 as const,
          apiEndpoint: 'bullish_setups',
        },
        {
          icon: '💎',
          title: 'Highest Conviction Flow',
          subtitle: `Top unusual options across ${watchlist.slice(0, 2).join(', ') || 'market'}`,
          metric: '$45M',
          metricColor: '#00e5ff',
          query: `Show me the highest conviction options flow for ${watchlist.slice(0, 2).join(', ') || 'SPY, QQQ'}. Focus on unusual activity, sweeps, and institutional positioning.`,
          dimension: 3 as const,
        },
        {
          icon: '📊',
          title: 'Bullish Setups Now',
          subtitle: `Scanning ${watchlist.slice(0, 3).join(', ') || 'market'}`,
          metric: '3 setups',
          metricColor: '#00e676',
          query: `Identify bullish trading setups right now for ${watchlist.slice(0, 3).join(', ') || 'SPY, QQQ, NVDA'}. Include entry, target, stop, and conviction level.`,
          dimension: 2 as const,
          apiEndpoint: 'bullish_setups',
        },
        {
          icon: '📅',
          title: 'Upcoming Events',
          subtitle: 'Earnings and economic data today',
          metric: `${highImpactEvents} events`,
          metricColor: '#ffc107',
          query: "Show me today's economic calendar",
          dimension: 1 as const,
          apiEndpoint: '/api/economic-calendar',
        },
        {
          icon: '🎯',
          title: `${topTicker} Quick Thesis`,
          subtitle: `Trading thesis for ${topTicker}`,
          metric: `${topTickerChange >= 0 ? '+' : ''}${topTickerChange.toFixed(2)}%`,
          metricColor: topTickerChange >= 0 ? '#00e676' : '#ff5252',
          query: `Full trading thesis for ${topTicker}. Current price $${topTickerPrice.toFixed(2)} (${topTickerChange >= 0 ? '+' : ''}${topTickerChange.toFixed(2)}%). Include verdict, entry, target, stop, and key levels.`,
          dimension: 4 as const,
        },
      ];
    } else {
      return [
        {
          icon: '📋',
          title: 'End of Day Summary',
          subtitle: 'SPY & QQQ — key moves and levels',
          metric: `${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%`,
          metricColor: spyChange >= 0 ? '#00e676' : '#ff5252',
          query: 'End of day summary for SPY and QQQ',
          dimension: 2 as const,
          apiEndpoint: 'eod_summary',
          overrideTickers: ['SPY', 'QQQ'],
        },
        {
          icon: '🌙',
          title: 'After-Hours Movers',
          subtitle: 'Stocks moving after hours',
          metric: `${topTickerChange >= 0 ? '+' : ''}${topTickerChange.toFixed(2)}%`,
          metricColor: topTickerChange >= 0 ? '#00e676' : '#ff5252',
          query: `Analyze after-hours movers. Top mover: ${topTicker} at ${topTickerChange >= 0 ? '+' : ''}${topTickerChange.toFixed(2)}%. Include AH flow and implications for tomorrow.`,
          dimension: 2 as const,
          apiEndpoint: 'afterhours_movers',
        },
        month === 2
          ? {
              icon: '⚠️',
              title: 'February Tech Seasonality Risk',
              subtitle: 'Historical risk for QQQ/NVDA',
              metric: '-2.1% avg',
              metricColor: '#ff5252',
              query: `Analyze February tech seasonality. Historical average: -2.1% for QQQ/NVDA. Include historical patterns, risk factors, and current positioning vs history.`,
              dimension: 2 as const,
              apiEndpoint: 'seasonality',
            }
          : {
              icon: '💎',
              title: 'Highest Conviction Flow',
              subtitle: "Today's top flow recap",
              metric: '$45M',
              metricColor: '#00e5ff',
              query: `Recap today's highest conviction options flow. Total premium $45M. Include top trades, smart money signals, and implications.`,
              dimension: 3 as const,
            },
        {
          icon: '💎',
          title: 'Highest Conviction Flow',
          subtitle: "Today's top flow recap",
          metric: '$45M',
          metricColor: '#00e5ff',
          query: `Recap today's highest conviction options flow. Total premium $45M. Include top trades, smart money signals, and implications.`,
          dimension: 3 as const,
        },
      ];
    }
  }, [timeOfDay, watchlist, prices, levels]);

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <div>
        <h2 className="text-lg font-bold text-white mb-2">
          Good {timeOfDay === 'pre-market' ? 'morning' : timeOfDay === 'market' ? 'afternoon' : 'evening'}
        </h2>
        <p className="text-sm text-[#8b99b0]">
          Markets are in{' '}
          <span
            className="font-semibold"
            style={{
              color:
                regime?.status === 'CRISIS'
                  ? '#ff5252'
                  : regime?.status === 'ELEVATED'
                  ? '#ffc107'
                  : '#00e676',
            }}
          >
            {regime?.status || 'NORMAL'}
          </span>{' '}
          mode. VIX at {regime?.vix?.toFixed(2) || '—'}. What do you want to analyze?
        </p>
      </div>

      {/* Mission Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ maxWidth: '680px' }}>
        {cards.map((card, idx) => (
          <div
            key={idx}
            onClick={() => onCardClick?.(card.query, card.dimension, card.apiEndpoint, (card as Card).overrideTickers)}
            onMouseEnter={() => setHoveredCard(idx)}
            onMouseLeave={() => setHoveredCard(null)}
            className={cn(
              'p-3.5 rounded-lg cursor-pointer transition-all duration-250',
              hoveredCard === idx
                ? 'bg-[rgba(0,229,255,0.06)] border-[rgba(0,229,255,0.25)] -translate-y-0.5'
                : 'bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.05)]'
            )}
            style={{ border: '1px solid' }}
          >
            <div className="flex justify-between items-start mb-1.5">
              <div className="flex items-center gap-2">
                <span className="text-sm">{card.icon}</span>
                <span className="text-[13px] font-semibold text-white">{card.title}</span>
                {card.dimension === 1 && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ background: 'rgba(0,230,118,0.15)', color: '#00e676' }}
                  >
                    ⚡ &lt;1s
                  </span>
                )}
                {card.dimension === 2 && (
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                    style={{ background: 'rgba(0,229,255,0.15)', color: '#00e5ff' }}
                  >
                    ⚡ 2-5s
                  </span>
                )}
              </div>
              {card.metric && (
                <span
                  className="text-[11px] font-bold"
                  style={{ color: card.metricColor, fontFamily: "'Oxanium', monospace" }}
                >
                  {card.metric}
                </span>
              )}
            </div>
            <div className="text-[11px] text-[#4a6070] leading-snug pl-6">{card.subtitle}</div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      {watchlist.length > 0 && (
        <div>
          <div className="text-[9px] uppercase tracking-wider mb-2" style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
            QUICK ACTIONS FOR YOUR WATCHLIST
          </div>
          <div className="flex flex-wrap gap-2">
            {watchlist.slice(0, 5).map((ticker) => (
              <button
                key={ticker}
                onClick={() => onCardClick?.(`Full trading thesis for ${ticker}`)}
                className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors hover:bg-[rgba(0,229,255,0.06)]"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  color: '#e0e6f0',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full inline-block mr-1.5 align-middle" style={{ backgroundColor: '#00e5ff' }} />
                {ticker} Thesis
              </button>
            ))}
            <button
              onClick={() => onCardClick?.('End of day summary for my watchlist')}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors hover:bg-[rgba(0,229,255,0.06)]"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                color: '#e0e6f0',
              }}
            >
              📋 EOD Summary
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
