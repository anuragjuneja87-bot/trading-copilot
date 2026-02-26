'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useAlerts } from './alert-provider';
import { PANEL_COLORS as C } from '@/lib/panel-design-system';
import type { Alert, AlertTier } from './alert-types';

/* ════════════════════════════════════════════════════════════════
   ALERT BELL + DROPDOWN
   
   Bell icon with animated badge lives in the top nav.
   Clicking opens a dropdown feed with filter tabs,
   alert items, and footer actions.
   ════════════════════════════════════════════════════════════════ */

type FilterTab = 'all' | 'confluence' | 'unusual' | 'watchlist';

const TIER_FILTER: Record<FilterTab, AlertTier[]> = {
  all: [1, 2, 3],
  confluence: [1],
  unusual: [2],
  watchlist: [3],
};

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const TIER_COLORS: Record<AlertTier, { bg: string; color: string; label: string }> = {
  1: { bg: C.greenDim, color: C.green, label: 'T1' },
  2: { bg: C.yellowDim, color: C.yellow, label: 'T2' },
  3: { bg: C.purpleDim, color: C.purple, label: 'T3' },
};

const CONF_COLORS: Record<string, { bg: string; color: string }> = {
  HIGH:     { bg: C.greenDim, color: C.green },
  MODERATE: { bg: C.yellowDim, color: C.yellow },
  LOW:      { bg: C.redDim, color: C.red },
};

// ── Bell Icon Component ───────────────────────────────────────

