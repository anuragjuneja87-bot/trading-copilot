'use client';

import { useQuery } from '@tanstack/react-query';
import { useSession } from 'next-auth/react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { CACHE_DURATIONS } from '@/lib/cache';

interface AutoKeyLevelsProps {
  defaultTicker?: string;
}

interface KeyLevelsData {
  ticker: string;
  callWall: number;
  putWall: number;
  maxGamma: number;
}

// Fetch key levels from fast API endpoint
async function fetchKeyLevels(ticker: string): Promise<KeyLevelsData> {
  const res = await fetch(`/api/levels?ticker=${ticker}`);
  const data = await res.json();
  
  if (!data.success) {
    throw new Error(data.error || 'Failed to fetch key levels');
  }
  
  return {
    ticker: data.data.ticker,
    callWall: data.data.callWall,
    putWall: data.data.putWall,
    maxGamma: data.data.maxGamma,
  };
}

export function AutoKeyLevels({ defaultTicker = 'SPY' }: AutoKeyLevelsProps) {
  const { data: session } = useSession();
  const [selectedTicker, setSelectedTicker] = useState(defaultTicker);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Get watchlist for dropdown
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data;
    },
  });

  const watchlistTickers =
    watchlistData?.watchlist?.map((item: any) => item.ticker) || [defaultTicker];
  const topTicker = watchlistTickers[0] || defaultTicker;

  const [forceRefresh, setForceRefresh] = useState(false);

  const {
    data,
    isLoading,
    isUpdating,
    error,
    refetch,
    hasCache,
  } = useCachedFetch<KeyLevelsData>({
    cacheKey: 'key_levels',
    cacheParams: [selectedTicker],
    cacheDuration: CACHE_DURATIONS.key_levels,
    queryKey: ['keyLevels', selectedTicker, forceRefresh],
    queryFn: () => fetchKeyLevels(selectedTicker),
  });

  const handleRefresh = () => {
    setForceRefresh(!forceRefresh);
    refetch();
  };

  const currentTicker = selectedTicker || topTicker;

  if (isLoading && !hasCache) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-20" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-bear">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : 'Failed to load levels'}</span>
        </div>
        <Button onClick={handleRefresh} variant="outline" size="sm" className="w-full">
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Ticker Selector with Refresh */}
      <div className="relative flex items-center gap-2">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:bg-[rgba(255,255,255,0.04)] transition-colors"
        >
          <span className="font-semibold text-text-primary">{data.ticker}</span>
          <ChevronDown
            className={cn('h-4 w-4 text-text-muted transition-transform', isDropdownOpen && 'rotate-180')}
          />
        </button>
        <button
          onClick={handleRefresh}
          className={cn(
            "p-2 rounded-lg hover:bg-[rgba(255,255,255,0.04)] transition-colors",
            isUpdating && "animate-spin"
          )}
          title="Refresh levels"
        >
          <RefreshCw className="h-4 w-4 text-text-muted" />
        </button>
        {isDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsDropdownOpen(false)}
            />
            <div className="absolute top-full left-0 right-0 mt-1 rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-card shadow-lg z-20 max-h-48 overflow-y-auto">
              {watchlistTickers.map((ticker: string) => (
                <button
                  key={ticker}
                  onClick={() => {
                    setSelectedTicker(ticker);
                    setIsDropdownOpen(false);
                  }}
                  className={cn(
                    'w-full px-3 py-2 text-left hover:bg-background-elevated transition-colors',
                    ticker === currentTicker && 'bg-background-elevated'
                  )}
                >
                  <span className="text-sm text-text-primary">{ticker}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      
      {/* Updating indicator */}
      {isUpdating && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Updating...</span>
        </div>
      )}

      {/* Levels Table */}
      <div className="space-y-2">
        <div className="flex justify-between items-center py-2 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-xs text-[#6b7a99]">Call Wall</span>
          <span className="text-sm font-mono font-semibold text-bull">${data.callWall}</span>
        </div>
        <div className="flex justify-between items-center py-2 border-b border-[rgba(255,255,255,0.06)]">
          <span className="text-xs text-[#6b7a99]">Put Wall</span>
          <span className="text-sm font-mono font-semibold text-bear">${data.putWall}</span>
        </div>
        <div className="flex justify-between items-center py-2">
          <span className="text-xs text-[#6b7a99]">Max Gamma</span>
          <span className="text-sm font-mono font-semibold text-[#00e5ff]">${data.maxGamma}</span>
        </div>
      </div>
    </div>
  );
}
