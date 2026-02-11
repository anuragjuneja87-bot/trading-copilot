/**
 * Hook for real-time options flow via Massive.com WebSocket
 */

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getMassiveWebSocketClient,
  connectMassiveWebSocket,
  disconnectMassiveWebSocket,
  type FlowItem,
} from '@/lib/massive-websocket';

interface UseOptionsFlowWebSocketOptions {
  tickers: string[];
  enabled?: boolean;
  mode?: 'A' | 'AM'; // Per-second or per-minute aggregates
}

export function useOptionsFlowWebSocket({
  tickers,
  enabled = true,
  mode = 'AM', // Per-minute by default (less data)
}: UseOptionsFlowWebSocketOptions) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const tickersRef = useRef<string[]>([]);

  useEffect(() => {
    if (!enabled || tickers.length === 0) {
      return;
    }

    // Connect WebSocket
    connectMassiveWebSocket(undefined, mode);
    const client = getMassiveWebSocketClient(undefined, mode);

    if (!client) {
      console.warn('[Options Flow WS] Client not available');
      return;
    }

    // Check connection status
    const checkConnection = () => {
      setIsConnected(client.isConnected());
    };
    checkConnection();
    const connectionInterval = setInterval(checkConnection, 5000);

    // Subscribe to flow updates
    const unsubscribe = client.onFlowUpdate((newItems: FlowItem[]) => {
      if (newItems.length === 0) return;

      setLastUpdate(new Date());

      // Update React Query cache
      queryClient.setQueryData<{
        flow: FlowItem[];
        stats: any;
        meta: any;
      }>(['flow'], (oldData) => {
        if (!oldData) {
          return {
            flow: newItems,
            stats: calculateStats(newItems),
            meta: {
              timestamp: new Date().toISOString(),
              source: 'websocket',
            },
          };
        }

        // Merge new items with existing flow
        const existingMap = new Map(oldData.flow.map((item) => [item.id, item]));
        
        // Update or add new items
        newItems.forEach((item) => {
          const existing = existingMap.get(item.id);
          if (existing) {
            // Update existing item
            existingMap.set(item.id, { ...existing, ...item });
          } else {
            // Add new item (prepend for newest first)
            existingMap.set(item.id, item);
          }
        });

        // Convert back to array, sort by premium (desc), limit to 100
        const merged = Array.from(existingMap.values())
          .sort((a, b) => b.premium - a.premium)
          .slice(0, 100);

        return {
          flow: merged,
          stats: calculateStats(merged),
          meta: {
            ...oldData.meta,
            timestamp: new Date().toISOString(),
            source: 'websocket',
          },
        };
      });
    });

    // Subscribe to tickers
    // Note: Massive.com requires option contract tickers (O:SPY240119C00450000)
    // For now, we'll subscribe to underlying tickers and let Massive send all contracts
    // In production, you'd want to fetch active contracts first
    const underlyingTickers = [...new Set(tickers.map(t => t.toUpperCase()))];
    
    // If tickers changed, resubscribe
    const tickersChanged = 
      underlyingTickers.length !== tickersRef.current.length ||
      underlyingTickers.some((t, i) => t !== tickersRef.current[i]);
    
    if (tickersChanged) {
      // Unsubscribe from old tickers
      if (tickersRef.current.length > 0) {
        client.unsubscribe(tickersRef.current);
      }
      
      // Subscribe to new tickers
      // For Massive.com, we might need to subscribe to specific contracts
      // For now, subscribing to underlying tickers (may need adjustment based on API)
      client.subscribe(underlyingTickers);
      tickersRef.current = underlyingTickers;
    }

    return () => {
      clearInterval(connectionInterval);
      unsubscribe();
      
      // Unsubscribe from tickers when component unmounts
      if (tickersRef.current.length > 0) {
        client.unsubscribe(tickersRef.current);
      }
    };
  }, [tickers.join(','), enabled, mode, queryClient]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Don't disconnect here - other components might be using it
      // disconnectMassiveWebSocket();
    };
  }, []);

  return {
    isConnected,
    lastUpdate,
  };
}

function calculateStats(flow: FlowItem[]) {
  const totalPremium = flow.reduce((sum, item) => sum + item.premium, 0);
  const callPremium = flow
    .filter((item) => item.callPut === 'C')
    .reduce((sum, item) => sum + item.premium, 0);
  const putPremium = flow
    .filter((item) => item.callPut === 'P')
    .reduce((sum, item) => sum + item.premium, 0);
  const callRatio = totalPremium > 0 ? callPremium / totalPremium : 0;
  const putRatio = totalPremium > 0 ? putPremium / totalPremium : 0;

  const tickerCounts: Record<string, number> = {};
  flow.forEach((item) => {
    tickerCounts[item.ticker] = (tickerCounts[item.ticker] || 0) + 1;
  });
  const mostActive = Object.entries(tickerCounts).sort((a, b) => b[1] - a[1])[0] || null;

  const bullishPremium = flow
    .filter((item) => item.callPut === 'C' && (item.side === 'BUY' || item.side === 'SWEEP' || item.side === 'BLOCK'))
    .reduce((sum, item) => sum + item.premium, 0);
  const bearishPremium = flow
    .filter((item) => item.callPut === 'P' && (item.side === 'BUY' || item.side === 'SWEEP' || item.side === 'BLOCK'))
    .reduce((sum, item) => sum + item.premium, 0);

  return {
    totalPremium,
    callRatio,
    putRatio,
    mostActive: mostActive ? { ticker: mostActive[0], count: mostActive[1] } : null,
    bullishPremium,
    bearishPremium,
  };
}
