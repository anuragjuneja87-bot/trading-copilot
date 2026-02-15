import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '@/lib/api';
import { useUserStore, useMarketStore } from '@/stores';
import { TIER_CONFIG } from '@/types';
import type { Price, OptionsFlow, NewsItem, RegimeData, FlowFilters } from '@/types';

// ═══════════════════════════════════════════════════════════════
//  QUERY KEYS
// ═══════════════════════════════════════════════════════════════

export const queryKeys = {
  prices: (tickers: string[]) => ['prices', ...tickers.sort()] as const,
  regime: ['regime'] as const,
  levels: (ticker: string) => ['levels', ticker] as const,
  flow: (filters?: FlowFilters) => ['flow', filters] as const,
  topTickers: (type: string) => ['topTickers', type] as const,
  news: (options?: any) => ['news', options] as const,
  briefing: ['briefing'] as const,
  watchlist: ['watchlist'] as const,
  userProfile: ['userProfile'] as const,
};

// ═══════════════════════════════════════════════════════════════
//  PRICE HOOKS (with real-time updates)
// ═══════════════════════════════════════════════════════════════

export function usePrices(tickers: string[]) {
  const queryClient = useQueryClient();
  const tier = useUserStore((s) => s.tier);
  const config = TIER_CONFIG[tier];

  const query = useQuery({
    queryKey: queryKeys.prices(tickers),
    queryFn: () => api.market.getPrices(tickers),
    staleTime: config.pollInterval * 1000,
    refetchInterval: config.pollInterval * 1000,
    enabled: tickers.length > 0,
  });

  // Real-time updates removed - using polling via refetchInterval instead

  return query;
}

// Hook for single price with memoized updates
export function usePrice(ticker: string) {
  const prices = useMarketStore((s) => s.prices);
  return prices[ticker] || null;
}

// ═══════════════════════════════════════════════════════════════
//  OPTIONS FLOW HOOK
// ═══════════════════════════════════════════════════════════════

export function useOptionsFlow(filters?: {
  tickers?: string;
  minPremium?: number;
  callPut?: string;
  limit?: number;
  unusual?: boolean;
  sweeps?: boolean;
}) {
  const params = new URLSearchParams();
  if (filters?.tickers) params.set('tickers', filters.tickers);
  if (filters?.minPremium) params.set('minPremium', filters.minPremium.toString());
  if (filters?.callPut && filters.callPut !== 'all') params.set('callPut', filters.callPut);
  if (filters?.limit) params.set('limit', filters.limit.toString());
  if (filters?.unusual) params.set('unusual', 'true');
  if (filters?.sweeps) params.set('sweeps', 'true');

  return useQuery({
    queryKey: ['optionsFlow', filters],
    queryFn: async () => {
      const response = await fetch(`/api/flow/options?${params.toString()}`);
      if (!response.ok) {
        throw new Error('Failed to fetch options flow');
      }
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch options flow');
      }
      return data;
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    staleTime: 5000,
  });
}

// ═══════════════════════════════════════════════════════════════
//  REGIME HOOK
// ═══════════════════════════════════════════════════════════════

export function useRegime() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.regime,
    queryFn: api.market.getRegime,
    staleTime: 60 * 1000, // 1 minute
    refetchInterval: 60 * 1000,
  });

  // Real-time regime updates removed - using polling via refetchInterval instead

  return query;
}

// ═══════════════════════════════════════════════════════════════
//  KEY LEVELS HOOK
// ═══════════════════════════════════════════════════════════════

export function useKeyLevels(ticker: string) {
  return useQuery({
    queryKey: queryKeys.levels(ticker),
    queryFn: () => api.market.getKeyLevels(ticker),
    staleTime: 5 * 60 * 1000, // 5 minutes
    enabled: !!ticker,
  });
}


export function useTopTickers(type: 'unusual' | 'sweeps' | 'momentum' | 'premium' = 'unusual') {
  return useQuery({
    queryKey: queryKeys.topTickers(type),
    queryFn: () => api.flow.getTopTickers(type),
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
  });
}

// ═══════════════════════════════════════════════════════════════
//  NEWS HOOKS
// ═══════════════════════════════════════════════════════════════

export function useNews(options?: {
  tickers?: string[];
  severity?: 'all' | 'crisis' | 'elevated';
  limit?: number;
}) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: queryKeys.news(options),
    queryFn: () => api.news.getNews(options),
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000, // 2 minutes
  });

  // Real-time news updates removed - using polling via refetchInterval instead

  return query;
}

// ═══════════════════════════════════════════════════════════════
//  AI / CHAT HOOKS
// ═══════════════════════════════════════════════════════════════

export function useMorningBriefing() {
  // Stub - briefing API deleted for personal use
  return { data: null, isLoading: false, error: null };
}

export function useAskAI() {
  const incrementQuestionsUsed = useUserStore((s) => s.incrementQuestionsUsed);

  return useMutation({
    mutationFn: async ({
      question,
      history,
    }: {
      question: string;
      history?: { role: 'user' | 'assistant'; content: string }[];
    }) => {
      const response = await api.ai.ask(question, history);
      return response;
    },
    onSuccess: () => {
      incrementQuestionsUsed();
    },
  });
}

// ═══════════════════════════════════════════════════════════════
//  WATCHLIST HOOKS
// ═══════════════════════════════════════════════════════════════

export function useWatchlist() {
  // Use zustand directly - no API needed for personal use
  const watchlist = useUserStore((s) => s.watchlist);
  return {
    data: watchlist.map(ticker => ({ ticker })),
    isLoading: false,
    error: null,
  };
}

export function useUpdateWatchlist() {
  // Use zustand directly - no API needed for personal use
  const { addToWatchlist, removeFromWatchlist } = useUserStore();
  return {
    mutate: ({ ticker, action }: { ticker: string; action: 'add' | 'remove' }) => {
      if (action === 'add') addToWatchlist(ticker);
      else removeFromWatchlist(ticker);
    },
  };
}

// ═══════════════════════════════════════════════════════════════
//  COMBINED DATA HOOK (for dashboard)
// ═══════════════════════════════════════════════════════════════

export function useDashboardData() {
  const watchlist = useUserStore((s) => s.watchlist);
  
  const prices = usePrices(watchlist);
  const regime = useRegime();
  const news = useNews({ severity: 'elevated', limit: 10 });
  const briefing = useMorningBriefing();

  return {
    prices,
    regime,
    news,
    briefing,
    isLoading: prices.isLoading || regime.isLoading,
    isError: prices.isError || regime.isError,
  };
}
