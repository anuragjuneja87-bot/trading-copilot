'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { getDataConfig, getDataMode, useWatchlistStore } from '@/stores';

// Get WebSocket URL from data config
const DATA_CONFIG = getDataConfig();
const WS_URL = DATA_CONFIG.wsUrl;

export interface TickerQuote {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
  volume: number;
  timestamp: number;
}

export interface TickerTrade {
  ticker: string;
  price: number;
  size: number;
  timestamp: number;
  conditions: number[];
}

export interface TickerAggregate {
  ticker: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  vwap: number;
  timestamp: number;
}

interface WebSocketState {
  isConnected: boolean;
  isAuthenticated: boolean;
  dataMode: 'delayed' | 'realtime';
  quotes: Map<string, TickerQuote>;
  trades: Map<string, TickerTrade>;
  aggregates: Map<string, TickerAggregate>;
  lastUpdate: Date | null;
  error: string | null;
  subscribe: (tickers: string[]) => void;
  unsubscribe: (tickers: string[]) => void;
  getQuote: (ticker: string) => TickerQuote | undefined;
  getTrade: (ticker: string) => TickerTrade | undefined;
  getAggregate: (ticker: string) => TickerAggregate | undefined;
}

const WebSocketContext = createContext<WebSocketState | null>(null);

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within WebSocketProvider');
  }
  return context;
}

export function useWebSocketSafe() {
  return useContext(WebSocketContext);
}

interface WebSocketProviderProps {
  children: React.ReactNode;
  apiKey: string;
}

