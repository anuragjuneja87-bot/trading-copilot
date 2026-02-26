/* ════════════════════════════════════════════════════════════════
   ALERT TYPES — Shared interfaces for TradeYodha Alert System
   
   Three tiers:
     T1 (Confluence) — highest value, 4+ panels aligned
     T2 (Unusual)    — time-sensitive anomalies  
     T3 (Watchlist)  — background monitoring

   Used by: alert-provider, alert-bell, alert-detail-modal,
            alert-toast, alert-settings-modal
   ════════════════════════════════════════════════════════════════ */

export type AlertTier = 1 | 2 | 3;
export type AlertBias = 'bullish' | 'bearish' | 'neutral';
export type AlertConfidence = 'LOW' | 'MODERATE' | 'HIGH';

export type AlertType =
  | 'confluence'
  | 'thesis_flip'
  | 'sweep_cluster'
  | 'cvd_divergence'
  | 'dark_pool_large'
  | 'flow_crossover'
  | 'key_level'
  | 'rs_regime_change'
  | 'news_catalyst';

export interface AlertSignal {
  panel: string;           // "Options Flow", "Dark Pool", etc.
  status: 'bullish' | 'bearish' | 'neutral';
  detail: string;          // "Call dominant 60%"
}

export interface Alert {
  id: string;
  ticker: string;
  type: AlertType;
  tier: AlertTier;
  title: string;           // "High Confluence Bullish Setup"
  summary: string;         // one-line
  signals: AlertSignal[];  // contributing signals for detail view
  bias: AlertBias;
  confidence: AlertConfidence;
  price: number;           // price when alert fired
  target1?: number;
  target2?: number;
  stop?: number;
  timestamp: number;       // ms since epoch
  read: boolean;
  dismissed: boolean;
}

// ── Alert type metadata (for settings panel) ──────────────────

export interface AlertTypeConfig {
  type: AlertType;
  name: string;
  description: string;
  icon: string;
  tier: AlertTier;
  enabled: boolean;
}

export const DEFAULT_ALERT_TYPES: AlertTypeConfig[] = [
  { type: 'confluence',      name: 'High Confluence Setup', description: '4+ panels aligned in same direction',                   icon: '🎯', tier: 1, enabled: true },
  { type: 'thesis_flip',     name: 'Thesis Flip',           description: 'AI thesis changes direction (bullish ↔ bearish)',        icon: '⚡', tier: 1, enabled: true },
  { type: 'sweep_cluster',   name: 'Sweep Cluster',         description: '≥3 sweeps at same strike within 2 minutes',             icon: '🔥', tier: 2, enabled: true },
  { type: 'cvd_divergence',  name: 'CVD Divergence',        description: 'Price and volume delta moving in opposite directions',   icon: '📉', tier: 2, enabled: true },
  { type: 'dark_pool_large', name: 'Dark Pool Large Print',  description: 'Block trade >$5M above or below VWAP',                 icon: '🏦', tier: 2, enabled: true },
  { type: 'flow_crossover',  name: 'Flow Crossover',        description: 'Call/put cumulative premium lines cross',               icon: '🔀', tier: 2, enabled: false },
  { type: 'key_level',       name: 'Key Level Approach',    description: 'Price within 0.5% of gamma wall or pivot',              icon: '📍', tier: 3, enabled: true },
  { type: 'rs_regime_change',name: 'RS Regime Change',      description: 'Relative strength shifts (e.g. Leading → Lagging)',     icon: '💪', tier: 3, enabled: false },
  { type: 'news_catalyst',   name: 'News Catalyst',         description: 'Significant sentiment shift from headline',             icon: '📰', tier: 3, enabled: true },
];

// ── Delivery channels ──────────────────────────────────────────

export type ChannelId = 'in_app' | 'browser_push' | 'sms' | 'discord';

export interface DeliveryChannel {
  id: ChannelId;
  name: string;
  icon: string;
  status: 'always_on' | 'connected' | 'setup';
  enabled: boolean;
  tierLimit?: AlertTier; // e.g. SMS only for tier 1
}

export const DEFAULT_CHANNELS: DeliveryChannel[] = [
  { id: 'in_app',       name: 'In-App Notifications', icon: '🔔', status: 'always_on', enabled: true },
  { id: 'browser_push', name: 'Browser Push',         icon: '🌐', status: 'connected', enabled: true },
  { id: 'sms',          name: 'SMS (Tier 1 only)',    icon: '💬', status: 'setup',     enabled: false, tierLimit: 1 },
  { id: 'discord',      name: 'Discord Webhook',      icon: '🎮', status: 'setup',     enabled: false },
];

// ── Sensitivity levels ─────────────────────────────────────────

export type Sensitivity = 'LOW' | 'MEDIUM' | 'HIGH';

// ── Settings aggregate ─────────────────────────────────────────

export interface AlertSettings {
  watchlist: string[];
  alertTypes: AlertTypeConfig[];
  channels: DeliveryChannel[];
  sensitivity: Sensitivity;
  marketHoursOnly: boolean;
}
