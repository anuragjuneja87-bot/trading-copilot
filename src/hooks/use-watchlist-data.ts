'use client';

import { useQuery } from '@tanstack/react-query';
import { useWatchlistStore, getDataConfig } from '@/stores';

const config = getDataConfig();

/**
 * Hook for fetching options flow data filtered by watchlist
 */
export function useWatchlistOptionsFlow(options?: { 
  enabled?: boolean;
  minPremium?: number;
  unusual?: boolean;
  sweeps?: boolean;
}) {
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const watchlistString = useWatchlistStore((state) => state.watchlistString());

  return useQuery({
    queryKey: ['options-flow', watchlistString, options?.minPremium, options?.unusual, options?.sweeps],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('tickers', watchlistString);
      if (options?.minPremium) params.set('minPremium', options.minPremium.toString());
      if (options?.unusual) params.set('unusual', 'true');
      if (options?.sweeps) params.set('sweeps', 'true');

      const res = await fetch(`/api/flow/options?${params.toString()}`);
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to fetch options flow');
      return data.data;
    },
    enabled: options?.enabled !== false && watchlist.length > 0,
    refetchInterval: config.restPollInterval,
    staleTime: config.restPollInterval / 2,
  });
}

/**
 * Hook for fetching dark pool data filtered by watchlist
 */
export function useDarkPool(options?: {
  enabled?: boolean;
  timeFilter?: 'hour' | 'day' | 'week';
}) {
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const watchlistString = useWatchlistStore((state) => state.watchlistString());

  return useQuery({
    queryKey: ['darkpool', watchlistString, options?.timeFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('tickers', watchlistString);
      if (options?.timeFilter) params.set('time', options.timeFilter);

      const res = await fetch(`/api/darkpool?${params.toString()}`);
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to fetch dark pool data');
      return data.data;
    },
    enabled: options?.enabled !== false && watchlist.length > 0,
    refetchInterval: config.restPollInterval,
    staleTime: config.restPollInterval / 2,
  });
}

/**
 * Hook for fetching news data filtered by watchlist
 */
export function useWatchlistNews(options?: {
  enabled?: boolean;
  limit?: number;
}) {
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const watchlistString = useWatchlistStore((state) => state.watchlistString());

  return useQuery({
    queryKey: ['news', watchlistString, options?.limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('tickers', watchlistString);
      if (options?.limit) params.set('limit', options.limit.toString());

      const res = await fetch(`/api/news?${params.toString()}`);
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to fetch news');
      return data.data;
    },
    enabled: options?.enabled !== false && watchlist.length > 0,
    refetchInterval: config.restPollInterval * 2, // News updates less frequently
    staleTime: config.restPollInterval,
  });
}

/**
 * Hook for fetching levels/support/resistance for watchlist
 */
export function useLevels(ticker?: string) {
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const targetTicker = ticker || watchlist[0];

  return useQuery({
    queryKey: ['levels', targetTicker],
    queryFn: async () => {
      const res = await fetch(`/api/levels?ticker=${targetTicker}`);
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to fetch levels');
      return data.data;
    },
    enabled: !!targetTicker,
    staleTime: 60000, // Levels don't change frequently
  });
}

/**
 * Hook for fetching market pulse (SPY, QQQ, VIX, movers)
 */
export function useMarketPulse() {
  return useQuery({
    queryKey: ['market-pulse'],
    queryFn: async () => {
      const res = await fetch('/api/market-pulse');
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to fetch market pulse');
      return data.data;
    },
    refetchInterval: config.restPollInterval,
    staleTime: config.restPollInterval / 2,
  });
}

/**
 * Hook for AI insights on a specific feature
 */
export function useAIInsightQuery(options: {
  endpoint: string;
  payload: Record<string, any>;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['ai-insight', options.endpoint, JSON.stringify(options.payload)],
    queryFn: async () => {
      const res = await fetch(options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.payload),
      });
      const data = await res.json();
      
      if (!data.success) throw new Error(data.error || 'Failed to generate insight');
      return data.data;
    },
    enabled: options.enabled !== false,
    staleTime: 300000, // AI insights cached for 5 minutes
    refetchOnWindowFocus: false, // Don't auto-refresh AI (expensive)
  });
}