export function WebSocketProvider({ children, apiKey }: WebSocketProviderProps) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const subscribedTickers = useRef<Set<string>>(new Set());
  const pendingSubscriptions = useRef<string[]>([]);
  
  const [isConnected, setIsConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotes, setQuotes] = useState<Map<string, TickerQuote>>(new Map());
  const [trades, setTrades] = useState<Map<string, TickerTrade>>(new Map());
  const [aggregates, setAggregates] = useState<Map<string, TickerAggregate>>(new Map());
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const prevCloseCache = useRef<Map<string, number>>(new Map());
  
  // Get watchlist from store
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const dataMode = getDataMode();

  const processPendingSubscriptions = useCallback(() => {
    if (pendingSubscriptions.current.length > 0 && wsRef.current?.readyState === WebSocket.OPEN && isAuthenticated) {
      const tickers = [...pendingSubscriptions.current];
      pendingSubscriptions.current = [];
      
      tickers.forEach(t => subscribedTickers.current.add(t));
      
      const params = tickers.flatMap(t => [`T.${t}`, `Q.${t}`, `A.${t}`]).join(',');
      wsRef.current.send(JSON.stringify({ action: 'subscribe', params }));
      console.log('[WebSocket] Subscribed to:', tickers);
    }
  }, [isAuthenticated]);

  const connect = useCallback(() => {
    if (!apiKey) {
      console.warn('[WebSocket] No API key provided, skipping connection. Set NEXT_PUBLIC_POLYGON_API_KEY in .env');
      setError('No API key provided');
      return;
    }

    if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
      return;
    }

    console.log(`[WebSocket] Connecting to ${dataMode === 'realtime' ? 'REAL-TIME' : 'DELAYED'} feed...`, { url: WS_URL });
    
    setError(null);
    
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      reconnectAttempts.current = 0;

      console.log('[WebSocket] Sending authentication...');
      ws.send(JSON.stringify({ action: 'auth', params: apiKey }));
    };

    ws.onmessage = (event) => {
      try {
        const messages = JSON.parse(event.data);
        
        if (!Array.isArray(messages)) {
          console.log('[WebSocket] Non-array message:', messages);
          return;
        }

        messages.forEach((msg: any) => {
          switch (msg.ev) {
            case 'status':
              handleStatusMessage(msg);
              break;
            case 'Q':
              handleQuote(msg);
              break;
            case 'T':
              handleTrade(msg);
              break;
            case 'A':
            case 'AM':
              handleAggregate(msg);
              break;
          }
        });
      } catch (err) {
        console.error('[WebSocket] Parse error:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
      setError('WebSocket connection error');
    };

    ws.onclose = (event) => {
      console.log('[WebSocket] Disconnected', { code: event.code, reason: event.reason });
      setIsConnected(false);
      setIsAuthenticated(false);
      
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        
        console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${maxReconnectAttempts})...`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      } else {
        setError('Connection failed after multiple attempts');
      }
    };
  }, [apiKey, dataMode]);

  const handleStatusMessage = useCallback((msg: any) => {
    console.log('[WebSocket] Status:', msg.status, msg.message);
    
    if (msg.status === 'connected') {
      // Initial connection, waiting for auth
    } else if (msg.status === 'auth_success') {
      console.log(`[WebSocket] ✅ Authenticated (${dataMode} mode)`);
      setIsAuthenticated(true);
      setError(null);
      
      // Subscribe to watchlist tickers
      if (watchlist.length > 0) {
        const tickers = watchlist.filter(t => !subscribedTickers.current.has(t));
        if (tickers.length > 0) {
          tickers.forEach(t => subscribedTickers.current.add(t));
          const params = tickers.flatMap(t => [`T.${t}`, `Q.${t}`, `A.${t}`]).join(',');
          wsRef.current?.send(JSON.stringify({ action: 'subscribe', params }));
          console.log('[WebSocket] Subscribed to watchlist:', tickers);
        }
      }
      setTimeout(() => processPendingSubscriptions(), 100);
    } else if (msg.status === 'auth_failed') {
      console.error('[WebSocket] ❌ Authentication failed:', msg.message);
      setError(msg.message || 'Authentication failed');
      setIsAuthenticated(false);
    } else if (msg.status === 'success') {
      console.log('[WebSocket] Subscription success:', msg.message);
    }
  }, [watchlist, dataMode, processPendingSubscriptions]);

  const handleQuote = useCallback((msg: any) => {
    const ticker = msg.sym;
    const bid = msg.bp || 0;
    const ask = msg.ap || 0;
    const price = bid > 0 && ask > 0 ? (bid + ask) / 2 : (bid || ask || 0);
    
    if (price === 0) return;
    
    const prevClose = prevCloseCache.current.get(ticker) || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    setQuotes(prev => {
      const updated = new Map(prev);
      updated.set(ticker, {
        ticker,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        bid,
        ask,
        bidSize: msg.bs || 0,
        askSize: msg.as || 0,
        volume: prev.get(ticker)?.volume || 0,
        timestamp: msg.t || Date.now(),
      });
      return updated;
    });
    setLastUpdate(new Date());
  }, []);

  const handleTrade = useCallback((msg: any) => {
    const ticker = msg.sym;
    const price = msg.p || 0;
    
    if (price === 0) return;

    setTrades(prev => {
      const updated = new Map(prev);
      updated.set(ticker, {
        ticker,
        price,
        size: msg.s || 0,
        timestamp: msg.t || Date.now(),
        conditions: msg.c || [],
      });
      return updated;
    });

    const prevClose = prevCloseCache.current.get(ticker) || price;
    const change = price - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    setQuotes(prev => {
      const updated = new Map(prev);
      const existing = updated.get(ticker);
      
      updated.set(ticker, {
        ticker,
        price: Math.round(price * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        bid: existing?.bid || price,
        ask: existing?.ask || price,
        bidSize: existing?.bidSize || 0,
        askSize: existing?.askSize || 0,
        volume: (existing?.volume || 0) + (msg.s || 0),
        timestamp: msg.t || Date.now(),
      });
      return updated;
    });
    setLastUpdate(new Date());
  }, []);

  const handleAggregate = useCallback((msg: any) => {
    const ticker = msg.sym;
    const closePrice = msg.c || 0;
    
    if (closePrice === 0) return;

    setAggregates(prev => {
      const updated = new Map(prev);
      updated.set(ticker, {
        ticker,
        open: msg.o || 0,
        high: msg.h || 0,
        low: msg.l || 0,
        close: closePrice,
        volume: msg.v || 0,
        vwap: msg.vw || 0,
        timestamp: msg.s || Date.now(),
      });
      return updated;
    });

    const prevClose = prevCloseCache.current.get(ticker) || msg.o || closePrice;
    const change = closePrice - prevClose;
    const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

    setQuotes(prev => {
      const updated = new Map(prev);
      const existing = updated.get(ticker);
      
      updated.set(ticker, {
        ticker,
        price: Math.round(closePrice * 100) / 100,
        change: Math.round(change * 100) / 100,
        changePercent: Math.round(changePercent * 100) / 100,
        bid: existing?.bid || closePrice,
        ask: existing?.ask || closePrice,
        bidSize: existing?.bidSize || 0,
        askSize: existing?.askSize || 0,
        volume: msg.v || existing?.volume || 0,
        timestamp: msg.s || Date.now(),
      });
      return updated;
    });
    setLastUpdate(new Date());
  }, []);

  const subscribe = useCallback((tickers: string[]) => {
    const newTickers = tickers.filter(t => !subscribedTickers.current.has(t));
    if (newTickers.length === 0) return;

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN || !isAuthenticated) {
      console.log('[WebSocket] Queuing subscription for:', newTickers);
      pendingSubscriptions.current = [...new Set([...pendingSubscriptions.current, ...newTickers])];
      return;
    }

    newTickers.forEach(t => subscribedTickers.current.add(t));
    const params = newTickers.flatMap(t => [`T.${t}`, `Q.${t}`, `A.${t}`]).join(',');
    wsRef.current.send(JSON.stringify({ action: 'subscribe', params }));
    console.log('[WebSocket] Subscribed to:', newTickers);
  }, [isAuthenticated]);

  const unsubscribe = useCallback((tickers: string[]) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    tickers.forEach(t => subscribedTickers.current.delete(t));
    const params = tickers.flatMap(t => [`T.${t}`, `Q.${t}`, `A.${t}`]).join(',');
    wsRef.current.send(JSON.stringify({ action: 'unsubscribe', params }));
    console.log('[WebSocket] Unsubscribed from:', tickers);
  }, []);

  const getQuote = useCallback((ticker: string) => quotes.get(ticker), [quotes]);
  const getTrade = useCallback((ticker: string) => trades.get(ticker), [trades]);
  const getAggregate = useCallback((ticker: string) => aggregates.get(ticker), [aggregates]);

  // Subscribe to watchlist changes
  useEffect(() => {
    if (isAuthenticated && watchlist.length > 0) {
      subscribe(watchlist);
    }
  }, [watchlist, isAuthenticated, subscribe]);

  // Fetch previous close for accurate change calculation
  useEffect(() => {
    const fetchPrevClose = async () => {
      try {
        const res = await fetch('/api/market-pulse');
        const data = await res.json();
        
        if (data.success && data.data) {
          if (data.data.spy?.price && data.data.spy?.change) {
            prevCloseCache.current.set('SPY', data.data.spy.price - data.data.spy.change);
          }
          if (data.data.qqq?.price && data.data.qqq?.change) {
            prevCloseCache.current.set('QQQ', data.data.qqq.price - data.data.qqq.change);
          }
        }
      } catch (err) {
        console.error('[WebSocket] Failed to fetch previous close:', err);
      }
    };
    fetchPrevClose();
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const value: WebSocketState = {
    isConnected,
    isAuthenticated,
    dataMode,
    quotes,
    trades,
    aggregates,
    lastUpdate,
    error,
    subscribe,
    unsubscribe,
    getQuote,
    getTrade,
    getAggregate,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
