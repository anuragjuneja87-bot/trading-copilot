import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  Price,
  RegimeData,
  ChatMessage,
  SubscriptionTier,
  MarketSession
} from '@/types';

/* ═══════════════════════════════════════════════════════════════════
   ZUSTAND STORES — v2 (Database-backed)
   
   MIGRATION STRATEGY:
   All user-specific state syncs to database when logged in.
   Falls back to localStorage when anonymous (no auth yet).
   
   Store            | Anonymous (no auth) | Authenticated
   ─────────────────┼─────────────────────┼──────────────────
   Watchlist         | localStorage        | DB via /api/user/watchlist
   UserPreferences   | localStorage        | DB via /api/user/preferences
   Alerts            | empty (no alerts)   | DB via /api/alerts
   Market/Chat/UI    | in-memory only      | in-memory only (unchanged)
   
   The stores expose `syncFromServer()` and `syncToServer()` methods.
   Call `syncFromServer()` on app mount when session is available.
   Call `syncToServer()` on every mutation when authenticated.
   
   This allows a seamless upgrade path:
   1. User uses app anonymously → localStorage works as before
   2. User signs up → localStorage state migrates to DB on first sync
   3. User logs in on another device → gets their state from DB
   ═══════════════════════════════════════════════════════════════════ */

// ============================================================================
// DATA MODE CONFIGURATION (unchanged)
// ============================================================================

export type DataMode = 'delayed' | 'realtime';

export const DATA_CONFIG = {
  delayed: {
    wsUrl: 'wss://delayed.polygon.io/stocks',
    restPollInterval: 15000,
    wsPollInterval: 1000,
    label: '15-min Delayed',
    badgeColor: '#f59e0b',
    description: 'Data is delayed by 15 minutes',
  },
  realtime: {
    wsUrl: 'wss://socket.polygon.io/stocks',
    restPollInterval: 5000,
    wsPollInterval: 0,
    label: 'Real-time',
    badgeColor: '#00e676',
    description: 'Live market data',
  },
} as const;

export const getDataMode = (): DataMode => {
  const mode = process.env.NEXT_PUBLIC_DATA_MODE;
  if (mode === 'realtime') return 'realtime';
  return 'delayed';
};

export const getDataConfig = () => DATA_CONFIG[getDataMode()];

// ============================================================================
// AUTH STATE — tracks whether user is logged in
// ============================================================================

interface AuthState {
  isAuthenticated: boolean;
  userId: string | null;
  tier: SubscriptionTier;
  setAuth: (userId: string | null, tier?: SubscriptionTier) => void;
  clearAuth: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  isAuthenticated: false,
  userId: null,
  tier: 'FREE',
  setAuth: (userId, tier) => set({
    isAuthenticated: !!userId,
    userId,
    tier: tier || 'FREE',
  }),
  clearAuth: () => set({ isAuthenticated: false, userId: null, tier: 'FREE' }),
}));

// ============================================================================
// WATCHLIST STORE (DB-synced when authenticated, localStorage fallback)
// ============================================================================

const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'NVDA', 'META', 'AAPL', 'GOOG', 'AMD', 'TSLA'];
const MAX_WATCHLIST_SIZE = 20;

function isValidWatchlist(watchlist: unknown): watchlist is string[] {
  if (!Array.isArray(watchlist)) return false;
  if (watchlist.length === 0) return false;
  return watchlist.every(item => typeof item === 'string' && item.length > 0 && item.length < 10);
}

interface WatchlistState {
  watchlist: string[];
  _synced: boolean;
  addSymbol: (symbol: string) => void;
  removeSymbol: (symbol: string) => void;
  setWatchlist: (symbols: string[]) => void;
  clearWatchlist: () => void;
  resetToDefault: () => void;
  moveSymbol: (fromIndex: number, toIndex: number) => void;
  hasSymbol: (symbol: string) => boolean;
  watchlistString: () => string;
  syncFromServer: () => Promise<void>;
}

