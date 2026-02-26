'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { PANEL_COLORS as C } from '@/lib/panel-design-system';
import type { AlertTier, AlertType, AlertConfidence } from '@/components/ask/alert-types';

/* ════════════════════════════════════════════════════════════════
   /alerts — Full Alert History Page
   
   Sections:
   1. Header with back button + stats summary
   2. Filter bar: time range pills + tier tabs + ticker search
   3. Alert feed (scrollable, grouped by time)
   4. Detail panel (slide-in when alert clicked)
   
   Data: fetches directly from /api/alerts (not the store)
   to support broader time ranges and larger datasets.
   ════════════════════════════════════════════════════════════════ */

const FONT = "'JetBrains Mono', 'SF Mono', monospace";
const BG = '#0a0e17';
const CARD_BG = '#111827';

type TimeRange = '15m' | '30m' | '1h' | '4h' | 'today' | 'all';
type TierFilter = 'all' | 1 | 2 | 3;

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
  signalsJson: any[];
  read: boolean;
  createdAt: string;
}

const TIME_RANGES: Array<{ key: TimeRange; label: string; minutes: number | null }> = [
  { key: '15m', label: '15m', minutes: 15 },
  { key: '30m', label: '30m', minutes: 30 },
  { key: '1h', label: '1h', minutes: 60 },
  { key: '4h', label: '4h', minutes: 240 },
  { key: 'today', label: 'Today', minutes: null },
  { key: 'all', label: 'All', minutes: null },
];

const TIER_TABS: Array<{ key: TierFilter; label: string }> = [
  { key: 'all', label: 'All Tiers' },
  { key: 1, label: '🎯 T1 Confluence' },
  { key: 2, label: '🔥 T2 Unusual' },
  { key: 3, label: '📍 T3 Watchlist' },
];

const TIER_COLORS: Record<number, { bg: string; color: string; label: string }> = {
  1: { bg: C.greenDim, color: C.green, label: 'T1' },
  2: { bg: C.yellowDim, color: C.yellow, label: 'T2' },
  3: { bg: C.purpleDim, color: C.purple, label: 'T3' },
};

const CONF_COLORS: Record<string, { bg: string; color: string }> = {
  HIGH: { bg: C.greenDim, color: C.green },
  MODERATE: { bg: C.yellowDim, color: C.yellow },
  LOW: { bg: C.redDim, color: C.red },
};

const BIAS_COLORS: Record<string, string> = {
  bullish: C.green,
  bearish: C.red,
  neutral: C.yellow,
};

const ALERT_ICONS: Record<string, string> = {
  confluence: '🎯', thesis_flip: '⚡', sweep_cluster: '🔥',
  cvd_divergence: '📉', dark_pool_large: '🏦', flow_crossover: '🔀',
  key_level: '📍', rs_regime_change: '💪', news_catalyst: '📰',
};

function timeAgo(ts: string): string {
  const diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function formatTime(ts: string): string {
  return new Date(ts).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
    timeZone: 'America/New_York',
  });
}

