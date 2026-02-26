'use client';

import { useState, useCallback } from 'react';
import { useAlerts } from './alert-provider';
import { PANEL_COLORS as C } from '@/lib/panel-design-system';
import type { Sensitivity, AlertTypeConfig, DeliveryChannel } from './alert-types';

/* ════════════════════════════════════════════════════════════════
   ALERT SETTINGS MODAL

   Sections:
   1. Watchlist — chip-based ticker management
   2. Alert Types — 9 detectors across 3 tiers with toggles
   3. Sensitivity — LOW / MEDIUM / HIGH slider
   4. Delivery Channels — In-app, Push, SMS, Discord
   5. Schedule — Market hours only toggle
   ════════════════════════════════════════════════════════════════ */

const FONT = "'JetBrains Mono', 'SF Mono', monospace";

const TIER_STYLE: Record<number, { bg: string; color: string; label: string }> = {
  1: { bg: C.greenDim, color: C.green, label: 'TIER 1' },
  2: { bg: C.yellowDim, color: C.yellow, label: 'TIER 2' },
  3: { bg: C.purpleDim, color: C.purple, label: 'TIER 3' },
};

const SENS_CONFIG: Record<Sensitivity, { color: string; bg: string; pct: number }> = {
  LOW:    { color: C.green,  bg: C.greenDim,  pct: 20 },
  MEDIUM: { color: C.yellow, bg: C.yellowDim, pct: 55 },
  HIGH:   { color: C.red,    bg: C.redDim,    pct: 90 },
};