export const useWatchlistStore = create<WatchlistState>()(
  persist(
    (set, get) => ({
      watchlist: DEFAULT_WATCHLIST,
      _synced: false,

      addSymbol: (symbol: string) => {
        const normalized = symbol.toUpperCase().trim();
        if (!normalized) return;

        set((state) => {
          if (state.watchlist.includes(normalized)) return state;
          if (state.watchlist.length >= MAX_WATCHLIST_SIZE) return state;
          return { watchlist: [...state.watchlist, normalized] };
        });

        // Sync to server if authenticated
        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/watchlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'add', ticker: normalized }),
          }).catch(() => {});
        }
      },

      removeSymbol: (symbol: string) => {
        const normalized = symbol.toUpperCase().trim();
        set((state) => ({
          watchlist: state.watchlist.filter((s) => s !== normalized),
        }));

        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/watchlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'remove', ticker: normalized }),
          }).catch(() => {});
        }
      },

      setWatchlist: (symbols: string[]) => {
        const normalized = symbols
          .map((s) => s.toUpperCase().trim())
          .filter(Boolean)
          .slice(0, MAX_WATCHLIST_SIZE);
        const unique = [...new Set(normalized)];
        set({ watchlist: unique });

        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/watchlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watchlist: unique }),
          }).catch(() => {});
        }
      },

      clearWatchlist: () => set({ watchlist: [] }),
      resetToDefault: () => {
        set({ watchlist: DEFAULT_WATCHLIST });
        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/watchlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watchlist: DEFAULT_WATCHLIST }),
          }).catch(() => {});
        }
      },

      moveSymbol: (fromIndex: number, toIndex: number) => {
        set((state) => {
          const newList = [...state.watchlist];
          const [removed] = newList.splice(fromIndex, 1);
          newList.splice(toIndex, 0, removed);
          return { watchlist: newList };
        });

        // Sync full reorder
        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/watchlist', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ watchlist: get().watchlist }),
          }).catch(() => {});
        }
      },

      hasSymbol: (symbol: string) => {
        return get().watchlist.includes(symbol.toUpperCase().trim());
      },

      watchlistString: () => get().watchlist.join(','),

      // Called on app mount when session is available
      syncFromServer: async () => {
        if (get()._synced) return;
        try {
          const res = await fetch('/api/user/watchlist');
          if (!res.ok) return;
          const data = await res.json();
          if (data.source === 'db' && data.watchlist?.length > 0) {
            set({ watchlist: data.watchlist, _synced: true });
          } else if (data.source === 'default') {
            // New user: migrate localStorage watchlist to DB
            const current = get().watchlist;
            if (isValidWatchlist(current) && current.length > 0) {
              await fetch('/api/user/watchlist', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ watchlist: current }),
              });
            }
            set({ _synced: true });
          }
        } catch {
          // Offline or error — keep localStorage data
        }
      },
    }),
    {
      name: 'trading-copilot-watchlist',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ watchlist: state.watchlist }),
      onRehydrateStorage: () => (state) => {
        if (state && !isValidWatchlist(state.watchlist)) {
          state.watchlist = DEFAULT_WATCHLIST;
        }
      },
    }
  )
);

// ============================================================================
// USER PREFERENCES STORE (DB-synced)
// ============================================================================

interface UserPreferences {
  compactMode: boolean;
  showTooltips: boolean;
  defaultTimeframe: '1D' | '1W' | '1M' | '3M';
  soundEnabled: boolean;
  alertsEnabled: boolean;
  analysisDepth: 'quick' | 'standard' | 'deep';
  pinnedInsights: Array<{ ticker: string; insight: string; pinnedAt: string }>;
  _synced: boolean;
  setPreference: <K extends keyof Omit<UserPreferences, 'setPreference' | 'syncFromServer' | '_synced' | 'pinnedInsights'>>(
    key: K,
    value: UserPreferences[K]
  ) => void;
  addPinnedInsight: (ticker: string, insight: string) => void;
  removePinnedInsight: (ticker: string) => void;
  syncFromServer: () => Promise<void>;
}

