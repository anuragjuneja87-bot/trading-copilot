// ═══════════════════════════════════════════════════════════════
//  MARKET DATA TYPES
// ═══════════════════════════════════════════════════════════════

export interface Price {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  bid?: number;
  ask?: number;
  high?: number;
  low?: number;
  prevClose?: number;
  updatedAt: Date;
}

export interface OptionsFlow {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  callPut: 'C' | 'P';
  side: 'BUY' | 'SELL' | 'SWEEP' | 'BLOCK';
  size: number;
  premium: number;
  spotPrice: number;
  iv?: number;
  oi?: number;
  otmPercent?: number;
  heatScore?: number;
  isUnusual: boolean;
  isSweep: boolean;
  isGolden: boolean;
  timestamp: Date;
}

export interface DarkPoolPrint {
  id: string;
  ticker: string;
  price: number;
  size: number;
  notional: number;
  exchange: string;
  isLargePrint: boolean;
  timestamp: Date;
}

export interface NewsItem {
  id: string;
  headline: string;
  summary?: string;
  tickers: string[];
  source: string;
  severity: 'CRISIS' | 'ELEVATED' | 'NORMAL';
  sentiment: number; // -1 to 1
  url?: string;
  publishedAt: Date;
}

// ═══════════════════════════════════════════════════════════════
//  REGIME & ANALYSIS TYPES
// ═══════════════════════════════════════════════════════════════

export type RegimeStatus = 'normal' | 'elevated' | 'crisis';
export type MarketSession = 'pre-market' | 'market-open' | 'after-hours' | 'closed';

export interface RegimeData {
  status: RegimeStatus;
  vixLevel: number;
  crisisCount: number;
  elevatedCount: number;
  reason?: string;
}

export interface GammaLevel {
  level: number;
  type: 'wall' | 'support' | 'resistance' | 'magnet';
  strength: number; // 1-10
  description?: string;
}

export interface KeyLevels {
  ticker: string;
  pivotPoint: number;
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  s1: number;
  s2: number;
  s3: number;
  s4: number;
  gammaLevels?: GammaLevel[];
  roundNumbers?: number[];
}

// ═══════════════════════════════════════════════════════════════
//  AI / CHAT TYPES
// ═══════════════════════════════════════════════════════════════

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
}

export interface Verdict {
  action: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  conviction: 'high' | 'medium' | 'low';
  ticker?: string;
  entryLevel?: number;
  targetLevel?: number;
  stopLoss?: number;
  invalidatesIf?: string;
  reasoning?: string;
}

export interface AIResponse {
  message: string;
  verdict?: Verdict;
  regime?: RegimeStatus;
  alerts?: string[];
}

// ═══════════════════════════════════════════════════════════════
//  USER & SUBSCRIPTION TYPES
// ═══════════════════════════════════════════════════════════════

export type SubscriptionTier = 'free' | 'pro' | 'elite';

export interface User {
  id: string;
  email: string;
  name?: string;
  tier: SubscriptionTier;
  watchlist: string[];
  dailyQuestionsUsed: number;
  dailyQuestionsLimit: number;
  stripeCustomerId?: string;
  createdAt: Date;
}

export interface UserConfig {
  tier: SubscriptionTier;
  maxWatchlist: number;
  pollInterval: number; // seconds
  hasRealTimeFlow: boolean;
  hasOptionsFlow: boolean;
  hasDarkPool: boolean;
  hasAlerts: boolean;
  dailyQuestionsLimit: number;
}

// Tier configurations
export const TIER_CONFIG: Record<SubscriptionTier, UserConfig> = {
  free: {
    tier: 'free',
    maxWatchlist: 5,
    pollInterval: 900, // 15 minutes
    hasRealTimeFlow: false,
    hasOptionsFlow: true, // delayed
    hasDarkPool: false,
    hasAlerts: false,
    dailyQuestionsLimit: 3,
  },
  pro: {
    tier: 'pro',
    maxWatchlist: 15,
    pollInterval: 60, // 1 minute
    hasRealTimeFlow: true,
    hasOptionsFlow: true,
    hasDarkPool: true,
    hasAlerts: true,
    dailyQuestionsLimit: 100,
  },
  elite: {
    tier: 'elite',
    maxWatchlist: 50,
    pollInterval: 5, // 5 seconds
    hasRealTimeFlow: true,
    hasOptionsFlow: true,
    hasDarkPool: true,
    hasAlerts: true,
    dailyQuestionsLimit: -1, // unlimited
  },
};

// ═══════════════════════════════════════════════════════════════
//  WATCHLIST & ALERTS
// ═══════════════════════════════════════════════════════════════

export interface WatchlistItem {
  ticker: string;
  addedAt: Date;
  alertPrice?: number;
  notes?: string;
}

export interface Alert {
  id: string;
  type: 'price' | 'options' | 'news' | 'regime';
  ticker?: string;
  title: string;
  message: string;
  severity: 'info' | 'warning' | 'critical';
  isRead: boolean;
  createdAt: Date;
}

// ═══════════════════════════════════════════════════════════════
//  API RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════

export interface APIResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  meta?: {
    timestamp: Date;
    cached?: boolean;
    nextUpdate?: Date;
  };
}

export interface PaginatedResponse<T> extends APIResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

// ═══════════════════════════════════════════════════════════════
//  REAL-TIME / WEBSOCKET TYPES
// ═══════════════════════════════════════════════════════════════

export type SocketEvent = 
  | 'price:update'
  | 'flow:new'
  | 'news:new'
  | 'alert:new'
  | 'regime:change'
  | 'subscribe'
  | 'unsubscribe';

export interface SocketMessage<T = unknown> {
  event: SocketEvent;
  data: T;
  timestamp: Date;
}

export interface SubscriptionRequest {
  channel: 'prices' | 'flow' | 'news' | 'alerts';
  tickers?: string[];
}
