'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import type { ThesisV2Request, ThesisV2Response } from '@/app/api/ai/thesis-v2/route';

/* ══════════════════════════════════════════════════════════════
   useThesis — Smart-gated thesis refresh hook
   
   Refresh strategy:
   - RTH: 3-minute timer, skip LLM call if no signal changed
   - Pre-market: 10-minute timer, same gating
   - After-hours / Closed: once on load, no auto-refresh
   - Ticker switch: always regenerate
   - Manual refresh: always regenerate
   - Timeframe switch: never regenerate
   ══════════════════════════════════════════════════════════════ */

const RTH_INTERVAL_MS = 3 * 60 * 1000;     // 3 minutes
const PRE_MARKET_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

interface UseThesisOptions {
  ticker: string;
  price: number;
  changePercent: number;
  prevClose: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  signals: ThesisV2Request['signals'];
  levels: ThesisV2Request['levels'];
  newsHeadlines?: { title: string; sentiment: string; source?: string }[];
  enabled?: boolean;
}

interface UseThesisResult {
  thesis: ThesisV2Response | null;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
  secondsSinceUpdate: number;
}

function buildSnapshotKey(signals: ThesisV2Request['signals']): string {
  return JSON.stringify([
    signals.flow.status,
    signals.volume.status,
    signals.darkPool.status,
    signals.gex.status,
    signals.vwap.status,
    signals.rs.status,
    signals.ml.status,
  ]);
}

export function useThesis(opts: UseThesisOptions): UseThesisResult {
  const { ticker, price, changePercent, prevClose, marketSession, signals, levels, newsHeadlines, enabled = true } = opts;

  const [thesis, setThesis] = useState<ThesisV2Response | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [secondsSinceUpdate, setSecondsSinceUpdate] = useState(0);

  // Track last signal snapshot for gating
  const lastSnapshotRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Keep latest values in ref for interval callbacks
  const latestRef = useRef(opts);
  useEffect(() => { latestRef.current = opts; }, [opts]);

  // ── Core fetch function ──────────────────────────────────
  const fetchThesis = useCallback(async (force: boolean = false) => {
    const current = latestRef.current;
    
    if (!current.ticker || !enabled) {
      console.log('[Thesis] Skip: no ticker or disabled');
      return;
    }
    
    // Require price > 0 OR prevClose > 0 for ALL sessions
    // (API will 400 if both are 0)
    if (current.price <= 0 && (!current.prevClose || current.prevClose <= 0)) {
      console.log('[Thesis] Skip: waiting for price data (price=0, prevClose=0)');
      return;
    }

    // Signal gating: skip if signals haven't changed (unless forced)
    const currentSnapshot = buildSnapshotKey(current.signals);
    if (!force && currentSnapshot === lastSnapshotRef.current && thesis) {
      console.log('[Thesis] Gated: signals unchanged, skipping LLM call');
      return;
    }

    // Abort previous request
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    console.log(`[Thesis] Fetching for ${current.ticker} (${current.marketSession}, force=${force})`);

    try {
      const reqBody: ThesisV2Request = {
        ticker: current.ticker,
        price: current.price,
        changePercent: current.changePercent,
        prevClose: current.prevClose,
        marketSession: current.marketSession,
        signals: current.signals,
        levels: current.levels,
        newsHeadlines: current.newsHeadlines,
      };

      const response = await fetch('/api/ai/thesis-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(reqBody),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => 'Unknown error');
        console.error(`[Thesis] API ${response.status}:`, errBody);
        throw new Error(`API error ${response.status}: ${errBody.substring(0, 200)}`);
      }

      const data = await response.json();
      if (data.success && data.data) {
        console.log(`[Thesis] ✅ Generated (${data.data.marketState}, ${data.data.bias})`);
        setThesis(data.data);
        setLastUpdated(new Date());
        setSecondsSinceUpdate(0);
        lastSnapshotRef.current = currentSnapshot;
      } else {
        throw new Error(data.error || 'Unknown error from API');
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return; // Cancelled, ignore
      console.error('[Thesis] ❌ Error:', e.message);
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, [enabled, thesis]);

  // ── Manual refresh ──────────────────────────────────────
  const refresh = useCallback(() => {
    fetchThesis(true); // force=true bypasses gating
  }, [fetchThesis]);

  // ── Fetch on mount and ticker change ────────────────────
  const prevTickerRef = useRef<string>('');
  const hasFetchedRef = useRef(false);
  const tickerDebounceRef = useRef<NodeJS.Timeout | null>(null);
  
  useEffect(() => {
    if (!ticker || !enabled) return;

    // Ticker changed — clear old thesis, wait for fresh data
    if (ticker !== prevTickerRef.current) {
      prevTickerRef.current = ticker;
      hasFetchedRef.current = false;
      lastSnapshotRef.current = '';
      setThesis(null);
      setError(null);
      
      // Cancel any pending debounce
      if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
      
      // Debounce: wait 2s for market data to load for new ticker
      console.log(`[Thesis] Ticker changed to ${ticker}, waiting for data...`);
      tickerDebounceRef.current = setTimeout(() => {
        console.log(`[Thesis] Data settled, fetching thesis for ${ticker}`);
        hasFetchedRef.current = true;
        fetchThesis(true);
      }, 2000);
      return;
    }
    
    // Initial mount (ticker already set, no change)
    if (!hasFetchedRef.current) {
      hasFetchedRef.current = true;
      console.log(`[Thesis] Initial fetch for ${ticker}`);
      // Also debounce initial fetch to let data hydrate
      if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
      tickerDebounceRef.current = setTimeout(() => {
        fetchThesis(true);
      }, 1500);
    }
    
    return () => {
      if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    };
  }, [ticker, enabled, fetchThesis]);

  // ── Retry when price becomes available (covers closed market race) ──
  const prevPriceRef = useRef<number>(0);
  useEffect(() => {
    if (!ticker || !enabled) return;
    // If price just went from 0 to a valid number, and we have no thesis yet, retry
    if (prevPriceRef.current <= 0 && price > 0 && !thesis && !isLoading && hasFetchedRef.current) {
      console.log(`[Thesis] Price loaded (${price}), retrying...`);
      fetchThesis(true);
    }
    prevPriceRef.current = price;
  }, [price, ticker, enabled, thesis, isLoading, fetchThesis]);

  // ── Auto-refresh timer with smart gating ────────────────
  useEffect(() => {
    if (!enabled || !ticker) return;

    // Clear any existing interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Determine interval based on session
    let intervalMs: number | null = null;
    if (marketSession === 'open') {
      intervalMs = RTH_INTERVAL_MS;
    } else if (marketSession === 'pre-market') {
      intervalMs = PRE_MARKET_INTERVAL_MS;
    }
    // after-hours and closed: no auto-refresh

    if (intervalMs) {
      intervalRef.current = setInterval(() => {
        fetchThesis(false); // gated — will skip if signals unchanged
      }, intervalMs);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [marketSession, ticker, enabled, fetchThesis]);

  // ── "Updated Xs ago" counter ────────────────────────────
  useEffect(() => {
    if (!lastUpdated) return;
    const timer = setInterval(() => {
      setSecondsSinceUpdate(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  // ── Cleanup on unmount ──────────────────────────────────
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (tickerDebounceRef.current) clearTimeout(tickerDebounceRef.current);
    };
  }, []);

  return { thesis, isLoading, error, lastUpdated, refresh, secondsSinceUpdate };
}
