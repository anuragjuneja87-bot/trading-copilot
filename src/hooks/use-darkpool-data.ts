'use client';

import { useQuery } from '@tanstack/react-query';
import type { DarkPoolPrint, DarkPoolStats } from '@/types/darkpool';

interface UseDarkPoolOptions {
  tickers: string[];
  minSize?: number;
  time?: string;
  enabled?: boolean;
}

export function useDarkPoolData({ tickers, minSize = 100000, time = 'day', enabled = true }: UseDarkPoolOptions) {
  return useQuery({
    queryKey: ['darkpool-public', tickers, minSize, time],
    queryFn: async (): Promise<{ prints: DarkPoolPrint[]; stats: DarkPoolStats | null }> => {
      const params = new URLSearchParams({
        tickers: tickers.join(','),
        minSize: minSize.toString(),
        time,
      });

      // Use public endpoint with internal header
      const res = await fetch(`/api/darkpool?${params}`, {
        headers: {
          'x-internal-public': 'true',
        },
        credentials: 'include',
      });

      if (!res.ok) {
        // If 401, return empty data structure
        if (res.status === 401) {
          return {
            prints: [],
            stats: null,
          };
        }
        throw new Error('Failed to fetch dark pool data');
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      return data.data;
    },
    refetchInterval: 15000,
    enabled: enabled && tickers.length > 0,
    retry: 2,
  });
}
