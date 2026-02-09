import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { 
  Price, 
  RegimeData, 
  ChatMessage, 
  Alert,
  SubscriptionTier,
  MarketSession 
} from '@/types';

// ═══════════════════════════════════════════════════════════════
//  USER STORE
// ═══════════════════════════════════════════════════════════════

interface UserState {
  isAuthenticated: boolean;
  tier: SubscriptionTier;
  watchlist: string[];
  dailyQuestionsUsed: number;
  
  // Actions
  setAuthenticated: (value: boolean) => void;
  setTier: (tier: SubscriptionTier) => void;
  addToWatchlist: (ticker: string) => void;
  removeFromWatchlist: (ticker: string) => void;
  setWatchlist: (tickers: string[]) => void;
  incrementQuestionsUsed: () => void;
  resetDailyQuestions: () => void;
}

export const useUserStore = create<UserState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      tier: 'free',
      watchlist: ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA'],
      dailyQuestionsUsed: 0,
      
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setTier: (tier) => set({ tier }),
      addToWatchlist: (ticker) => 
        set((state) => ({ 
          watchlist: state.watchlist.includes(ticker) 
            ? state.watchlist 
            : [...state.watchlist, ticker] 
        })),
      removeFromWatchlist: (ticker) =>
        set((state) => ({ 
          watchlist: state.watchlist.filter((t) => t !== ticker) 
        })),
      setWatchlist: (tickers) => set({ watchlist: tickers }),
      incrementQuestionsUsed: () =>
        set((state) => ({ dailyQuestionsUsed: state.dailyQuestionsUsed + 1 })),
      resetDailyQuestions: () => set({ dailyQuestionsUsed: 0 }),
    }),
    {
      name: 'user-storage',
      partialize: (state) => ({ 
        watchlist: state.watchlist,
        dailyQuestionsUsed: state.dailyQuestionsUsed,
      }),
    }
  )
);

// ═══════════════════════════════════════════════════════════════
//  MARKET DATA STORE
// ═══════════════════════════════════════════════════════════════

interface MarketState {
  prices: Record<string, Price>;
  regime: RegimeData | null;
  session: MarketSession;
  lastUpdate: Date | null;
  isConnected: boolean;
  
  // Actions
  updatePrice: (ticker: string, price: Price) => void;
  updatePrices: (prices: Price[]) => void;
  setRegime: (regime: RegimeData) => void;
  setSession: (session: MarketSession) => void;
  setConnected: (connected: boolean) => void;
}

export const useMarketStore = create<MarketState>((set) => ({
  prices: {},
  regime: null,
  session: 'closed',
  lastUpdate: null,
  isConnected: false,
  
  updatePrice: (ticker, price) =>
    set((state) => ({
      prices: { ...state.prices, [ticker]: price },
      lastUpdate: new Date(),
    })),
  updatePrices: (prices) =>
    set((state) => ({
      prices: prices.reduce(
        (acc, p) => ({ ...acc, [p.ticker]: p }),
        state.prices
      ),
      lastUpdate: new Date(),
    })),
  setRegime: (regime) => set({ regime }),
  setSession: (session) => set({ session }),
  setConnected: (connected) => set({ isConnected: connected }),
}));

// ═══════════════════════════════════════════════════════════════
//  CHAT STORE
// ═══════════════════════════════════════════════════════════════

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;
  
  // Actions
  addMessage: (message: ChatMessage) => void;
  updateMessage: (id: string, content: string) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: [],
  isLoading: false,
  
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  updateMessage: (id, content) =>
    set((state) => ({
      messages: state.messages.map((m) =>
        m.id === id ? { ...m, content, isLoading: false } : m
      ),
    })),
  setLoading: (loading) => set({ isLoading: loading }),
  clearMessages: () => set({ messages: [] }),
}));

// ═══════════════════════════════════════════════════════════════
//  ALERTS STORE
// ═══════════════════════════════════════════════════════════════

interface AlertsState {
  alerts: Alert[];
  unreadCount: number;
  
  // Actions
  addAlert: (alert: Alert) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAlerts: () => void;
}

export const useAlertsStore = create<AlertsState>((set) => ({
  alerts: [],
  unreadCount: 0,
  
  addAlert: (alert) =>
    set((state) => ({
      alerts: [alert, ...state.alerts].slice(0, 100), // Keep last 100
      unreadCount: state.unreadCount + 1,
    })),
  markAsRead: (id) =>
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, isRead: true } : a
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    })),
  markAllAsRead: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, isRead: true })),
      unreadCount: 0,
    })),
  clearAlerts: () => set({ alerts: [], unreadCount: 0 }),
}));

// ═══════════════════════════════════════════════════════════════
//  UI STORE
// ═══════════════════════════════════════════════════════════════

interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  activePanel: string | null;
  
  // Actions
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
  toggleMobileMenu: () => void;
  setActivePanel: (panel: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true,
  mobileMenuOpen: false,
  activePanel: null,
  
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  toggleMobileMenu: () => set((state) => ({ mobileMenuOpen: !state.mobileMenuOpen })),
  setActivePanel: (panel) => set({ activePanel: panel }),
}));
