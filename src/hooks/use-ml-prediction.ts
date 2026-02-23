/**
 * useMLPrediction — Hook that fetches ML predictions from the B→C pipeline.
 *
 * Usage:
 *   const { prediction, isLoading, error, refresh, confidenceHistory } = useMLPrediction(ticker, warRoomData);
 *
 * Auto-refreshes every 60s during market hours.
 * Accumulates confidence history for intraday sparkline.
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { MLPrediction } from '@/app/api/ml/predict/route';
import type { WarRoomSnapshot, MarketRegimeData } from '@/lib/feature-assembler';

export interface ConfidencePoint {
  time: number;        // Unix ms
  confidence: number;  // 0-100
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

interface UseMLPredictionResult {
  prediction: MLPrediction | null;
  isLoading: boolean;
  error: string | null;
  meta: {
    completeness: string;
    availableFeatures: number;
    latencyMs: number;
  } | null;
  refresh: () => void;
  lastUpdate: Date | null;
  confidenceHistory: ConfidencePoint[];
}

// Build a WarRoomSnapshot from the useWarRoomData hook output
export function buildSnapshot(ticker: string, warRoomData: any): WarRoomSnapshot {
  return {
    ticker,
    price: warRoomData.price || 0,
    change: warRoomData.change || 0,
    changePercent: warRoomData.changePercent || 0,
    flow: {
      stats: warRoomData.flow?.stats || null,
    },
    darkpool: {
      stats: warRoomData.darkpool?.stats || null,
    },
    levels: {
      callWall: warRoomData.levels?.callWall || null,
      putWall: warRoomData.levels?.putWall || null,
      vwap: warRoomData.levels?.vwap || null,
    },
    relativeStrength: warRoomData.relativeStrength || null,
    preMarketData: warRoomData.preMarketData || null,
  };
}

export function useMLPrediction(
  ticker: string,
  warRoomData: any,
  regime?: MarketRegimeData | null
): UseMLPredictionResult {
  const [prediction, setPrediction] = useState<MLPrediction | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<UseMLPredictionResult['meta']>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [confidenceHistory, setConfidenceHistory] = useState<ConfidencePoint[]>([]);
  const fetchInProgress = useRef(false);
  const currentTicker = useRef(ticker);

  // Reset history when ticker changes
  useEffect(() => {
    if (ticker !== currentTicker.current) {
      currentTicker.current = ticker;
      setConfidenceHistory([]);
      setPrediction(null);
    }
  }, [ticker]);

  const fetchPrediction = useCallback(async () => {
    if (!ticker || !warRoomData?.price || warRoomData.price === 0) return;
    if (fetchInProgress.current) return;

    fetchInProgress.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const snapshot = buildSnapshot(ticker, warRoomData);

      const res = await fetch('/api/ml/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshot, regime: regime || null }),
      });

      const data = await res.json();

      if (data.success && data.prediction) {
        setPrediction(data.prediction);
        setMeta(data.meta || null);
        setLastUpdate(new Date());
        
        // Accumulate confidence history (cap at 500 points ~8hrs of 60s polling)
        setConfidenceHistory(prev => {
          const point: ConfidencePoint = {
            time: Date.now(),
            confidence: data.prediction.move_probability * 100,
            direction: data.prediction.direction || 'NEUTRAL',
          };
          const next = [...prev, point];
          return next.length > 500 ? next.slice(-500) : next;
        });
      } else {
        setError(data.error || 'Prediction failed');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setIsLoading(false);
      fetchInProgress.current = false;
    }
  }, [ticker, warRoomData?.price, warRoomData?.flow?.stats, warRoomData?.darkpool?.stats, regime]);

  // Fetch when data changes significantly
  useEffect(() => {
    if (!ticker || !warRoomData?.price) return;

    // Don't fetch if war room is still loading
    if (warRoomData.isLoading) return;

    // Fetch on initial load
    fetchPrediction();

    // Auto-refresh every 60s during market hours
    const isMarketOpen = warRoomData.marketSession === 'open';
    const refreshInterval = isMarketOpen ? 60000 : 300000; // 1min vs 5min

    const interval = setInterval(fetchPrediction, refreshInterval);
    return () => clearInterval(interval);
  }, [ticker, fetchPrediction, warRoomData?.isLoading, warRoomData?.marketSession]);

  return {
    prediction,
    isLoading,
    error,
    meta,
    refresh: fetchPrediction,
    lastUpdate,
    confidenceHistory,
  };
}
