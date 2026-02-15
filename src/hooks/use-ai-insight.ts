'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface UseAIInsightOptions {
  endpoint: string;
  payload: Record<string, any>;
  enabled?: boolean;
}

interface AIInsightResult {
  insight: string | null;
  isLoading: boolean;
  error: string | null;
  processingTime: number | null;
  refresh: () => Promise<void>;
  lastUpdated: Date | null;
}

export function useAIInsight({
  endpoint,
  payload,
  enabled = true,
}: UseAIInsightOptions): AIInsightResult {
  const [insight, setInsight] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingTime, setProcessingTime] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  
  // Track if we've already fetched on mount
  const hasFetchedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const fetchInsight = useCallback(async () => {
    // Cancel any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    abortControllerRef.current = new AbortController();
    
    setIsLoading(true);
    setError(null);
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success && data.data?.insight) {
        setInsight(data.data.insight);
        setProcessingTime(Date.now() - startTime);
        setLastUpdated(new Date());
      } else {
        throw new Error(data.error || 'Failed to generate insight');
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Request was cancelled, don't update state
        return;
      }
      console.error('AI insight error:', err);
      setError(err.message || 'Failed to fetch insight');
    } finally {
      setIsLoading(false);
    }
  }, [endpoint, JSON.stringify(payload)]);

  // Fetch on mount (only once)
  useEffect(() => {
    if (enabled && !hasFetchedRef.current && Object.keys(payload).length > 0) {
      // Check if payload has meaningful data
      const hasData = Object.values(payload).some(v => 
        v !== null && v !== undefined && v !== 0 && 
        (typeof v !== 'object' || Object.keys(v).length > 0)
      );
      
      if (hasData) {
        hasFetchedRef.current = true;
        fetchInsight();
      }
    }
    
    // Cleanup on unmount
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [enabled, fetchInsight]);

  // Reset hasFetched when endpoint changes
  useEffect(() => {
    hasFetchedRef.current = false;
  }, [endpoint]);

  return {
    insight,
    isLoading,
    error,
    processingTime,
    refresh: fetchInsight,
    lastUpdated,
  };
}
