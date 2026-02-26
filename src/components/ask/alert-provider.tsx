'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import type {
  Alert, AlertSettings, AlertType, Sensitivity,
  AlertTypeConfig, DeliveryChannel,
} from './alert-types';
import { DEFAULT_ALERT_TYPES, DEFAULT_CHANNELS } from './alert-types';
import {
  useAlertsStore,
  useWatchlistStore,
} from '@/stores';

/* ════════════════════════════════════════════════════════════════
   ALERT PROVIDER v2 — Database-backed via useAlertsStore polling
   
   Changes from v1 (mock):
   - Alerts come from real DB polling (every 20s)
   - Settings sync to /api/alerts/settings
   - Toast triggers on NEW alerts arriving between polls
   - Watchlist reads from useWatchlistStore (DB-synced)
   - Works only when authenticated (silent no-op when anon)
   
   Same context interface — bell, toast, detail, settings
   components require ZERO changes.
   ════════════════════════════════════════════════════════════════ */

// ── Context interface (unchanged from v1) ────────────────────

interface AlertContextValue {
  alerts: Alert[];
  unreadCount: number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  dismissAlert: (id: string) => void;

  dropdownOpen: boolean;
  setDropdownOpen: (v: boolean) => void;
  detailAlert: Alert | null;
  openDetail: (alert: Alert) => void;
  closeDetail: () => void;
  settingsOpen: boolean;
  setSettingsOpen: (v: boolean) => void;

  toastAlert: Alert | null;
  dismissToast: () => void;

  settings: AlertSettings;
  updateWatchlist: (tickers: string[]) => void;
  toggleAlertType: (type: AlertType) => void;
  toggleChannel: (id: string) => void;
  setSensitivity: (s: Sensitivity) => void;
  toggleMarketHours: () => void;

  onTickerClick?: (ticker: string) => void;
}

const AlertContext = createContext<AlertContextValue | null>(null);

export function useAlerts() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlerts must be used within AlertProvider');
  return ctx;
}

// ── Map DB alert → frontend Alert type ───────────────────────

function mapDbAlert(db: any): Alert {
  return {
    id: db.id,
    ticker: db.ticker,
    type: db.type as AlertType,
    tier: db.tier,
    title: db.title,
    summary: db.summary,
    signals: Array.isArray(db.signalsJson) ? db.signalsJson : [],
    bias: db.bias,
    confidence: db.confidence,
    price: db.price,
    target1: db.target1 ?? undefined,
    stop: db.stopPrice ?? undefined,
    timestamp: new Date(db.createdAt).getTime(),
    read: db.read,
    dismissed: false,
  };
}

// ── Provider ──────────────────────────────────────────────────

interface AlertProviderProps {
  children: React.ReactNode;
  onTickerClick?: (ticker: string) => void;
}