export default function AlertsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [alerts, setAlerts] = useState<AlertData[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('today');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [tickerSearch, setTickerSearch] = useState('');
  const [selectedAlert, setSelectedAlert] = useState<AlertData | null>(null);

  // Fetch alerts
  const fetchAlerts = useCallback(async () => {
    if (!session?.user) return;
    setLoading(true);
    try {
      let since = '';
      if (timeRange !== 'all') {
        const now = Date.now();
        const range = TIME_RANGES.find(r => r.key === timeRange);
        if (range?.minutes) {
          since = new Date(now - range.minutes * 60_000).toISOString();
        } else if (timeRange === 'today') {
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          since = today.toISOString();
        }
      }
      const url = since
        ? `/api/alerts?since=${encodeURIComponent(since)}&limit=50`
        : '/api/alerts?limit=50';
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        setAlerts(data.alerts || []);
      }
    } catch {
      // silent
    }
    setLoading(false);
  }, [session, timeRange]);

  useEffect(() => { fetchAlerts(); }, [fetchAlerts]);

  // Filters
  const filtered = alerts.filter(a => {
    if (tierFilter !== 'all' && a.tier !== tierFilter) return false;
    if (tickerSearch && !a.ticker.toLowerCase().includes(tickerSearch.toLowerCase())) return false;
    return true;
  });

  // Stats
  const totalToday = alerts.length;
  const unreadCount = alerts.filter(a => !a.read).length;
  const t1Count = alerts.filter(a => a.tier === 1).length;
  const bullishCount = alerts.filter(a => a.bias === 'bullish').length;

  // Mark read
  const markRead = async (id: string) => {
    await fetch('/api/alerts/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action: 'read' }),
    }).catch(() => {});
    setAlerts(prev => prev.map(a => a.id === id ? { ...a, read: true } : a));
  };

  // Auth gate
  if (status === 'loading') {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'rgba(255,255,255,0.3)', fontFamily: FONT, fontSize: 13 }}>Loading...</div>
      </div>
    );
  }

  if (!session) {
    return (
      <div style={{ background: BG, minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: FONT, fontSize: 14 }}>Sign in to view your alerts</div>
        <button
          onClick={() => router.push('/api/auth/signin')}
          style={{
            padding: '8px 24px', borderRadius: 6, background: 'rgba(0,230,118,0.15)',
            border: '1px solid rgba(0,230,118,0.3)', color: '#00e676',
            fontSize: 13, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
          }}
        >
          Sign In
        </button>
      </div>
    );
  }

  return (
    <div style={{ background: BG, minHeight: '100vh', fontFamily: FONT, color: C.textPrimary }}>
      {/* ── Header ──────────────────────────────────────── */}
      <div style={{
        padding: '16px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 16,
        background: 'rgba(0,0,0,0.3)',
      }}>
        <button
          onClick={() => router.push('/ask')}
          style={{
            padding: '6px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.05)',
            border: `1px solid ${C.border}`, color: 'rgba(255,255,255,0.5)',
            fontSize: 12, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
          }}
        >
          ← Back to Dashboard
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>🔔 Alert Center</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
            Real-time signal alerts for your watchlist
          </div>
        </div>

        {/* Stats pills */}
        <div style={{ display: 'flex', gap: 8 }}>
          <StatPill label="Total" value={totalToday} color={C.cyan} />
          <StatPill label="Unread" value={unreadCount} color={C.yellow} />
          <StatPill label="T1" value={t1Count} color={C.green} />
          <StatPill label="Bullish" value={bullishCount} color={C.green} />
        </div>
      </div>

      {/* ── Filter Bar ──────────────────────────────────── */}
      <div style={{
        padding: '12px 24px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        background: 'rgba(0,0,0,0.15)',
      }}>
        {/* Time range pills */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TIME_RANGES.map(r => (
            <button
              key={r.key}
              onClick={() => setTimeRange(r.key)}
              style={{
                fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 4,
                border: 'none', fontFamily: FONT, cursor: 'pointer',
                color: timeRange === r.key ? C.cyan : 'rgba(255,255,255,0.3)',
                background: timeRange === r.key ? C.cyanDim : 'rgba(255,255,255,0.04)',
                transition: 'all 0.15s',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: C.border }} />

        {/* Tier tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TIER_TABS.map(t => (
            <button
              key={String(t.key)}
              onClick={() => setTierFilter(t.key)}
              style={{
                fontSize: 10, fontWeight: 600, padding: '4px 10px', borderRadius: 4,
                border: 'none', fontFamily: FONT, cursor: 'pointer',
                color: tierFilter === t.key ? C.cyan : 'rgba(255,255,255,0.3)',
                background: tierFilter === t.key ? C.cyanDim : 'rgba(255,255,255,0.04)',
                transition: 'all 0.15s',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Ticker search */}
        <input
          placeholder="Filter by ticker..."
          value={tickerSearch}
          onChange={e => setTickerSearch(e.target.value)}
          style={{
            width: 140, padding: '5px 10px', borderRadius: 4,
            background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
            color: C.textPrimary, fontSize: 11, fontFamily: FONT, outline: 'none',
          }}
        />

        <button
          onClick={fetchAlerts}
          style={{
            padding: '5px 12px', borderRadius: 4, background: C.cyanDim,
            border: `1px solid ${C.cyan}`, color: C.cyan,
            fontSize: 10, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
          }}
        >
          ↻ Refresh
        </button>
      </div>

      {/* ── Main Content ────────────────────────────────── */}
      <div style={{ display: 'flex', maxWidth: 1200, margin: '0 auto' }}>

        {/* Alert Feed */}
        <div style={{ flex: 1, padding: '16px 24px', minHeight: 'calc(100vh - 140px)' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>
              Loading alerts...
            </div>
          ) : filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.25)', fontSize: 12,
            }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>🔕</div>
              <div style={{ marginBottom: 4 }}>No alerts in this time range</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)' }}>
                Alerts are generated during market hours (9:30 AM – 4:00 PM ET)
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(alert => (
                <AlertRow
                  key={alert.id}
                  alert={alert}
                  isSelected={selectedAlert?.id === alert.id}
                  onClick={() => {
                    setSelectedAlert(alert);
                    if (!alert.read) markRead(alert.id);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Detail Panel (right side) */}
        {selectedAlert && (
          <div style={{
            width: 380, borderLeft: `1px solid ${C.border}`,
            background: CARD_BG, padding: 0, position: 'sticky', top: 0,
            height: 'calc(100vh - 140px)', overflowY: 'auto',
            animation: 'alert-detail-slide 0.2s ease',
          }}>
            <DetailPanel alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
          </div>
        )}
      </div>

      <style>{`
        @keyframes alert-detail-slide {
          from { opacity: 0; transform: translateX(20px); }
          to { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}

// ── Components ───────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '4px 10px', borderRadius: 4,
      background: `${color}12`, border: `1px solid ${color}30`,
    }}>
      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}

function AlertRow({ alert, isSelected, onClick }: {
  alert: AlertData; isSelected: boolean; onClick: () => void;
}) {
  const tier = TIER_COLORS[alert.tier] || TIER_COLORS[3];
  const conf = CONF_COLORS[alert.confidence] || CONF_COLORS.LOW;
  const biasColor = BIAS_COLORS[alert.bias] || C.yellow;
  const icon = ALERT_ICONS[alert.type] || '🔔';

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 12,
        padding: '14px 16px', borderRadius: 8, cursor: 'pointer',
        background: isSelected ? 'rgba(0,229,255,0.06)' : alert.read ? CARD_BG : 'rgba(0,229,255,0.02)',
        border: isSelected
          ? `1px solid ${C.cyan}`
          : alert.read
            ? `1px solid ${C.border}`
            : `1px solid rgba(0,229,255,0.15)`,
        borderLeft: alert.read ? undefined : `3px solid ${C.cyan}`,
        transition: 'all 0.15s',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 40, height: 40, borderRadius: 6,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 20, flexShrink: 0, background: tier.bg,
      }}>
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 12, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
            background: 'rgba(255,255,255,0.08)', color: C.textPrimary,
          }}>
            {alert.ticker}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 2,
            background: tier.bg, color: tier.color,
          }}>
            {tier.label}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 2,
            background: `${biasColor}18`, color: biasColor,
            textTransform: 'uppercase',
          }}>
            {alert.bias}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '2px 5px', borderRadius: 2,
            background: conf.bg, color: conf.color,
          }}>
            {alert.confidence}
          </span>
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
            {formatTime(alert.createdAt)}
          </span>
        </div>

        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 3 }}>
          {alert.title}
        </div>

        <div style={{
          fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {alert.summary}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
            {timeAgo(alert.createdAt)}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.4)',
          }}>
            @ ${alert.price.toFixed(2)}
          </span>
          {alert.target1 && (
            <span style={{ fontSize: 10, color: C.green }}>
              Target ${alert.target1.toFixed(2)}
            </span>
          )}
          {alert.stopPrice && (
            <span style={{ fontSize: 10, color: C.red }}>
              Stop ${alert.stopPrice.toFixed(2)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailPanel({ alert, onClose }: { alert: AlertData; onClose: () => void }) {
  const tier = TIER_COLORS[alert.tier] || TIER_COLORS[3];
  const biasColor = BIAS_COLORS[alert.bias] || C.yellow;
  const signals = Array.isArray(alert.signalsJson) ? alert.signalsJson : [];

  const rrRatio = alert.target1 && alert.stopPrice && alert.price
    ? Math.abs(alert.target1 - alert.price) / Math.abs(alert.price - alert.stopPrice)
    : null;

  return (
    <div>
      {/* Header */}
      <div style={{
        padding: '16px 20px', borderBottom: `1px solid ${C.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 20 }}>{ALERT_ICONS[alert.type] || '🔔'}</span>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{alert.ticker}</span>
          <span style={{
            fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 3,
            background: tier.bg, color: tier.color,
          }}>
            {tier.label}
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 24, height: 24, borderRadius: 4, border: 'none',
            background: 'none', color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer', fontSize: 16,
          }}
        >
          ×
        </button>
      </div>

      <div style={{ padding: '16px 20px' }}>
        {/* Title + summary */}
        <div style={{ fontSize: 14, fontWeight: 700, color: C.textPrimary, marginBottom: 6 }}>
          {alert.title}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 16 }}>
          {alert.summary}
        </div>

        {/* Bias + confidence + time */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
            background: `${biasColor}18`, color: biasColor, textTransform: 'uppercase',
          }}>
            {alert.bias}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
            background: (CONF_COLORS[alert.confidence] || CONF_COLORS.LOW).bg,
            color: (CONF_COLORS[alert.confidence] || CONF_COLORS.LOW).color,
          }}>
            {alert.confidence} Confidence
          </span>
          <span style={{
            fontSize: 10, padding: '3px 8px', borderRadius: 4,
            background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)',
          }}>
            {formatTime(alert.createdAt)} ET
          </span>
        </div>

        {/* Trade Levels */}
        {(alert.target1 || alert.stopPrice) && (
          <div style={{ marginBottom: 20 }}>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10,
            }}>
              Trade Levels
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8,
            }}>
              <LevelBox label="Entry" value={`$${alert.price.toFixed(2)}`} color={C.cyan} />
              {alert.target1 && (
                <LevelBox
                  label="Target"
                  value={`$${alert.target1.toFixed(2)}`}
                  sub={`+${((alert.target1 - alert.price) / alert.price * 100).toFixed(1)}%`}
                  color={C.green}
                />
              )}
              {alert.stopPrice && (
                <LevelBox
                  label="Stop"
                  value={`$${alert.stopPrice.toFixed(2)}`}
                  sub={`${((alert.stopPrice - alert.price) / alert.price * 100).toFixed(1)}%`}
                  color={C.red}
                />
              )}
            </div>
            {rrRatio && (
              <div style={{
                marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.4)', textAlign: 'center',
              }}>
                R:R Ratio{' '}
                <span style={{ color: rrRatio >= 2 ? C.green : C.yellow, fontWeight: 700 }}>
                  {rrRatio.toFixed(1)}:1
                </span>
              </div>
            )}
          </div>
        )}

        {/* Contributing Signals */}
        {signals.length > 0 && (
          <div>
            <div style={{
              fontSize: 10, fontWeight: 700, letterSpacing: 1,
              color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', marginBottom: 10,
            }}>
              Contributing Signals
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {signals.map((s: any, i: number) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 12px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${C.border}`,
                }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: '50%',
                    background: s.status === 'bullish' ? C.green : s.status === 'bearish' ? C.red : C.yellow,
                  }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: C.textPrimary, minWidth: 100 }}>
                    {s.panel}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', flex: 1 }}>
                    {s.detail}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LevelBox({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color: string;
}) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 6, textAlign: 'center',
      background: `${color}08`, border: `1px solid ${color}25`,
    }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}
