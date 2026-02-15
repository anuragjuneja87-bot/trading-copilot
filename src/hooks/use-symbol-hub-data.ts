'use client';

import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { useOptionsFlow, usePrices, useRegime, useKeyLevels, useNews } from './use-trading-data';
import { generateAllMockData } from '@/lib/mock-data';

interface UseSymbolHubDataOptions {
  symbol: string;
  enabled?: boolean;
  demoMode?: boolean;
}

// Dark pool needs a custom hook since it requires auth
function useDarkPool(symbol: string, enabled: boolean) {
  return useQuery({
    queryKey: ['darkpool', symbol],
    queryFn: async () => {
      const res = await fetch(`/api/darkpool?tickers=${symbol}&minSize=50000&time=4hour`, {
        credentials: 'include',
      });
      if (!res.ok) {
        // If 401, return empty (user not logged in or free tier)
        if (res.status === 401) return { prints: [], stats: null };
        throw new Error('Failed to fetch dark pool');
      }
      const data = await res.json();
      return data.success ? data.data : { prints: [], stats: null };
    },
    refetchInterval: 15000,
    enabled,
    retry: 1,
  });
}

export function useSymbolHubData({ symbol, enabled = true, demoMode = false }: UseSymbolHubDataOptions) {
  // If demo mode, generate mock data once (useMemo so it doesn't regenerate on every render)
  const mockData = useMemo(() => {
    if (!demoMode) return null;
    return generateAllMockData(symbol);
  }, [symbol, demoMode]);

  const flow = useOptionsFlow({ tickers: symbol, limit: 100 });
  const prices = usePrices([symbol, 'SPY']); // Always include SPY for relative comparison
  const levels = useKeyLevels(symbol);
  const regime = useRegime();
  const news = useNews({ tickers: [symbol], limit: 8 });
  const darkpool = useDarkPool(symbol, enabled && !demoMode);

  const isLoading = demoMode ? false : (flow.isLoading || prices.isLoading || levels.isLoading);
  const isError = demoMode ? false : (flow.isError && prices.isError && levels.isError);

  // If demo mode, return mock data
  if (demoMode && mockData) {
    return {
      flow: mockData.flow,
      prices: [mockData.price],
      levels: mockData.levels,
      regime: mockData.regime,
      news: mockData.news,
      darkpool: mockData.darkpool,
      isLoading: false,
      isError: false,
      isDemoMode: true,
      refetch: () => {}, // No-op in demo mode
    };
  }

  // Extract data from hook responses
  // useOptionsFlow returns { data: { success: true, data: { flow: [], stats: {} } } }
  const flowData = flow.data?.success ? flow.data.data : null;
  
  // usePrices returns { data: Price[] }
  const pricesData = prices.data || null;
  
  // useKeyLevels returns { data: { callWall, putWall, maxGamma, currentPrice } }
  // But the API might return it wrapped differently - check the actual response
  const levelsData = levels.data || null;
  
  // useRegime returns { data: { status, vixLevel } }
  const regimeData = regime.data || null;
  
  // useNews returns { data: NewsItem[] } - a flat array, NOT { articles: [] }
  const newsData = news.data || [];
  
  // useDarkPool returns { prints: [], stats: {} }
  const darkpoolData = darkpool.data || null;

  return {
    flow: flowData,        // { flow: Trade[], stats: FlowStats }
    prices: pricesData,    // Price[]
    levels: levelsData,     // { callWall, putWall, maxGamma, currentPrice }
    regime: regimeData,     // { status, vixLevel }
    news: newsData,         // NewsItem[] - flat array
    darkpool: darkpoolData, // { prints[], stats: DarkPoolStats }
    isLoading,
    isError,
    isDemoMode: false,
    refetch: () => {
      flow.refetch();
      prices.refetch();
      levels.refetch();
      darkpool.refetch();
      news.refetch();
    },
  };
}