export function AlertBell() {
  const { unreadCount, dropdownOpen, setDropdownOpen, setSettingsOpen } = useAlerts();
  const [ringing, setRinging] = useState(false);
  const prevCount = useRef(unreadCount);

  // Ring animation when new alerts arrive
  useEffect(() => {
    if (unreadCount > prevCount.current) {
      setRinging(true);
      const t = setTimeout(() => setRinging(false), 500);
      return () => clearTimeout(t);
    }
    prevCount.current = unreadCount;
  }, [unreadCount]);

  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => {
          setDropdownOpen(!dropdownOpen);
          setSettingsOpen(false);
        }}
        style={{
          position: 'relative', cursor: 'pointer', padding: 6,
          borderRadius: 4, border: 'none', background: 'none',
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        aria-label="Alerts"
      >
        <svg
          width={20} height={20} viewBox="0 0 24 24" fill="none"
          stroke={ringing ? C.yellow : 'rgba(255,255,255,0.55)'}
          strokeWidth={2} strokeLinecap="round"
          style={{
            transition: 'color 0.15s',
            animation: ringing ? 'alert-ring 0.4s ease' : 'none',
          }}
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            minWidth: 16, height: 16, borderRadius: 8,
            background: C.red, color: 'white',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', border: '2px solid #111827',
            animation: 'alert-pulse-badge 2s ease infinite',
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {dropdownOpen && <AlertDropdown />}

      {/* CSS keyframes injected once */}
      <style>{`
        @keyframes alert-ring {
          0% { transform: rotate(0); }
          15% { transform: rotate(14deg); }
          30% { transform: rotate(-14deg); }
          45% { transform: rotate(8deg); }
          60% { transform: rotate(-8deg); }
          75% { transform: rotate(3deg); }
          100% { transform: rotate(0); }
        }
        @keyframes alert-pulse-badge {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,0.4); }
          50% { box-shadow: 0 0 0 6px rgba(255,71,87,0); }
        }
        @keyframes alert-dropdown-in {
          from { opacity: 0; transform: translateY(-8px) scale(0.98); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}

// ── Dropdown Component ────────────────────────────────────────

function AlertDropdown() {
  const {
    alerts, markAllRead, openDetail,
    setDropdownOpen, setSettingsOpen,
  } = useAlerts();

  const [filter, setFilter] = useState<FilterTab>('all');
  const ref = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        // Don't close if clicking the bell button itself
        const bell = (e.target as HTMLElement).closest('[aria-label="Alerts"]');
        if (!bell) setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [setDropdownOpen]);

  const filtered = alerts.filter(a => TIER_FILTER[filter].includes(a.tier));
  const counts: Record<FilterTab, number> = {
    all: alerts.length,
    confluence: alerts.filter(a => a.tier === 1).length,
    unusual: alerts.filter(a => a.tier === 2).length,
    watchlist: alerts.filter(a => a.tier === 3).length,
  };

  const FONT = "'JetBrains Mono', 'SF Mono', monospace";

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute', top: 40, right: 0, zIndex: 200,
        width: 420, maxHeight: 'calc(100vh - 80px)',
        background: '#111827', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 8, boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
        display: 'flex', flexDirection: 'column',
        animation: 'alert-dropdown-in 0.2s ease',
        fontFamily: FONT,
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 16px', borderBottom: `1px solid ${C.border}`,
      }}>
        <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.5, color: C.textPrimary }}>
          🔔 Alerts
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <DropdownBtn onClick={markAllRead}>Mark all read</DropdownBtn>
          <DropdownBtn onClick={() => { setDropdownOpen(false); setSettingsOpen(true); }}>
            ⚙ Settings
          </DropdownBtn>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex', gap: 2, padding: '8px 12px',
        borderBottom: `1px solid ${C.border}`,
      }}>
        {(['all', 'confluence', 'unusual', 'watchlist'] as FilterTab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            style={{
              fontSize: 10, fontWeight: 600, letterSpacing: 0.5,
              padding: '4px 10px', borderRadius: 4,
              cursor: 'pointer', textTransform: 'uppercase',
              border: 'none', fontFamily: FONT,
              color: filter === tab ? C.cyan : 'rgba(255,255,255,0.3)',
              background: filter === tab ? C.cyanDim : 'transparent',
              transition: 'all 0.15s',
            }}
          >
            {tab === 'all' ? `All (${counts.all})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Alert List */}
      <div style={{
        flex: 1, overflowY: 'auto',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.1) transparent',
      }}>
        {filtered.length === 0 ? (
          <div style={{
            padding: 40, textAlign: 'center',
            color: 'rgba(255,255,255,0.3)', fontSize: 11,
          }}>
            No alerts in this category
          </div>
        ) : (
          filtered.map(alert => (
            <AlertItem key={alert.id} alert={alert} onClick={() => openDetail(alert)} />
          ))
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px', borderTop: `1px solid ${C.border}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <Link
          href="/alerts"
          onClick={() => setDropdownOpen(false)}
          style={{ fontSize: 11, color: C.cyan, fontWeight: 600, cursor: 'pointer', textDecoration: 'none' }}
        >
          View All Alerts →
        </Link>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          Last scan: 30s ago
        </span>
      </div>
    </div>
  );
}

// ── Alert Item Row ────────────────────────────────────────────

function AlertItem({ alert, onClick }: { alert: Alert; onClick: () => void }) {
  const tier = TIER_COLORS[alert.tier];
  const conf = CONF_COLORS[alert.confidence] || CONF_COLORS.LOW;
  const isUnread = !alert.read;

  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 12, padding: '12px 16px',
        borderBottom: `1px solid ${C.border}`,
        cursor: 'pointer', position: 'relative',
        background: isUnread ? 'rgba(0,229,255,0.03)' : 'transparent',
        transition: 'background 0.15s',
        borderLeft: isUnread ? `3px solid ${C.cyan}` : '3px solid transparent',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
      onMouseLeave={e => (e.currentTarget.style.background = isUnread ? 'rgba(0,229,255,0.03)' : 'transparent')}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 4,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, flexShrink: 0, background: tier.bg,
      }}>
        {alertIcon(alert.type)}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Headline */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '1px 5px',
            borderRadius: 2, background: 'rgba(255,255,255,0.08)',
            color: C.textPrimary,
          }}>
            {alert.ticker}
          </span>
          <span style={{ fontSize: 10, fontWeight: 600, color: C.textSecondary }}>
            {alert.title}
          </span>
          <span style={{
            fontSize: 8, fontWeight: 700, padding: '1px 4px',
            borderRadius: 2, marginLeft: 'auto',
            background: tier.bg, color: tier.color,
          }}>
            {tier.label}
          </span>
        </div>

        {/* Summary */}
        <div style={{
          fontSize: 11, color: C.textSecondary, lineHeight: 1.5,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {alert.summary}
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>
            {timeAgo(alert.timestamp)}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '1px 5px',
            borderRadius: 2, background: 'rgba(255,255,255,0.05)',
            color: C.textSecondary,
          }}>
            @ ${alert.price.toFixed(2)}
          </span>
          <span style={{
            fontSize: 9, fontWeight: 600, padding: '1px 5px',
            borderRadius: 2, background: conf.bg, color: conf.color,
          }}>
            {alert.confidence}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function alertIcon(type: string): string {
  const icons: Record<string, string> = {
    confluence: '🎯', thesis_flip: '⚡', sweep_cluster: '🔥',
    cvd_divergence: '📉', dark_pool_large: '🏦', flow_crossover: '🔀',
    key_level: '📍', rs_regime_change: '💪', news_catalyst: '📰',
  };
  return icons[type] || '🔔';
}

function DropdownBtn({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.55)',
        cursor: 'pointer', padding: '3px 8px', borderRadius: 4,
        border: `1px solid ${C.border}`, background: 'none',
        fontFamily: "'JetBrains Mono', monospace",
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'rgba(255,255,255,0.04)';
        e.currentTarget.style.color = C.textPrimary;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'none';
        e.currentTarget.style.color = 'rgba(255,255,255,0.55)';
      }}
    >
      {children}
    </button>
  );
}