export function AlertProvider({ children, onTickerClick }: AlertProviderProps) {
  const { data: session } = useSession();
  const isAuth = !!session?.user;

  // ── Real alerts from Zustand store (DB-backed polling) ─────
  const storeAlerts = useAlertsStore(s => s.alerts);
  const storeUnread = useAlertsStore(s => s.unreadCount);
  const storeMarkRead = useAlertsStore(s => s.markAsRead);
  const storeMarkAll = useAlertsStore(s => s.markAllAsRead);
  const storeDismiss = useAlertsStore(s => s.dismissAlert);
  const startPolling = useAlertsStore(s => s.startPolling);
  const stopPolling = useAlertsStore(s => s.stopPolling);

  const alerts: Alert[] = storeAlerts.map(mapDbAlert);
  const unreadCount = storeUnread;

  // ── Start/stop polling based on auth ───────────────────────
  useEffect(() => {
    if (isAuth) {
      startPolling();
      return () => stopPolling();
    }
  }, [isAuth, startPolling, stopPolling]);

  // ── Alert actions (delegate to store → DB) ─────────────────
  const markRead = useCallback((id: string) => storeMarkRead(id), [storeMarkRead]);
  const markAllRead = useCallback(() => storeMarkAll(), [storeMarkAll]);
  const dismissAlert = useCallback((id: string) => storeDismiss(id), [storeDismiss]);

  // ── UI state ────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [detailAlert, setDetailAlert] = useState<Alert | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toastAlert, setToastAlert] = useState<Alert | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const prevAlertIdsRef = useRef<Set<string>>(new Set());

  const openDetail = useCallback((alert: Alert) => {
    setDropdownOpen(false);
    setDetailAlert(alert);
    markRead(alert.id);
  }, [markRead]);

  const closeDetail = useCallback(() => setDetailAlert(null), []);

  const dismissToast = useCallback(() => {
    setToastAlert(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  }, []);

  // ── Toast on genuinely NEW alerts ──────────────────────────
  useEffect(() => {
    const currentIds = new Set(alerts.map(a => a.id));
    const newAlerts = alerts.filter(a => !a.read && !prevAlertIdsRef.current.has(a.id));

    if (newAlerts.length > 0) {
      const newest = newAlerts[0];
      setToastAlert(newest);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = setTimeout(() => setToastAlert(null), 8000);
    }

    prevAlertIdsRef.current = currentIds;
  }, [alerts]);

  // ── Settings state (synced to /api/alerts/settings) ────────
  const watchlist = useWatchlistStore(s => s.watchlist);
  const [alertTypes, setAlertTypes] = useState<AlertTypeConfig[]>([...DEFAULT_ALERT_TYPES]);
  const [channels, setChannels] = useState<DeliveryChannel[]>([...DEFAULT_CHANNELS]);
  const [sensitivity, setSensitivityLocal] = useState<Sensitivity>('MEDIUM');
  const [marketHoursOnly, setMarketHoursLocal] = useState(true);

  // Load settings from DB on auth
  useEffect(() => {
    if (!isAuth) return;
    fetch('/api/alerts/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.enabledTypes) {
          const enabled = new Set(data.enabledTypes);
          setAlertTypes(prev => prev.map(at => ({ ...at, enabled: enabled.has(at.type) })));
        }
        if (data.sensitivity) setSensitivityLocal(data.sensitivity);
        if (data.marketHoursOnly !== undefined) setMarketHoursLocal(data.marketHoursOnly);
      })
      .catch(() => {});
  }, [isAuth]);

  const settings: AlertSettings = { watchlist, alertTypes, channels, sensitivity, marketHoursOnly };

  const persistSettings = useCallback((updates: Record<string, any>) => {
    if (!isAuth) return;
    fetch('/api/alerts/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  }, [isAuth]);

  const updateWatchlist = useCallback((tickers: string[]) => {
    useWatchlistStore.getState().setWatchlist(tickers);
  }, []);

  const toggleAlertType = useCallback((type: AlertType) => {
    setAlertTypes(prev => {
      const updated = prev.map(at => at.type === type ? { ...at, enabled: !at.enabled } : at);
      persistSettings({ enabledTypes: updated.filter(at => at.enabled).map(at => at.type) });
      return updated;
    });
  }, [persistSettings]);

  const toggleChannel = useCallback((id: string) => {
    setChannels(prev => {
      const updated = prev.map(ch =>
        ch.id === id && ch.status !== 'always_on' ? { ...ch, enabled: !ch.enabled } : ch
      );
      persistSettings({
        pushEnabled: updated.find(c => c.id === 'browser_push')?.enabled ?? false,
        smsEnabled: updated.find(c => c.id === 'sms')?.enabled ?? false,
      });
      return updated;
    });
  }, [persistSettings]);

  const setSensitivity = useCallback((s: Sensitivity) => {
    setSensitivityLocal(s);
    persistSettings({ sensitivity: s });
  }, [persistSettings]);

  const toggleMarketHours = useCallback(() => {
    setMarketHoursLocal(prev => {
      persistSettings({ marketHoursOnly: !prev });
      return !prev;
    });
  }, [persistSettings]);

  return (
    <AlertContext.Provider value={{
      alerts, unreadCount, markRead, markAllRead, dismissAlert,
      dropdownOpen, setDropdownOpen,
      detailAlert, openDetail, closeDetail,
      settingsOpen, setSettingsOpen,
      toastAlert, dismissToast,
      settings, updateWatchlist, toggleAlertType, toggleChannel, setSensitivity, toggleMarketHours,
      onTickerClick,
    }}>
      {children}
    </AlertContext.Provider>
  );
}
