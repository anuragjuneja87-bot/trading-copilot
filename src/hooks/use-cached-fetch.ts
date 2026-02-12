/**
 * Hook for cached data fetching with background refresh
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  getCachedData,
  setCachedData,
  getCacheAge,
} from '@/lib/cache';

interface UseCachedFetchOptions<T> {
  cacheKey: string;
  cacheParams?: (string | number)[];
  cacheDuration: number;
  queryKey: (string | number)[];
  queryFn: () => Promise<T>;
  enabled?: boolean;
  staleTime?: number;
  refetchInterval?: number;
}

/**
 * Hook that implements smart caching:
 * - Returns cached data immediately if valid
 * - Shows cached data with "Updating..." indicator if stale
 * - Fetches in background and updates when ready
 */
export function useCachedFetch<T>({
  cacheKey,
  cacheParams = [],
  cacheDuration,
  queryKey,
  queryFn,
  enabled = true,
  staleTime,
  refetchInterval,
}: UseCachedFetchOptions<T>) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [cachedValue, setCachedValue] = useState<T | null>(null);
  
  // Store cacheParams in a ref to avoid dependency issues
  const cacheParamsRef = useRef(cacheParams);
  cacheParamsRef.current = cacheParams;

  // Memoize cacheParams to prevent infinite loops
  // Convert array to string for stable comparison
  const cacheParamsKey = useMemo(() => {
    return JSON.stringify(cacheParams);
  }, [cacheParams]);

  // Check cache on mount - only run when cacheParams actually change
  useEffect(() => {
    if (!enabled) return;
    
    // Use ref to get current cacheParams without it being a dependency
    const currentParams = cacheParamsRef.current;
    const cached = getCachedData<T>(cacheKey, ...currentParams);
    if (cached !== null && cached !== undefined) {
      // Only update if value actually changed to prevent infinite loops
      setCachedValue(prev => {
        // Use JSON comparison to avoid unnecessary updates
        if (JSON.stringify(prev) === JSON.stringify(cached)) {
          return prev;
        }
        return cached;
      });
      
      // Check if cache is stale
      const age = getCacheAge(cacheKey, ...currentParams);
      if (age !== null && age >= cacheDuration) {
        setIsUpdating(true);
      } else {
        setIsUpdating(false);
      }
    } else {
      // No cache, ensure we're not showing stale data
      setCachedValue(null);
      setIsUpdating(false);
    }
  }, [cacheKey, cacheParamsKey, cacheDuration, enabled]); // Use cacheParamsKey instead of cacheParams

  // Fetch with React Query
  const query = useQuery({
    queryKey,
    queryFn: async () => {
      const data = await queryFn();
      // Save to cache using current params from ref
      const currentParams = cacheParamsRef.current;
      setCachedData(cacheKey, data, cacheDuration, ...currentParams);
      // Update cached value only if it changed
      setCachedValue(prev => {
        if (JSON.stringify(prev) === JSON.stringify(data)) {
          return prev;
        }
        return data;
      });
      setIsUpdating(false);
      return data;
    },
    enabled: enabled && (cachedValue === null || isUpdating),
    staleTime: staleTime ?? cacheDuration,
    refetchInterval,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  // Determine what to show
  const hasValidCache = cachedValue !== null && !isUpdating;
  const isLoading = query.isLoading && cachedValue === null;
  const isBackgroundUpdating = query.isFetching && hasValidCache;

  return {
    data: hasValidCache ? cachedValue : query.data,
    isLoading,
    isUpdating: isBackgroundUpdating || isUpdating,
    error: query.error,
    refetch: query.refetch,
    hasCache: hasValidCache,
  };
}
