/**
 * Massive.com WebSocket Client for Options Flow
 * 
 * Documentation:
 * - Per-second aggregates: https://massive.com/docs/websocket/options/aggregates-per-second
 * - Per-minute aggregates: https://massive.com/docs/websocket/options/aggregates-per-minute
 */

type AggregateData = {
  ev: 'A' | 'AM'; // Event type: A (per-second) or AM (per-minute)
  sym: string; // Option contract ticker (e.g., "O:ONEM220121C00025000")
  v: number; // Tick volume
  av: number; // Today's accumulated volume
  op: number; // Today's official opening price
  vw: number; // Volume weighted average price
  o: number; // Opening tick price
  c: number; // Closing tick price
  h: number; // Highest tick price
  l: number; // Lowest tick price
  a: number; // Today's volume weighted average price
  z: number; // Average trade size
  s: number; // Start timestamp (Unix milliseconds)
  e: number; // End timestamp (Unix milliseconds)
};

type FlowItem = {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  callPut: 'C' | 'P';
  side: 'BUY' | 'SWEEP' | 'BLOCK';
  size: number;
  premium: number;
  spotPrice: number;
  otmPercent?: number;
  heatScore?: number;
  isUnusual: boolean;
  isSweep: boolean;
  isGolden: boolean;
  timestamp: string;
};

type FlowUpdateCallback = (items: FlowItem[]) => void;

class MassiveWebSocketClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private subscribedTickers: Set<string> = new Set();
  private callbacks: Set<FlowUpdateCallback> = new Set();
  private aggregateMode: 'A' | 'AM' = 'AM'; // Per-minute by default (less data)
  private apiKey: string;
  private wsUrl: string;

  constructor(apiKey: string, mode: 'A' | 'AM' = 'AM') {
    this.apiKey = apiKey;
    this.aggregateMode = mode;
    // Massive.com WebSocket URL
    // Per docs: https://massive.com/docs/websocket/options/aggregates-per-minute
    // Endpoint: WS /options/AM
    // Base URL needs to be determined - try common formats
    const baseUrl = process.env.NEXT_PUBLIC_MASSIVE_WS_URL || 
                    process.env.NEXT_PUBLIC_POLYGON_WS_URL || 
                    'wss://socket.polygon.io'; // Default to Polygon.io (Massive.com may use same infrastructure)
    // Path format: /options/AM for aggregates per-minute, /options/A for per-second
    this.wsUrl = `${baseUrl}/options/${mode}`;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Massive WS] Already connected');
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[Massive WS] Connection in progress');
      return;
    }

    try {
      // Polygon.io/Massive.com WebSocket connection
      // Polygon.io format: wss://socket.polygon.io/options/AM?apiKey=KEY
      // Authentication happens via query param
      const url = `${this.wsUrl}?apiKey=${this.apiKey}`;
      console.log('[Massive WS] Connecting to:', url.replace(this.apiKey, '***'));
      
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Massive WS] Connected successfully');
        this.reconnectAttempts = 0;
        
        // Polygon.io requires authentication message after connection
        // Format: {"action":"auth","params":"YOUR_API_KEY"}
        const authMessage = {
          action: 'auth',
          params: this.apiKey,
        };
        this.ws?.send(JSON.stringify(authMessage));
        console.log('[Massive WS] Sent authentication');
        
        // Wait a bit for auth to complete, then subscribe
        setTimeout(() => {
          if (this.subscribedTickers.size > 0) {
            this.subscribe(Array.from(this.subscribedTickers));
          }
        }, 500);
      };

      this.ws.onmessage = (event) => {
        try {
          const data: AggregateData = JSON.parse(event.data);
          this.handleAggregate(data);
        } catch (error) {
          console.error('[Massive WS] Error parsing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Massive WS] Error:', error);
        // If 404, WebSocket endpoint might not be available
        if (error.message && error.message.includes('404')) {
          console.warn('[Massive WS] 404 error - WebSocket endpoint not found. Falling back to REST polling.');
        }
      };

      this.ws.onclose = (event) => {
        console.log('[Massive WS] Disconnected:', event.code, event.reason);
        this.ws = null;

        // Don't retry on 404 errors (endpoint doesn't exist)
        if (event.code === 1006 || event.code === 404) {
          console.warn('[Massive WS] WebSocket endpoint not available. Use REST API polling instead.');
          return;
        }

        // Attempt reconnection for other errors
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          console.log(`[Massive WS] Reconnecting in ${this.reconnectDelay}ms (attempt ${this.reconnectAttempts})`);
          this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectDelay);
        } else {
          console.error('[Massive WS] Max reconnection attempts reached. Falling back to REST polling.');
        }
      };
    } catch (error) {
      console.error('[Massive WS] Failed to connect:', error);
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedTickers.clear();
  }

  subscribe(tickers: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[Massive WS] Not connected, will subscribe after connection');
      tickers.forEach(t => this.subscribedTickers.add(t));
      return;
    }

    // Massive.com WebSocket subscription format
    // Per docs: https://massive.com/docs/websocket/options/aggregates-per-minute
    // Query Parameter: ticker (required)
    // Try both formats: subscription message and query parameter
    tickers.forEach(ticker => {
      if (!this.subscribedTickers.has(ticker)) {
        this.subscribedTickers.add(ticker);
        
        // Format 1: Subscription message (Polygon.io style)
        const subscribeMsg1 = {
          action: 'subscribe',
          params: `${this.aggregateMode}.${ticker}`, // Format: AM.O:SPY240119C00450000
        };
        this.ws?.send(JSON.stringify(subscribeMsg1));
        
        // Format 2: Direct ticker parameter (per Massive.com docs)
        const subscribeMsg2 = {
          action: 'subscribe',
          ticker: ticker, // Direct ticker parameter
        };
        setTimeout(() => {
          this.ws?.send(JSON.stringify(subscribeMsg2));
        }, 200);
        
        console.log(`[Massive WS] Subscribed to: ${ticker} (${this.aggregateMode})`);
      }
    });
  }

  unsubscribe(tickers: string[]): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    tickers.forEach(ticker => {
      if (this.subscribedTickers.has(ticker)) {
        this.subscribedTickers.delete(ticker);
        
        const unsubscribeMsg = {
          action: 'unsubscribe',
          params: `${this.aggregateMode}.${ticker}`, // Format: AM.O:SPY240119C00450000
        };
        
        this.ws?.send(JSON.stringify(unsubscribeMsg));
        console.log(`[Massive WS] Unsubscribed from: ${ticker}`);
      }
    });
  }

  onFlowUpdate(callback: FlowUpdateCallback): () => void {
    this.callbacks.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  private handleAggregate(data: AggregateData): void {
    // Parse option contract ticker (format: O:ONEM220121C00025000)
    // O: = Options prefix
    // ONEM = Underlying ticker
    // 220121 = Expiry (YYMMDD)
    // C = Call/Put
    // 00025000 = Strike (in cents, e.g., 250.00)
    const contractMatch = data.sym.match(/^O:(\w+)(\d{6})([CP])(\d{8})$/);
    if (!contractMatch) {
      console.warn('[Massive WS] Invalid contract format:', data.sym);
      return;
    }

    const [, underlying, expiryStr, callPut, strikeStr] = contractMatch;
    const expiry = `20${expiryStr.slice(0,2)}-${expiryStr.slice(2,4)}-${expiryStr.slice(4,6)}`;
    const strike = parseInt(strikeStr) / 1000;
    const contractType = callPut === 'C' ? 'C' : 'P';

    // Calculate premium (volume * price * 100 for options)
    const volume = data.v; // Tick volume for this aggregate
    const price = data.c; // Closing price
    const premium = price * volume * 100;

    // Determine if unusual/sweep
    const isUnusual = premium >= 100000 || volume >= 500;
    let side: 'BUY' | 'SWEEP' | 'BLOCK' = 'BUY';
    if (volume > 1000 && premium > 500000) side = 'BLOCK';
    else if (volume > 500 && premium > 100000) side = 'SWEEP';

    const isSweep = side === 'SWEEP' || side === 'BLOCK';
    const isGolden = premium > 1000000 && isSweep;

    // Create flow item
    const flowItem: FlowItem = {
      id: `${data.sym}-${data.s}`,
      ticker: underlying,
      strike,
      expiry,
      callPut: contractType,
      side,
      size: volume,
      premium: Math.round(premium),
      spotPrice: 0, // Will need to fetch separately or from another source
      otmPercent: 0, // Will need spot price to calculate
      heatScore: this.calculateHeatScore(premium, volume, 0, isUnusual, isSweep),
      isUnusual,
      isSweep,
      isGolden,
      timestamp: new Date(data.e).toISOString(),
    };

    // Notify callbacks
    this.callbacks.forEach(callback => {
      try {
        callback([flowItem]);
      } catch (error) {
        console.error('[Massive WS] Callback error:', error);
      }
    });
  }

  private calculateHeatScore(
    premium: number,
    volume: number,
    oi: number,
    isUnusual: boolean,
    isSweep: boolean
  ): number {
    let score = 5;
    
    if (premium > 1000000) score += 2;
    else if (premium > 500000) score += 1.5;
    else if (premium > 100000) score += 1;
    
    if (oi > 0) {
      const volOiRatio = volume / oi;
      if (volOiRatio > 1) score += 1.5;
      else if (volOiRatio > 0.5) score += 1;
    }
    
    if (isUnusual) score += 1;
    if (isSweep) score += 1;
    
    return Math.min(10, Math.max(1, Math.round(score)));
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let massiveClient: MassiveWebSocketClient | null = null;

export function getMassiveWebSocketClient(
  apiKey?: string,
  mode: 'A' | 'AM' = 'AM'
): MassiveWebSocketClient | null {
  const key = apiKey || process.env.NEXT_PUBLIC_MASSIVE_API_KEY || '';
  
  if (!key || key.includes('your_')) {
    console.warn('[Massive WS] API key not configured');
    return null;
  }

  if (!massiveClient) {
    massiveClient = new MassiveWebSocketClient(key, mode);
  }

  return massiveClient;
}

export function connectMassiveWebSocket(apiKey?: string, mode: 'A' | 'AM' = 'AM'): void {
  const client = getMassiveWebSocketClient(apiKey, mode);
  if (client) {
    client.connect();
  }
}

export function disconnectMassiveWebSocket(): void {
  if (massiveClient) {
    massiveClient.disconnect();
    massiveClient = null;
  }
}

export type { FlowItem, FlowUpdateCallback };
