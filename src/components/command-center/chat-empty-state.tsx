'use client';

import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { generateSuggestions, getTimeOfDay } from '@/lib/chat-utils';
import { useMemo } from 'react';

interface RegimeData {
  status: 'normal' | 'elevated' | 'crisis';
  vixLevel: number;
}

interface Price {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

interface ChatEmptyStateProps {
  onSuggestionClick: (prompt: string) => void;
  watchlist?: string[];
}

export function ChatEmptyState({ onSuggestionClick, watchlist = [] }: ChatEmptyStateProps) {
  const { data: session } = useSession();
  const timeOfDayCategory = getTimeOfDay();
  const month = new Date().getMonth() + 1;

  // Fetch regime and VIX
  const { data: regime } = useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000,
  });

  const { data: pricesData } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['VIX']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=VIX');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const vix = pricesData?.prices?.find((p) => p.ticker === 'VIX');
  const vixLevel = vix?.price || regime?.vixLevel || 26.12;
  const regimeStatus = regime?.status || 'normal';

  // Generate smart suggestions
  const suggestions = useMemo(() => {
    return generateSuggestions(
      timeOfDayCategory,
      regimeStatus?.toUpperCase() as any,
      watchlist,
      month
    );
  }, [timeOfDayCategory, regimeStatus, watchlist, month]);

  const getRegimeLabel = (status: string) => {
    switch (status) {
      case 'crisis':
        return 'CRISIS';
      case 'elevated':
        return 'ELEVATED';
      default:
        return 'NORMAL';
    }
  };

  const getRegimeColor = (status: string) => {
    switch (status) {
      case 'crisis':
        return 'text-bear';
      case 'elevated':
        return 'text-warning';
      default:
        return 'text-bull';
    }
  };

  const getTimeOfDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  const firstName = session?.user?.name?.split(' ')[0] || session?.user?.email?.split('@')[0] || 'there';

  return (
    <div className="flex flex-col items-center justify-center h-full px-6 py-12 text-center">
      {/* Greeting */}
      <h2 className="text-2xl font-bold text-text-primary mb-2">
        Good {getTimeOfDayGreeting()}, {firstName}
      </h2>

      {/* Dynamic Subtitle */}
      <p className="text-sm text-text-secondary mb-8 max-w-md">
        Markets are in{' '}
        <span className={cn('font-semibold', getRegimeColor(regimeStatus))}>
          {getRegimeLabel(regimeStatus)}
        </span>{' '}
        mode. VIX at {vixLevel.toFixed(2)}. Here's what I'm watching:
      </p>

      {/* Suggestion Cards - 2x2 or 2x3 grid on desktop, horizontal scroll on mobile */}
      <div className="w-full max-w-2xl">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-2">
          {suggestions.slice(0, 6).map((suggestion, idx) => (
            <button
              key={idx}
              onClick={() => onSuggestionClick(suggestion.prompt)}
              className="p-4 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,229,255,0.3)] hover:bg-[rgba(255,255,255,0.04)] transition-all text-left group animate-fade-in min-h-[90px]"
              style={{ animationDelay: `${idx * 100}ms` }}
            >
              <div className="flex items-start gap-3">
                <div className="text-[#00e5ff] group-hover:text-[#00b8d4] transition-colors text-lg flex-shrink-0">
                  {suggestion.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-text-primary mb-0.5 text-sm">
                    {suggestion.title}
                  </h3>
                  {suggestion.subtitle && (
                    <p className="text-[10px] text-[#6b7a99] mb-1.5 font-medium">
                      {suggestion.subtitle}
                    </p>
                  )}
                  <p className="text-xs text-text-secondary line-clamp-2">{suggestion.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
        {/* Hint for empty watchlist */}
        {watchlist.length === 0 && (
          <p className="text-xs text-[#6b7a99] mt-3 text-center">
            Add tickers to watchlist for personalized suggestions
          </p>
        )}
      </div>
    </div>
  );
}
