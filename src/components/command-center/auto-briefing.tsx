'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { RefreshCw, AlertCircle, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { useCachedFetch } from '@/hooks/use-cached-fetch';
import { CACHE_DURATIONS, getTodayET } from '@/lib/cache';
import { cn } from '@/lib/utils';

interface AutoBriefingProps {
  prompt: string;
}

export function AutoBriefing({ prompt }: AutoBriefingProps) {
  const [forceRefresh, setForceRefresh] = useState(false);
  const today = getTodayET();

  const {
    data,
    isLoading,
    isUpdating,
    error,
    refetch,
    hasCache,
  } = useCachedFetch({
    cacheKey: 'morning_briefing',
    cacheParams: [today],
    cacheDuration: CACHE_DURATIONS.morning_briefing,
    queryKey: ['briefing', today, forceRefresh],
    queryFn: async () => {
      const res = await fetch(`/api/briefing?date=${today}`);
      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || 'Failed to get briefing');
      }
      return data.data?.content || '';
    },
  });

  const handleRefresh = () => {
    setForceRefresh(!forceRefresh);
    refetch();
  };

  // Extract first 3-4 bullet points
  const getCondensedSummary = (text: string): string[] => {
    if (!text) return [];
    const lines = text.split('\n').filter((line) => line.trim());
    const bullets = lines
      .filter((line) => line.trim().startsWith('•') || line.trim().startsWith('-'))
      .slice(0, 4);
    return bullets.length > 0 ? bullets : lines.slice(0, 3);
  };

  const condensedPoints = data ? getCondensedSummary(data) : [];

  if (isLoading && !hasCache) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-bear">
          <AlertCircle className="h-4 w-4" />
          <span>{error instanceof Error ? error.message : 'Failed to load briefing'}</span>
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

  if (!data) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* Updating indicator */}
      {isUpdating && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Updating...</span>
        </div>
      )}
      
      <div className="space-y-2 text-sm text-text-secondary">
        {condensedPoints.map((point, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <span className="text-accent mt-0.5">•</span>
            <span>{point.replace(/^[•-]\s*/, '')}</span>
          </div>
        ))}
      </div>
      
      <div className="flex items-center justify-between">
        <Link
          href={`/app/thesis?briefing=${today}`}
          className="inline-flex items-center gap-1 text-xs text-accent hover:text-accent/80 transition-colors"
        >
          Read Full Briefing
          <ExternalLink className="h-3 w-3" />
        </Link>
        <button
          onClick={handleRefresh}
          className={cn(
            "p-1.5 rounded hover:bg-[rgba(255,255,255,0.04)] transition-colors",
            isUpdating && "animate-spin"
          )}
          title="Refresh briefing"
        >
          <RefreshCw className="h-3.5 w-3.5 text-text-muted" />
        </button>
      </div>
    </div>
  );
}
