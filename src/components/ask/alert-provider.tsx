'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import type {
  Alert, AlertSettings, AlertType, AlertTier, Sensitivity,
  AlertTypeConfig, DeliveryChannel,
} from './alert-types';
import { DEFAULT_ALERT_TYPES, DEFAULT_CHANNELS } from './alert-types';

/* ════════════════════════════════════════════════════════════════
   ALERT PROVIDER — Context + state management for alert system

   Manages: alerts list, unread count, read/dismiss actions,
            settings (watchlist, alert types, sensitivity, channels),
            toast queue, dropdown/detail/settings modal state.

   Currently uses MOCK data. Backend integration points are marked
   with // TODO: BACKEND comments for easy wiring later.
   ════════════════════════════════════════════════════════════════ */

// ── Mock alerts ───────────────────────────────────────────────

const MOCK_ALERTS: Alert[] = [
  {
    id: 'a1', ticker: 'NVDA', type: 'confluence', tier: 1,
    title: 'High Confluence Setup',
    summary: '5/6 panels bullish · Sweep cluster $200C · DP accumulation above VWAP · CVD rising',
    signals: [
      { panel: 'Options Flow', status: 'bullish', detail: 'Call dominant 60%' },
      { panel: 'Dark Pool', status: 'bullish', detail: 'Accumulation above VWAP' },
      { panel: 'Volume Pressure', status: 'bullish', detail: 'CVD +10.3M rising' },
      { panel: 'Gamma', status: 'bullish', detail: 'Positive GEX, pinned' },
      { panel: 'Relative Strength', status: 'bullish', detail: 'Leading SPY' },
      { panel: 'News', status: 'neutral', detail: 'No catalyst' },
    ],
    bias: 'bullish', confidence: 'HIGH', price: 195.92,
    target1: 200.00, stop: 190.00,
    timestamp: Date.now() - 2 * 60_000, read: false, dismissed: false,
  },
  {
    id: 'a2', ticker: 'META', type: 'sweep_cluster', tier: 2,
    title: 'Sweep Cluster Detected',
    summary: '4 sweeps at $650C in 90 seconds — $2.1M total premium',
    signals: [
      { panel: 'Options Flow', status: 'bullish', detail: '4 sweeps same strike $650C' },
    ],
    bias: 'bullish', confidence: 'MODERATE', price: 647.04,
    target1: 660.00, stop: 638.00,
    timestamp: Date.now() - 8 * 60_000, read: false, dismissed: false,
  },
  {
    id: 'a3', ticker: 'SPY', type: 'thesis_flip', tier: 1,
    title: 'Thesis Flipped → Bearish',
    summary: 'Bias shifted BULLISH → BEARISH · CVD divergence + put dominance building',
    signals: [
      { panel: 'Volume Pressure', status: 'bearish', detail: 'CVD divergence detected' },
      { panel: 'Options Flow', status: 'bearish', detail: 'Put dominance 68%' },
      { panel: 'Relative Strength', status: 'bearish', detail: 'Lagging QQQ' },
    ],
    bias: 'bearish', confidence: 'HIGH', price: 593.15,
    target1: 588.00, stop: 597.00,
    timestamp: Date.now() - 15 * 60_000, read: false, dismissed: false,
  },
  {
    id: 'a4', ticker: 'AAPL', type: 'cvd_divergence', tier: 2,
    title: 'CVD Divergence',
    summary: 'Price +0.3% new high but CVD falling — sellers stepping in',
    signals: [
      { panel: 'Volume Pressure', status: 'bearish', detail: 'CVD diverging from price' },
    ],
    bias: 'bearish', confidence: 'MODERATE', price: 274.20,
    timestamp: Date.now() - 22 * 60_000, read: true, dismissed: false,
  },
  {
    id: 'a5', ticker: 'QQQ', type: 'key_level', tier: 3,
    title: 'Approaching Call Wall',
    summary: 'Price 0.8% from call wall $620 — expect resistance or gamma squeeze',
    signals: [
      { panel: 'Gamma', status: 'neutral', detail: 'Price within 0.8% of call wall' },
    ],
    bias: 'neutral', confidence: 'LOW', price: 614.85,
    timestamp: Date.now() - 35 * 60_000, read: true, dismissed: false,
  },
];

// ── Context shape ─────────────────────────────────────────────