export const useUserPreferencesStore = create<UserPreferences>()(
  persist(
    (set, get) => ({
      compactMode: false,
      showTooltips: true,
      defaultTimeframe: '1D',
      soundEnabled: false,
      alertsEnabled: true,
      analysisDepth: 'standard',
      pinnedInsights: [],
      _synced: false,

      setPreference: (key, value) => {
        set({ [key]: value });
        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [key]: value }),
          }).catch(() => {});
        }
      },

      addPinnedInsight: (ticker, insight) => {
        const updated = [
          ...get().pinnedInsights.filter((p) => p.ticker !== ticker),
          { ticker, insight, pinnedAt: new Date().toISOString() },
        ].slice(0, 20);
        set({ pinnedInsights: updated });
        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinnedInsights: updated }),
          }).catch(() => {});
        }
      },

      removePinnedInsight: (ticker) => {
        const updated = get().pinnedInsights.filter((p) => p.ticker !== ticker);
        set({ pinnedInsights: updated });
        if (useAuthStore.getState().isAuthenticated) {
          fetch('/api/user/preferences', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pinnedInsights: updated }),
          }).catch(() => {});
        }
      },

      syncFromServer: async () => {
        if (get()._synced) return;
        try {
          const res = await fetch('/api/user/preferences');
          if (!res.ok) return;
          const data = await res.json();
          if (data.source === 'db') {
            set({
              compactMode: data.compactMode,
              showTooltips: data.showTooltips,
              defaultTimeframe: data.defaultTimeframe,
              soundEnabled: data.soundEnabled,
              alertsEnabled: data.alertsEnabled,
              analysisDepth: data.analysisDepth || 'standard',
              pinnedInsights: data.pinnedInsights || [],
              _synced: true,
            });
          } else {
            // New user: push localStorage prefs to DB
            const current = get();
            await fetch('/api/user/preferences', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                compactMode: current.compactMode,
                showTooltips: current.showTooltips,
                defaultTimeframe: current.defaultTimeframe,
                soundEnabled: current.soundEnabled,
                alertsEnabled: current.alertsEnabled,
                analysisDepth: current.analysisDepth,
                pinnedInsights: current.pinnedInsights,
              }),
            });
            set({ _synced: true });
          }
        } catch {}
      },
    }),
    {
      name: 'trading-copilot-preferences',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        compactMode: state.compactMode,
        showTooltips: state.showTooltips,
        defaultTimeframe: state.defaultTimeframe,
        soundEnabled: state.soundEnabled,
        alertsEnabled: state.alertsEnabled,
        analysisDepth: state.analysisDepth,
        pinnedInsights: state.pinnedInsights,
      }),
    }
  )
);

// ============================================================================
// LEGACY USER STORE (DEPRECATED — kept for backward compat during migration)
// Routes to WatchlistStore. Remove after auth migration complete.
// ============================================================================

interface UserState {
  isAuthenticated: boolean;
  tier: SubscriptionTier;
  watchlist: string[];
  dailyQuestionsUsed: number;

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
      tier: 'pro' as SubscriptionTier,
      watchlist: DEFAULT_WATCHLIST,
      dailyQuestionsUsed: 0,

      setAuthenticated: (value) => set({ isAuthenticated: value }),
      setTier: (tier) => set({ tier }),

