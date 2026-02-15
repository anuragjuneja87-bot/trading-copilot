import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { 
  Price, 
  RegimeData, 
  ChatMessage, 
  Alert,
  SubscriptionTier, 
  MarketSession 
} from '@/types';

// ============================================================================
// DATA MODE CONFIGURATION
// ============================================================================

export type DataMode = 'delayed' | 'realtime';

export const DATA_CONFIG = {
  delayed: {
    wsUrl: 'wss://delayed.massive.com/stocks',
    restPollInterval: 15000,      // 15 seconds for REST polling
    wsPollInterval: 1000,         // WebSocket still streams, but data is 15-min delayed
    label: '15-min Delayed',
    badgeColor: '#f59e0b',        // Amber
    description: 'Data is delayed by 15 minutes',
  },
  realtime: {
    wsUrl: 'wss://socket.massive.com/stocks',
    restPollInterval: 5000,       // 5 seconds for REST polling
    wsPollInterval: 0,            // Real-time, no artificial delay
    label: 'Real-time',
    badgeColor: '#00e676',        // Green
    description: 'Live market data',
  },
} as const;

// Get mode from environment variable - THE ONE-LINE SWITCH
export const getDataMode = (): DataMode => {
  // Read from process.env (works on both server and client in Next.js)
  const mode = process.env.NEXT_PUBLIC_DATA_MODE;
  if (mode === 'realtime') return 'realtime';
  return 'delayed'; // Default to delayed for safety
};

export const getDataConfig = () => DATA_CONFIG[getDataMode()];

// ============================================================================
// WATCHLIST STORE
// ============================================================================

const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'MSFT'];
const MAX_WATCHLIST_SIZE = 20;

interface WatchlistState {
  // State
  watchlist: string[];
  
  // Actions
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  setWatchlist: (symbols: string[]) => void;
  clearWatchlist: () => void;
  resetToDefault: () => void;
  moveSymbol: (fromIndex: number, toIndex: number) => void;
  
  // Computed
  hasSymbol: (symbol: string) => boolean;
  watchlistString: () => string; // For query keys
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      watchlist: DEFAULT_WATCHLIST,

      addSymbol: (symbol: string) => {
        const normalized = symbol.toUpperCase().trim();
        if (!normalized) return;
        
        set((state) => {
          if (state.watchlist.includes(normalized)) return state;
          if (state.watchlist.length >= MAX_WATCHLIST_SIZE) {
            console.warn(`Watchlist full (max ${MAX_WATCHLIST_SIZE})`);
            return state;
          }
          return { watchlist: [...state.watchlist, normalized] };
        });
      },

      removeSymbol: (symbol: string) => {
        const normalized = symbol.toUpperCase().trim();
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s !== normalized),
        }));
      },

      setWatchlist: (symbols: string[]) => {
        const normalized = symbols
          .map((s) => s.toUpperCase().trim())
          .filter(Boolean)
          .slice(0, MAX_WATCHLIST_SIZE);
        const unique = [...new Set(normalized)];
        set({ watchlist: unique });
      },

      clearWatchlist: () => set({ watchlist: [] }),

      resetToDefault: () => set({ watchlist: DEFAULT_WATCHLIST }),

      moveSymbol: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const newList = [...state.watchlist];
          const [removed] = newList.splice(fromIndex, 1);
          newList.splice(toIndex, 0, removed);
          return { watchlist: newList };
        });
      },

      hasSymbol: (symbol: string) => {
        return get().watchlist.includes(symbol.toUpperCase().trim());
      },

      watchlistString: () => get().watchlist.join(','),
    }),
    {
      name: 'trading-copilot-watchlist',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ============================================================================
// USER PREFERENCES STORE
// ============================================================================

interface UserPreferences {
  // Display preferences
  compactMode: boolean;
  showTooltips: boolean;
  defaultTimeframe: '1D' | '1W' | '1M' | '3M';
  
  // Notification preferences
  soundEnabled: boolean;
  alertsEnabled: boolean;
  
  // Actions
  setPreference: <K extends keyof Omit<UserPreferences, 'setPreference'>>(
    key: K,
    value: UserPreferences[K]
  ) => void;
}

export const useUserPreferencesStore = create<UserPreferences>()(
  persist(
    (set) => ({
      compactMode: false,
      showTooltips: true,
      defaultTimeframe: '1D',
      soundEnabled: false,
      alertsEnabled: true,

      setPreference: (key, value) => set({ [key]: value }),
    }),
    {
      name: 'trading-copilot-preferences',
      storage: createJSONStorage(() => localStorage),
    }
  )
);

// ============================================================================
// LEGACY USER STORE (for backward compatibility)
// ============================================================================

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
      tier: 'pro', // Personal use gets full access
      watchlist: DEFAULT_WATCHLIST,
      dailyQuestionsUsed: 0,
      
      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setTier: (tier) => set({ tier }),
      addToWatchlist: (ticker) => {
        const normalized = ticker.toUpperCase().trim();
        set((state) => ({ 
          watchlist: state.watchlist.includes(normalized) 
            ? state.watchlist 
            : [...state.watchlist, normalized] 
        }));
        // Sync with new watchlist store
        useWatchlistStore.getState().addSymbol(normalized);
      },
      removeFromWatchlist: (ticker) => {
        const normalized = ticker.toUpperCase().trim();
        set((state) => ({ 
          watchlist: state.watchlist.filter((t) => t !== normalized) 
        }));
        // Sync with new watchlist store
        useWatchlistStore.getState().removeSymbol(normalized);
      },
      setWatchlist: (tickers) => {
        const normalized = tickers.map((t) => t.toUpperCase().trim()).filter(Boolean);
        set({ watchlist: [...new Set(normalized)] });
        // Sync with new watchlist store
        useWatchlistStore.getState().setWatchlist(normalized);
      },
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

// Sync legacy store with persisted watchlist store on load
if (typeof window !== 'undefined') {
  // Initialize legacy store from new watchlist store
  const persistedWatchlist = useWatchlistStore.getState().watchlist;
  useUserStore.setState({ watchlist: persistedWatchlist });
  
  // Subscribe to watchlist changes and sync both ways
  useWatchlistStore.subscribe((state) => {
    useUserStore.setState({ watchlist: state.watchlist });
  });
}

// ============================================================================
// MARKET DATA STORE
// ============================================================================

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

// ============================================================================
// CHAT STORE
// ============================================================================

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

// ============================================================================
// ALERTS STORE
// ============================================================================

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

// ============================================================================
// UI STORE
// ============================================================================

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