interface AlertContextValue {
  // Alerts
  alerts: Alert[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissAlert: (id: string) => void;

  // UI state
  dropdownOpen: boolean;
  setDropdownOpen: (v: boolean) => void;
  detailAlert: Alert | null;
  openDetail: (alert: Alert) => void;
  closeDetail: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;

  // Toast
  toastAlert: Alert | null;
  dismissToast: () => void;

  // Settings
  settings: AlertSettings;
  updateWatchlist: (tickers: string[]) => void;
  toggleAlertType: (type: AlertType) => void;
  toggleChannel: (id: string) => void;
  setSensitivity: (s: Sensitivity) => void;
  toggleMarketHours: () => void;

  // Navigation
  onTickerClick?: (ticker: string) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertProvider');
  return ctx;
}

// ── Provider ──────────────────────────────────────────────────

interface AlertProviderProps {
  children: React.ReactNode;
  onTickerClick?: (ticker: string) => void;
}

export function AlertProvider({ children, onTickerClick }: AlertProviderProps) {
  // ── Alerts state ────────────────────────────────────────────
  const [alerts, setAlerts] = useState<Alert[]>(MOCK_ALERTS);

  const unreadCount = alerts.filter(a => !a.read && !a.dismissed).length;

  const markRead = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  }, []);

  const markAllRead = useCallback(() => {
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  const dismissAlert = useCallback((id: string) => {
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, dismissed: true, read: true } : a));
  }, []);

  // ── UI state ────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastAlert, setToastAlert] = useState<Alert | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const openDetail = useCallback((alert: Alert) => {
    setDropdownOpen(false);
    setDetailAlert(alert);
    markRead(alert.id);
  }, [markRead]);

  const closeDetail = useCallback(() => {
    setDetailAlert(null);
  }, []);

  const dismissToast = useCallback(() => {
    setToastAlert(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  }, []);

  // ── Settings state ──────────────────────────────────────────
  const [settings, setSettings] = useState<AlertSettings>({
    watchlist: ['SPY', 'QQQ', 'NVDA', 'META', 'AAPL', 'GOOG', 'TSLA', 'AMD'],
    alertTypes: [...DEFAULT_ALERT_TYPES],
    channels: [...DEFAULT_CHANNELS],
    sensitivity: 'MEDIUM',
    marketHoursOnly: true,
  });

  const updateWatchlist = useCallback((tickers: string[]) => {
    setSettings(prev => ({ ...prev, watchlist: tickers }));
    // TODO: BACKEND — persist watchlist
  }, []);

  const toggleAlertType = useCallback((type: AlertType) => {
    setSettings(prev => ({
      ...prev,
      alertTypes: prev.alertTypes.map(at =>
        at.type === type ? { ...at, enabled: !at.enabled } : at
      ),
    }));
    // TODO: BACKEND — persist alert type preferences
  }, []);

  const toggleChannel = useCallback((id: string) => {
    setSettings(prev => ({
      ...prev,
      channels: prev.channels.map(ch =>
        ch.id === id && ch.status !== 'always_on' ? { ...ch, enabled: !ch.enabled } : ch
      ),
    }));
    // TODO: BACKEND — persist channel preferences
  }, []);

  const setSensitivity = useCallback((s: Sensitivity) => {
    setSettings(prev => ({ ...prev, sensitivity: s }));
    // TODO: BACKEND — persist sensitivity
  }, []);

  const toggleMarketHours = useCallback(() => {
    setSettings(prev => ({ ...prev, marketHoursOnly: !prev.marketHoursOnly }));
    // TODO: BACKEND — persist schedule
  }, []);

  // ── Demo: simulate toast on mount (remove when backend is wired) ──
  useEffect(() => {
    const timer = setTimeout(() => {
      const newest = alerts.find(a => !a.read);
      if (newest) {
        setToastAlert(newest);
        toastTimeoutRef.current = setTimeout(() => setToastAlert(null), 8000);
      }
    }, 2000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // TODO: BACKEND — SSE/WebSocket listener for real-time alerts
  // useEffect(() => {
  //   const es = new EventSource('/api/alerts/stream');
  //   es.onmessage = (e) => {
  //     const alert = JSON.parse(e.data);
  //     setAlerts(prev => [alert, ...prev]);
  //     setToastAlert(alert);
  //     toastTimeoutRef.current = setTimeout(() => setToastAlert(null), 8000);
  //   };
  //   return () => es.close();
  // }, []);

  return (
    <AlertContext.Provider value={{
      alerts: alerts.filter(a => !a.dismissed),
      unreadCount,
      markRead,
      markAllRead,
      dismissAlert,
      dropdownOpen,
      setDropdownOpen,
      detailAlert,
      openDetail,
      closeDetail,
      settingsOpen,
      setSettingsOpen,
      toastAlert,
      dismissToast,
      settings,
      updateWatchlist,
      toggleAlertType,
      toggleChannel,
      setSensitivity,
      toggleMarketHours,
      onTickerClick,
    }}>
      {children}
    </AlertContext.Provider>
  );
}
