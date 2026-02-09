import { io, Socket } from 'socket.io-client';
import { useMarketStore, useAlertsStore } from '@/stores';
import type { Price, OptionsFlow, NewsItem, Alert, RegimeData } from '@/types';

// ═══════════════════════════════════════════════════════════════
//  SOCKET CLIENT SINGLETON
// ═══════════════════════════════════════════════════════════════

let socket: Socket | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAY = 3000;

// Event types
type SocketEventCallback = (data: unknown) => void;
const eventListeners = new Map<string, Set<SocketEventCallback>>();

// ═══════════════════════════════════════════════════════════════
//  CONNECTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export function initializeSocket(serverUrl?: string): Socket {
  if (socket?.connected) return socket;

  const url = serverUrl || process.env.NEXT_PUBLIC_SOCKET_URL || '';
  
  socket = io(url, {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
    reconnectionDelay: RECONNECT_DELAY,
    timeout: 10000,
  });

  // Connection events
  socket.on('connect', () => {
    console.log('[Socket] Connected');
    reconnectAttempts = 0;
    useMarketStore.getState().setConnected(true);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
    useMarketStore.getState().setConnected(false);
  });

  socket.on('connect_error', (error) => {
    console.error('[Socket] Connection error:', error);
    reconnectAttempts++;
    
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log('[Socket] Max reconnection attempts reached, falling back to polling');
    }
  });

  // Data events
  socket.on('price:update', (data: Price | Price[]) => {
    const prices = Array.isArray(data) ? data : [data];
    useMarketStore.getState().updatePrices(prices);
    emit('price:update', prices);
  });

  socket.on('flow:new', (data: OptionsFlow) => {
    emit('flow:new', data);
  });

  socket.on('news:new', (data: NewsItem) => {
    emit('news:new', data);
    
    // Auto-create alert for crisis news
    if (data.severity === 'CRISIS') {
      const alert: Alert = {
        id: `news-${data.id}`,
        type: 'news',
        ticker: data.tickers[0],
        title: 'CRISIS Alert',
        message: data.headline,
        severity: 'critical',
        isRead: false,
        createdAt: new Date(),
      };
      useAlertsStore.getState().addAlert(alert);
    }
  });

  socket.on('alert:new', (data: Alert) => {
    useAlertsStore.getState().addAlert(data);
    emit('alert:new', data);
  });

  socket.on('regime:change', (data: RegimeData) => {
    useMarketStore.getState().setRegime(data);
    emit('regime:change', data);
    
    // Create alert on regime change
    if (data.status === 'crisis' || data.status === 'elevated') {
      const alert: Alert = {
        id: `regime-${Date.now()}`,
        type: 'regime',
        title: `Market Regime: ${data.status.toUpperCase()}`,
        message: data.reason || `Market has entered ${data.status} mode`,
        severity: data.status === 'crisis' ? 'critical' : 'warning',
        isRead: false,
        createdAt: new Date(),
      };
      useAlertsStore.getState().addAlert(alert);
    }
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
    useMarketStore.getState().setConnected(false);
  }
}

export function getSocket(): Socket | null {
  return socket;
}

// ═══════════════════════════════════════════════════════════════
//  SUBSCRIPTION MANAGEMENT
// ═══════════════════════════════════════════════════════════════

export function subscribeToPrices(tickers: string[]): void {
  if (!socket?.connected) {
    console.warn('[Socket] Not connected, cannot subscribe');
    return;
  }
  
  socket.emit('subscribe', {
    channel: 'prices',
    tickers,
  });
}

export function unsubscribeFromPrices(tickers: string[]): void {
  if (!socket?.connected) return;
  
  socket.emit('unsubscribe', {
    channel: 'prices',
    tickers,
  });
}

export function subscribeToFlow(tickers?: string[]): void {
  if (!socket?.connected) return;
  
  socket.emit('subscribe', {
    channel: 'flow',
    tickers,
  });
}

export function subscribeToNews(tickers?: string[]): void {
  if (!socket?.connected) return;
  
  socket.emit('subscribe', {
    channel: 'news',
    tickers,
  });
}

// ═══════════════════════════════════════════════════════════════
//  EVENT EMITTER (for component subscriptions)
// ═══════════════════════════════════════════════════════════════

function emit(event: string, data: unknown): void {
  const listeners = eventListeners.get(event);
  if (listeners) {
    listeners.forEach((callback) => callback(data));
  }
}

export function onSocketEvent(
  event: string,
  callback: SocketEventCallback
): () => void {
  if (!eventListeners.has(event)) {
    eventListeners.set(event, new Set());
  }
  eventListeners.get(event)!.add(callback);

  // Return unsubscribe function
  return () => {
    eventListeners.get(event)?.delete(callback);
  };
}

// ═══════════════════════════════════════════════════════════════
//  POLLING FALLBACK (when WebSocket unavailable)
// ═══════════════════════════════════════════════════════════════

let pollingIntervals: Map<string, NodeJS.Timeout> = new Map();

export function startPolling(
  channel: 'prices' | 'flow' | 'news',
  fetchFn: () => Promise<void>,
  intervalMs: number
): void {
  // Clear existing interval if any
  stopPolling(channel);

  // Immediate fetch
  fetchFn();

  // Set up interval
  const interval = setInterval(fetchFn, intervalMs);
  pollingIntervals.set(channel, interval);
}

export function stopPolling(channel: string): void {
  const interval = pollingIntervals.get(channel);
  if (interval) {
    clearInterval(interval);
    pollingIntervals.delete(channel);
  }
}

export function stopAllPolling(): void {
  pollingIntervals.forEach((interval) => clearInterval(interval));
  pollingIntervals.clear();
}

// ═══════════════════════════════════════════════════════════════
//  HYBRID REAL-TIME STRATEGY
// ═══════════════════════════════════════════════════════════════

/**
 * Smart real-time data strategy:
 * 1. Try WebSocket first
 * 2. Fall back to polling if WS fails
 * 3. Use tier-appropriate polling interval
 */
export function initializeRealTimeData(
  tickers: string[],
  pollIntervalMs: number,
  fetchPrices: () => Promise<void>
): () => void {
  // Try WebSocket
  const socket = initializeSocket();
  
  // Subscribe via WS
  subscribeToPrices(tickers);
  
  // Also start polling as backup (will coexist with WS)
  // Polling is tier-gated by interval
  startPolling('prices', fetchPrices, pollIntervalMs);

  // Return cleanup function
  return () => {
    unsubscribeFromPrices(tickers);
    stopPolling('prices');
  };
}
