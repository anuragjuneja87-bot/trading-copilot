import type { 
  Price, 
  OptionsFlow, 
  NewsItem, 
  RegimeData, 
  KeyLevels,
  AIResponse,
  APIResponse,
  PaginatedResponse 
} from '@/types';

// ═══════════════════════════════════════════════════════════════
//  API CLIENT CONFIGURATION
// ═══════════════════════════════════════════════════════════════

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || '';

class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }
}

async function fetchAPI<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new APIError(
      error.message || 'An error occurred',
      response.status,
      error.code
    );
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════
//  MARKET DATA API
// ═══════════════════════════════════════════════════════════════

export const marketAPI = {
  // Get prices for watchlist
  getPrices: async (tickers: string[]): Promise<Price[]> => {
    const params = new URLSearchParams({ tickers: tickers.join(',') });
    const response = await fetchAPI<APIResponse<{ prices: Price[] }>>(
      `/api/market/prices?${params}`
    );
    return response.data?.prices || [];
  },

  // Get current regime status
  getRegime: async (): Promise<RegimeData> => {
    const response = await fetchAPI<APIResponse<RegimeData>>('/api/market/regime');
    return response.data!;
  },

  // Get key levels for a ticker
  getKeyLevels: async (ticker: string): Promise<KeyLevels> => {
    const response = await fetchAPI<APIResponse<KeyLevels>>(
      `/api/market/levels/${ticker}`
    );
    return response.data!;
  },
};

// ═══════════════════════════════════════════════════════════════
//  OPTIONS FLOW API
// ═══════════════════════════════════════════════════════════════

export interface FlowFilters {
  tickers?: string[];
  minPremium?: number;
  callPut?: 'C' | 'P' | 'all';
  unusual?: boolean;
  sweeps?: boolean;
  limit?: number;
}

export const flowAPI = {
  // Get real-time options flow
  getFlow: async (filters?: FlowFilters): Promise<OptionsFlow[]> => {
    const params = new URLSearchParams();
    if (filters?.tickers?.length) params.set('tickers', filters.tickers.join(','));
    if (filters?.minPremium) params.set('minPremium', filters.minPremium.toString());
    if (filters?.callPut && filters.callPut !== 'all') params.set('callPut', filters.callPut);
    if (filters?.unusual) params.set('unusual', 'true');
    if (filters?.sweeps) params.set('sweeps', 'true');
    if (filters?.limit) params.set('limit', filters.limit.toString());

    const response = await fetchAPI<APIResponse<{ flow: OptionsFlow[] }>>(
      `/api/flow/options?${params}`
    );
    return response.data?.flow || [];
  },

  // Get top tickers by flow
  getTopTickers: async (
    type: 'unusual' | 'sweeps' | 'momentum' | 'premium' = 'unusual'
  ): Promise<{ ticker: string; value: number; direction: 'bullish' | 'bearish' }[]> => {
    const response = await fetchAPI<APIResponse<{ tickers: any[] }>>(
      `/api/flow/top-tickers?type=${type}`
    );
    return response.data?.tickers || [];
  },
};

// ═══════════════════════════════════════════════════════════════
//  NEWS API
// ═══════════════════════════════════════════════════════════════

export const newsAPI = {
  // Get latest news
  getNews: async (options?: {
    tickers?: string[];
    severity?: 'all' | 'crisis' | 'elevated';
    limit?: number;
  }): Promise<NewsItem[]> => {
    const params = new URLSearchParams();
    if (options?.tickers?.length) params.set('tickers', options.tickers.join(','));
    if (options?.severity && options.severity !== 'all') params.set('severity', options.severity);
    if (options?.limit) params.set('limit', options.limit.toString());

    const response = await fetchAPI<APIResponse<{ articles: any[] }>>(
      `/api/news?${params}`
    );
    // The API returns { articles: [] }, not { news: [] }
    return response.data?.articles || [];
  },
};

// ═══════════════════════════════════════════════════════════════
//  AI / CHAT API
// ═══════════════════════════════════════════════════════════════

export const aiAPI = {
  // Send a question to the AI supervisor
  ask: async (
    question: string,
    conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<AIResponse> => {
    const response = await fetchAPI<APIResponse<AIResponse>>('/api/ai/ask', {
      method: 'POST',
      body: JSON.stringify({ question, history: conversationHistory }),
    });
    return response.data!;
  },

  // Get morning briefing (stub - API deleted for personal use)
  getBriefing: async (): Promise<string> => {
    return '';
  },

  // Stream response (for real-time typing effect)
  askStream: async function* (
    question: string,
    conversationHistory?: { role: 'user' | 'assistant'; content: string }[]
  ): AsyncGenerator<string> {
    const response = await fetch('/api/ai/ask/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, history: conversationHistory }),
    });

    if (!response.ok) {
      throw new APIError('Stream failed', response.status);
    }

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) return;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield decoder.decode(value);
    }
  },
};

// ═══════════════════════════════════════════════════════════════
//  USER / AUTH API
// ═══════════════════════════════════════════════════════════════

export const userAPI = {
  // Stub - user APIs deleted for personal use (using zustand instead)
  getProfile: async () => {
    return null;
  },
  getWatchlist: async (): Promise<string[]> => {
    return [];
  },
  updateWatchlist: async (): Promise<void> => {
    // No-op - watchlist managed via zustand
  },
  trackQuestion: async (): Promise<{ remaining: number; limit: number }> => {
    return { remaining: 999, limit: 999 };
  },
};

// ═══════════════════════════════════════════════════════════════
//  EXPORT ALL
// ═══════════════════════════════════════════════════════════════

export const api = {
  market: marketAPI,
  flow: flowAPI,
  news: newsAPI,
  ai: aiAPI,
  user: userAPI,
};

export { APIError };
export default api;
