'use client';

import { useEffect, useMemo } from 'react';
import { useWebSocketSafe } from '@/lib/websocket';

interface RealtimePriceResult {
  price: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
  bid: number | null;
  ask: number | null;
  isLive: boolean;
  lastUpdate: Date | null;
}

const DEFAULT_RESULT: RealtimePriceResult = {
  price: null,
  change: null,
  changePercent: null,
  volume: null,
  bid: null,
  ask: null,
  isLive: false,
  lastUpdate: null,
};

export function useRealtimePrice(ticker: string): RealtimePriceResult {
  const ws = useWebSocketSafe();

  useEffect(() => {
    if (ws && ticker) {
      ws.subscribe([ticker]);
    }
  }, [ws, ticker]);

  return useMemo(() => {
    if (!ws) return DEFAULT_RESULT;
    
    const quote = ws.getQuote(ticker);
    if (!quote) return DEFAULT_RESULT;

    return {
      price: quote.price,
      change: quote.change,
      changePercent: quote.changePercent,
      volume: quote.volume,
      bid: quote.bid,
      ask: quote.ask,
      isLive: ws.isConnected && ws.isAuthenticated,
      lastUpdate: quote.timestamp ? new Date(quote.timestamp) : null,
    };
  }, [ws, ticker, ws?.quotes, ws?.isConnected, ws?.isAuthenticated]);
}

export function useRealtimePrices(tickers: string[]): Map<string, RealtimePriceResult> {
  const ws = useWebSocketSafe();

  useEffect(() => {
    if (ws && tickers.length > 0) {
      ws.subscribe(tickers);
    }
  }, [ws, tickers.join(',')]);

  return useMemo(() => {
    const map = new Map<string, RealtimePriceResult>();
    
    if (!ws) {
      tickers.forEach(t => map.set(t, DEFAULT_RESULT));
      return map;
    }

    tickers.forEach(ticker => {
      const quote = ws.getQuote(ticker);
      if (quote) {
        map.set(ticker, {
          price: quote.price,
          change: quote.change,
          changePercent: quote.changePercent,
          volume: quote.volume,
          bid: quote.bid,
          ask: quote.ask,
          isLive: ws.isConnected && ws.isAuthenticated,
          lastUpdate: quote.timestamp ? new Date(quote.timestamp) : null,
        });
      } else {
        map.set(ticker, DEFAULT_RESULT);
      }
    });

    return map;
  }, [ws, tickers.join(','), ws?.quotes, ws?.isConnected, ws?.isAuthenticated]);
}