export function AlertSettingsModal() {
  const {
    settingsOpen, setSettingsOpen,
    settings, updateWatchlist, toggleAlertType,
    toggleChannel, setSensitivity, toggleMarketHours,
  } = useAlerts();

  const [tickerInput, setTickerInput] = useState('');
  const [showAddInput, setShowAddInput] = useState(false);

  const addTicker = useCallback(() => {
    const t = tickerInput.trim().toUpperCase();
    if (t && !settings.watchlist.includes(t)) {
      updateWatchlist([...settings.watchlist, t]);
    }
    setTickerInput('');
    setShowAddInput(false);
  }, [tickerInput, settings.watchlist, updateWatchlist]);

  const removeTicker = useCallback((ticker: string) => {
    updateWatchlist(settings.watchlist.filter(t => t !== ticker));
  }, [settings.watchlist, updateWatchlist]);

  if (!settingsOpen) return null;

  const sensConfig = SENS_CONFIG[settings.sensitivity];

  return (
    <>
      {/* Overlay */}
      <div
        onClick={e => { if (e.target === e.currentTarget) setSettingsOpen(false); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT,
        }}
      >
        <div style={{
          width: 560, maxHeight: '80vh', background: '#111827',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12,
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column',
          animation: 'alert-settings-in 0.25s ease',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '20px 24px 16px', borderBottom: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: C.textPrimary }}>
              ⚙ Alert Settings
            </span>
            <button
              onClick={() => setSettingsOpen(false)}
              style={{
                width: 28, height: 28, borderRadius: 4,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: 'rgba(255,255,255,0.3)',
                border: 'none', background: 'none', fontSize: 18,
              }}
            >
              ×
            </button>
          </div>

          {/* Scrollable body */}
          <div style={{
            flex: 1, overflowY: 'auto', padding: '20px 24px',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.1) transparent',
          }}>

            {/* ═══ WATCHLIST ═══ */}
            <Section title="Watchlist">
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {settings.watchlist.map(ticker => (
                  <div key={ticker} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px', borderRadius: 4,
                    background: C.cyanDim,
                    border: `1px solid ${C.cyan}`,
                    fontSize: 11, fontWeight: 600, color: C.cyan,
                  }}>
                    {ticker}
                    <span
                      onClick={() => removeTicker(ticker)}
                      style={{
                        fontSize: 14, color: 'rgba(255,255,255,0.3)',
                        cursor: 'pointer', lineHeight: 1, marginLeft: 2,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.color = C.red)}
                      onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.3)')}
                    >
                      ×
                    </span>
                  </div>
                ))}
                {showAddInput ? (
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input
                      autoFocus
                      value={tickerInput}
                      onChange={e => setTickerInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') addTicker();
                        if (e.key === 'Escape') { setShowAddInput(false); setTickerInput(''); }
                      }}
                      placeholder="TICKER"
                      style={{
                        width: 70, padding: '4px 8px', borderRadius: 4,
                        background: '#1a2235', border: `1px solid ${C.cyan}`,
                        color: C.textPrimary, fontSize: 11, fontWeight: 600,
                        fontFamily: FONT, outline: 'none',
                      }}
                    />
                    <button
                      onClick={addTicker}
                      style={{
                        padding: '4px 8px', borderRadius: 4,
                        background: C.cyanDim, border: `1px solid ${C.cyan}`,
                        color: C.cyan, fontSize: 10, fontWeight: 600,
                        cursor: 'pointer', fontFamily: FONT,
                      }}
                    >
                      Add
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowAddInput(true)}
                    style={{
                      padding: '5px 12px', borderRadius: 4,
                      background: 'none', border: '1px dashed rgba(255,255,255,0.12)',
                      fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)',
                      cursor: 'pointer', fontFamily: FONT, transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = C.cyan;
                      e.currentTarget.style.color = C.cyan;
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = 'rgba(255,255,255,0.12)';
                      e.currentTarget.style.color = 'rgba(255,255,255,0.3)';
                    }}
                  >
                    + Add ticker
                  </button>
                )}
              </div>
            </Section>

            {/* ═══ ALERT TYPES ═══ */}
            <Section title="Alert Types">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {settings.alertTypes.map(at => (
                  <AlertTypeRow key={at.type} config={at} onToggle={() => toggleAlertType(at.type)} />
                ))}
              </div>
            </Section>

            {/* ═══ SENSITIVITY ═══ */}
            <Section title="Sensitivity">
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
                {/* Clickable bar */}
                <div
                  style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    position: 'relative', cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const pct = (e.clientX - rect.left) / rect.width;
                    if (pct < 0.33) setSensitivity('LOW');
                    else if (pct < 0.66) setSensitivity('MEDIUM');
                    else setSensitivity('HIGH');
                  }}
                >
                  {/* Fill */}
                  <div style={{
                    position: 'absolute', top: 0, left: 0, bottom: 0,
                    width: `${sensConfig.pct}%`, borderRadius: 3,
                    background: settings.sensitivity === 'HIGH'
                      ? `linear-gradient(90deg, ${C.green}, ${C.yellow}, ${C.red})`
                      : settings.sensitivity === 'MEDIUM'
                        ? `linear-gradient(90deg, ${C.green}, ${C.yellow})`
                        : C.green,
                    transition: 'width 0.2s',
                  }} />
                  {/* Dot */}
                  <div style={{
                    position: 'absolute', top: -5,
                    left: `calc(${sensConfig.pct}% - 8px)`,
                    width: 16, height: 16, borderRadius: '50%',
                    border: '2px solid #111827',
                    background: sensConfig.color,
                    transition: 'left 0.2s',
                  }} />
                </div>
                {/* Label */}
                <div style={{
                  fontSize: 12, fontWeight: 700, minWidth: 70, textAlign: 'center',
                  padding: '4px 10px', borderRadius: 4,
                  background: sensConfig.bg, color: sensConfig.color,
                }}>
                  {settings.sensitivity}
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                  LOW · Tier 1 only
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                  MEDIUM · Tier 1+2
                </span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', fontWeight: 600 }}>
                  HIGH · All tiers
                </span>
              </div>
            </Section>

            {/* ═══ DELIVERY CHANNELS ═══ */}
            <Section title="Delivery Channels">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {settings.channels.map(ch => (
                  <ChannelRow key={ch.id} channel={ch} onToggle={() => toggleChannel(ch.id)} />
                ))}
              </div>
            </Section>

            {/* ═══ SCHEDULE ═══ */}
            <Section title="Schedule">
              <div style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 14px', borderRadius: 8,
                background: '#1a2235', border: `1px solid ${C.border}`,
              }}>
                <span style={{ fontSize: 14 }}>🕐</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>
                    Market Hours Only
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                    Alerts fire 9:15 AM – 4:15 PM ET only
                  </div>
                </div>
                <Toggle on={settings.marketHoursOnly} onClick={toggleMarketHours} />
              </div>
            </Section>

          </div>
        </div>
      </div>

      <style>{`
        @keyframes alert-settings-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, letterSpacing: 1,
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
        marginBottom: 14,
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function AlertTypeRow({ config, onToggle }: { config: AlertTypeConfig; onToggle: () => void }) {
  const tier = TIER_STYLE[config.tier];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: '#1a2235', border: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 18, flexShrink: 0, width: 28, textAlign: 'center' }}>
        {config.icon}
      </span>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary, marginBottom: 2 }}>
          {config.name}
        </div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
          {config.description}
        </div>
      </div>
      <span style={{
        fontSize: 8, fontWeight: 700, padding: '2px 6px',
        borderRadius: 2, marginLeft: 'auto', flexShrink: 0,
        background: tier.bg, color: tier.color,
      }}>
        {tier.label}
      </span>
      <Toggle on={config.enabled} onClick={onToggle} />
    </div>
  );
}

function ChannelRow({ channel, onToggle }: { channel: DeliveryChannel; onToggle: () => void }) {
  const isAlwaysOn = channel.status === 'always_on';
  const statusBg = channel.status === 'always_on' || channel.status === 'connected'
    ? C.greenDim : C.yellowDim;
  const statusColor = channel.status === 'always_on' || channel.status === 'connected'
    ? C.green : C.yellow;
  const statusLabel = channel.status === 'always_on' ? 'ALWAYS ON'
    : channel.status === 'connected' ? 'CONNECTED' : 'SETUP →';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 8,
      background: '#1a2235', border: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{channel.icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: C.textPrimary }}>
        {channel.name}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 2,
        background: statusBg, color: statusColor,
      }}>
        {statusLabel}
      </span>
      <Toggle
        on={channel.enabled}
        onClick={onToggle}
        disabled={isAlwaysOn}
      />
    </div>
  );
}

function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <div
      onClick={disabled ? undefined : onClick}
      style={{
        width: 36, height: 20, borderRadius: 10,
        background: on ? C.cyanDim : 'rgba(255,255,255,0.1)',
        position: 'relative', cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.2s', flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <div style={{
        position: 'absolute', top: 2,
        left: on ? 18 : 2,
        width: 16, height: 16, borderRadius: '50%',
        background: on ? C.cyan : 'rgba(255,255,255,0.3)',
        transition: 'all 0.2s',
      }} />
    </div>
  );
}