      // Delegate to watchlist store
      addToWatchlist: (ticker) => {
        const normalized = ticker.toUpperCase().trim();
        set((state) => ({
          watchlist: state.watchlist.includes(normalized)
            ? state.watchlist
            : [...state.watchlist, normalized]
        }));
        useWatchlistStore.getState().addSymbol(normalized);
      },
      removeFromWatchlist: (ticker) => {
        const normalized = ticker.toUpperCase().trim();
        set((state) => ({
          watchlist: state.watchlist.filter((t) => t !== normalized)
        }));
        useWatchlistStore.getState().removeSymbol(normalized);
      },
      setWatchlist: (tickers) => {
        const normalized = tickers.map((t) => t.toUpperCase().trim()).filter(Boolean);
        set({ watchlist: [...new Set(normalized)] });
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

// Sync legacy → watchlist store on load
if (typeof window !== 'undefined') {
  setTimeout(() => {
    const persistedWatchlist = useWatchlistStore.getState().watchlist;
    if (!isValidWatchlist(persistedWatchlist) || persistedWatchlist.length === 0) {
      useWatchlistStore.getState().resetToDefault();
      useUserStore.setState({ watchlist: DEFAULT_WATCHLIST });
    } else {
      useUserStore.setState({ watchlist: persistedWatchlist });
    }
  }, 100);

  useWatchlistStore.subscribe((state) => {
    useUserStore.setState({ watchlist: state.watchlist });
  });
}

// ============================================================================
// ALERTS STORE (DB-backed via polling)
// ============================================================================

interface AlertData {
  id: string;
  ticker: string;
  type: string;
  tier: number;
  title: string;
  summary: string;
  bias: string;
  confidence: string;
  price: number;
  target1?: number;
  stopPrice?: number;
  signalsJson: any;
  read: boolean;
  createdAt: string;
}

interface AlertsState {
  alerts: AlertData[];
  unreadCount: number;
  lastPollTime: string | null;
  isPolling: boolean;

  startPolling: () => void;
  stopPolling: () => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  dismissAlert: (id: string) => void;
}

let pollInterval: ReturnType<typeof setInterval> | null = null;

export const useAlertsStore = create<AlertsState>((set, get) => ({
  alerts: [],
  unreadCount: 0,
  lastPollTime: null,
  isPolling: false,

  startPolling: () => {
    if (get().isPolling) return;
    set({ isPolling: true });

    const poll = async () => {
      if (!useAuthStore.getState().isAuthenticated) return;
      try {
        const since = get().lastPollTime;
        const url = since
          ? `/api/alerts?since=${encodeURIComponent(since)}`
          : '/api/alerts';
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();

        if (data.alerts?.length > 0) {
          set((state) => {
            const existingIds = new Set(state.alerts.map((a) => a.id));
            const newAlerts = data.alerts.filter((a: AlertData) => !existingIds.has(a.id));
            return {
              alerts: [...newAlerts, ...state.alerts].slice(0, 100),
              unreadCount: data.unreadCount,
              lastPollTime: data.serverTime,
            };
          });
        } else {
          set({ lastPollTime: data.serverTime, unreadCount: data.unreadCount });
        }
      } catch {}
    };

    // Initial poll
    poll();
    // Poll every 20 seconds
    pollInterval = setInterval(poll, 20_000);
  },

  stopPolling: () => {
    set({ isPolling: false });
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  },

  markAsRead: (id: string) => {
    set((state) => ({
      alerts: state.alerts.map((a) =>
        a.id === id ? { ...a, read: true } : a
      ),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
    fetch('/api/alerts/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'read' }),
    }).catch(() => {});
  },

  markAllAsRead: () => {
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, read: true })),
      unreadCount: 0,
    }));
    fetch('/api/alerts/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read_all' }),
    }).catch(() => {});
  },

  dismissAlert: (id: string) => {
    set((state) => ({
      alerts: state.alerts.filter((a) => a.id !== id),
      unreadCount: Math.max(0, state.unreadCount - (
        state.alerts.find((a) => a.id === id && !a.read) ? 1 : 0
      )),
    }));
    fetch('/api/alerts/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'dismiss' }),
    }).catch(() => {});
  },
}));

// ============================================================================
// MARKET DATA STORE (in-memory only — ephemeral, no DB needed)
// ============================================================================

interface MarketState {
  prices: Record<string, Price>;
  regime: RegimeData | null;
  session: MarketSession;
  lastUpdate: Date | null;
  isConnected: boolean;

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
// CHAT STORE (in-memory only — session scoped)
// ============================================================================

interface ChatState {
  messages: ChatMessage[];
  isLoading: boolean;

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
// UI STORE (in-memory only — ephemeral)
// ============================================================================

interface UIState {
  sidebarOpen: boolean;
  mobileMenuOpen: boolean;
  activePanel: string | null;

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
