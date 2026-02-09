import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useCallback } from 'react';
import { api } from '@/lib/api';
import { 
  onSocketEvent, 
  subscribeToPrices, 
  unsubscribeFromPrices,
  startPolling,
  stopPolling 
} from '@/lib/socket';
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

  // Subscribe to real-time updates
  useEffect(() => {
    if (!tickers.length) return;

    // WebSocket subscription
    subscribeToPrices(tickers);

    // Listen for real-time updates
    const unsubscribe = onSocketEvent('price:update', (data) => {
      const prices = data as Price[];
      queryClient.setQueryData<Price[]>(
        queryKeys.prices(tickers),
        (old) => {
          if (!old) return prices;
          const priceMap = new Map(old.map((p) => [p.ticker, p]));
          prices.forEach((p) => priceMap.set(p.ticker, p));
          return Array.from(priceMap.values());
        }
      );
    });

    return () => {
      unsubscribeFromPrices(tickers);
      unsubscribe();
    };
  }, [tickers.join(','), queryClient]);

  return query;
}

// Hook for single price with memoized updates
export function usePrice(ticker: string) {
  const prices = useMarketStore((s) => s.prices);
  return prices[ticker] || null;
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

  // Listen for regime changes
  useEffect(() => {
    const unsubscribe = onSocketEvent('regime:change', (data) => {
      queryClient.setQueryData(queryKeys.regime, data);
    });
    return unsubscribe;
  }, [queryClient]);

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

// ═══════════════════════════════════════════════════════════════
//  OPTIONS FLOW HOOKS
// ═══════════════════════════════════════════════════════════════

export function useOptionsFlow(filters?: FlowFilters) {
  const queryClient = useQueryClient();
  const tier = useUserStore((s) => s.tier);
  const config = TIER_CONFIG[tier];

  const query = useQuery({
    queryKey: queryKeys.flow(filters),
    queryFn: () => api.flow.getFlow(filters),
    staleTime: config.hasRealTimeFlow ? 5000 : 30 * 60 * 1000,
    refetchInterval: config.hasRealTimeFlow ? 5000 : 30 * 60 * 1000,
    enabled: config.hasOptionsFlow,
  });

  // Real-time flow updates (pro/elite only)
  useEffect(() => {
    if (!config.hasRealTimeFlow) return;

    const unsubscribe = onSocketEvent('flow:new', (data) => {
      queryClient.setQueryData<OptionsFlow[]>(
        queryKeys.flow(filters),
        (old) => {
          if (!old) return [data as OptionsFlow];
          return [data as OptionsFlow, ...old].slice(0, 100);
        }
      );
    });

    return unsubscribe;
  }, [config.hasRealTimeFlow, filters, queryClient]);

  return query;
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

  // Real-time news updates
  useEffect(() => {
    const unsubscribe = onSocketEvent('news:new', (data) => {
      queryClient.setQueryData<NewsItem[]>(
        queryKeys.news(options),
        (old) => {
          if (!old) return [data as NewsItem];
          return [data as NewsItem, ...old].slice(0, 50);
        }
      );
    });

    return unsubscribe;
  }, [options, queryClient]);

  return query;
}

// ═══════════════════════════════════════════════════════════════
//  AI / CHAT HOOKS
// ═══════════════════════════════════════════════════════════════

export function useMorningBriefing() {
  return useQuery({
    queryKey: queryKeys.briefing,
    queryFn: api.ai.getBriefing,
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
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
  const localWatchlist = useUserStore((s) => s.watchlist);
  const setWatchlist = useUserStore((s) => s.setWatchlist);

  const query = useQuery({
    queryKey: queryKeys.watchlist,
    queryFn: api.user.getWatchlist,
    staleTime: 5 * 60 * 1000,
    // Sync with local state on success
    select: (data) => {
      if (data.length > 0) {
        setWatchlist(data);
      }
      return data;
    },
  });

  // Return local watchlist if API hasn't loaded yet
  return {
    ...query,
    data: query.data || localWatchlist,
  };
}

export function useUpdateWatchlist() {
  const queryClient = useQueryClient();
  const setWatchlist = useUserStore((s) => s.setWatchlist);

  return useMutation({
    mutationFn: api.user.updateWatchlist,
    onMutate: async (tickers) => {
      // Optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.watchlist });
      const previous = queryClient.getQueryData(queryKeys.watchlist);
      queryClient.setQueryData(queryKeys.watchlist, tickers);
      setWatchlist(tickers);
      return { previous };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.watchlist, context.previous);
        setWatchlist(context.previous as string[]);
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.watchlist });
    },
  });
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
