'use client';

import { useEffect, useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { CACHE_DURATIONS, getTodayET } from '@/lib/cache';

interface ThesisData {
  ticker: string;
  verdict?: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  reasoning?: string;
  error?: string;
}

interface AutoQuickThesisProps {
  tickers: string[];
}

export function AutoQuickThesis({ tickers }: AutoQuickThesisProps) {
  const [forceRefresh, setForceRefresh] = useState(false);
  const [hasTriggeredFetch, setHasTriggeredFetch] = useState(false);
  const today = getTodayET();
  
  // Memoize displayTickers and cacheParams to prevent infinite loops
  const displayTickers = useMemo(() => {
    return [...tickers.slice(0, 5)].sort(); // Create new array and sort
  }, [tickers]);
  
  const cacheParams = useMemo(() => {
    return [today, ...displayTickers];
  }, [today, displayTickers]);

  const {
    data: cachedTheses,
    isLoading,
    isUpdating,
    error,
    refetch,
    hasCache,
  } = useCachedFetch<{ theses: ThesisData[] }>({
    cacheKey: 'quick_thesis',
    cacheParams,
    cacheDuration: CACHE_DURATIONS.quick_thesis,
    queryKey: ['quickThesis', today, displayTickers.join(','), forceRefresh],
    queryFn: async () => {
      console.log('[Quick Thesis] Fetching thesis for:', displayTickers);
      const res = await fetch('/api/ai/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: displayTickers }),
      });
      const data = await res.json();
      console.log('[Quick Thesis] API response:', data);
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    enabled: displayTickers.length > 0,
  });

  // Auto-trigger fetch on mount if we have tickers and no cache
  useEffect(() => {
    if (displayTickers.length > 0 && !hasCache && !isLoading && !hasTriggeredFetch && !cachedTheses) {
      console.log('[Quick Thesis] Auto-triggering fetch for:', displayTickers);
      setHasTriggeredFetch(true);
      // Small delay to ensure hook is ready
      setTimeout(() => {
        refetch();
      }, 100);
    }
  }, [displayTickers.length, hasCache, isLoading, hasTriggeredFetch, cachedTheses, refetch]);

  const handleRefresh = () => {
    setForceRefresh(!forceRefresh);
    setHasTriggeredFetch(false); // Reset to allow auto-fetch again
    refetch();
  };

  const theses = cachedTheses?.theses || [];
  const relevantTheses = theses.filter((t: ThesisData) => displayTickers.includes(t.ticker));

  const getSentimentFromVerdict = (verdict?: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    if (verdict === 'BUY') return 'BULLISH';
    if (verdict === 'SELL') return 'BEARISH';
    return 'NEUTRAL';
  };

  if (isLoading && !hasCache) {
    return (
      <div className="space-y-2">
        {displayTickers.map((ticker) => (
          <div key={ticker} className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }


  if (tickers.length === 0) {
    return (
      <div className="text-center py-4 text-sm text-text-muted">
        <p>Add tickers to your watchlist to see thesis</p>
      </div>
    );
  }

  // If no data and not loading, show generate button
  if (relevantTheses.length === 0 && !isLoading && !hasCache) {
    return (
      <div className="space-y-3">
        <div className="text-center py-4 text-sm text-text-muted">
          <p>No thesis data available</p>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="w-full"
          disabled={isLoading}
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Generate Thesis
        </Button>
      </div>
    );
  }

  // If error but no cache, show error with retry
  if (error && !cachedTheses && !isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-bear">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : 'Failed to generate thesis'}</span>
        </div>
        <Button
          onClick={handleRefresh}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Updating indicator */}
      {isUpdating && (
        <div className="flex items-center gap-2 text-xs text-text-muted mb-2">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Updating...</span>
        </div>
      )}
      
      {relevantTheses.map((thesis: ThesisData) => {
        const sentiment = getSentimentFromVerdict(thesis.verdict);
        const oneLineReasoning = thesis.reasoning?.split('\n')[0] || 'No reasoning available';

        return (
          <div
            key={thesis.ticker}
            className="p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,229,255,0.3)] transition-colors"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold text-text-primary">{thesis.ticker}</span>
              <Badge
                className={cn(
                  'text-[10px] px-2 py-0.5',
                  sentiment === 'BULLISH' && 'bg-bull/10 text-bull border-bull/30',
                  sentiment === 'BEARISH' && 'bg-bear/10 text-bear border-bear/30',
                  sentiment === 'NEUTRAL' && 'bg-warning/10 text-warning border-warning/30'
                )}
              >
                {sentiment}
              </Badge>
            </div>
            <p className="text-xs text-text-secondary line-clamp-1">{oneLineReasoning}</p>
          </div>
        );
      })}
      <div className="flex items-center justify-between mt-2">
        <Link
          href="/app/thesis"
          className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          View Full Report
          <ExternalLink className="h-3 w-3" />
        </Link>
        <button
          onClick={handleRefresh}
          className={cn(
            "p-1.5 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors",
            (isUpdating || isLoading) && "animate-spin"
          )}
          title="Refresh thesis"
          disabled={isLoading || isUpdating}
        >
          <RefreshCw className="h-3.5 w-3.5 text-text-muted" />
        </button>
      </div>
    </div>
  );
}
