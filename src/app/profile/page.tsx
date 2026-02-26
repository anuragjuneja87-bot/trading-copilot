'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { PANEL_COLORS as C } from '@/lib/panel-design-system';
import { useWatchlistStore, useUserPreferencesStore } from '@/stores';
import { DEFAULT_ALERT_TYPES, DEFAULT_CHANNELS } from '@/components/ask/alert-types';
import type { Sensitivity, AlertTypeConfig, DeliveryChannel } from '@/components/ask/alert-types';

/* ════════════════════════════════════════════════════════════════
   /profile — User Profile & Settings Page
   
   Sections:
   1. Profile card (name, email, avatar, sign out)
   2. Subscription tier + usage
   3. Watchlist management (add/remove/reorder)
   4. Alert configuration (types, sensitivity, channels, schedule)
   5. Preferences (timeframe, compact mode, sound, analysis depth)
   ════════════════════════════════════════════════════════════════ */

const FONT = "'JetBrains Mono', 'SF Mono', monospace";
const BG = '#0a0e17';
const CARD_BG = '#111827';

const TIER_INFO = {
  FREE: { label: 'FREE', color: '#9ca3af', tickers: 3, questions: '5/day', data: '15-min delayed' },
  PRO: { label: 'PRO', color: '#00e676', tickers: 20, questions: 'Unlimited', data: 'Real-time' },
  ELITE: { label: 'ELITE', color: '#ffc107', tickers: 20, questions: 'Unlimited', data: 'Real-time + SMS' },
};

const TIER_STYLE: Record<number, { bg: string; color: string; label: string }> = {
  1: { bg: C.greenDim, color: C.green, label: 'TIER 1' },
  2: { bg: C.yellowDim, color: C.yellow, label: 'TIER 2' },
  3: { bg: C.purpleDim, color: C.purple, label: 'TIER 3' },
};

const SENS_CONFIG: Record<Sensitivity, { color: string; bg: string; pct: number; desc: string }> = {
  LOW: { color: C.green, bg: C.greenDim, pct: 20, desc: 'Tier 1 only — fewest alerts, highest quality' },
  MEDIUM: { color: C.yellow, bg: C.yellowDim, pct: 55, desc: 'Tier 1 + 2 — balanced signal-to-noise' },
  HIGH: { color: C.red, bg: C.redDim, pct: 90, desc: 'All tiers — most alerts, including watchlist' },
};

export default function ProfilePage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Stores
  const { watchlist, addSymbol, removeSymbol } = useWatchlistStore();
  const prefs = useUserPreferencesStore();

  // Alert settings (loaded from API)
  const [alertTypes, setAlertTypes] = useState<AlertTypeConfig[]>([...DEFAULT_ALERT_TYPES]);
  const [channels, setChannels] = useState<DeliveryChannel[]>([...DEFAULT_CHANNELS]);
  const [sensitivity, setSensitivityState] = useState<Sensitivity>('MEDIUM');
  const [marketHoursOnly, setMarketHoursState] = useState(true);
  const [tickerInput, setTickerInput] = useState('');

  // Load alert settings from DB
  useEffect(() => {
    if (!session?.user) return;
    fetch('/api/alerts/settings')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        if (data.enabledTypes) {
          const enabled = new Set(data.enabledTypes);
          setAlertTypes(prev => prev.map(at => ({ ...at, enabled: enabled.has(at.type) })));
        }
        if (data.sensitivity) setSensitivityState(data.sensitivity);
        if (data.marketHoursOnly !== undefined) setMarketHoursState(data.marketHoursOnly);
      })
      .catch(() => {});
  }, [session]);

  // Persist alert settings helper
  const persistAlertSettings = useCallback((updates: Record<string, any>) => {
    fetch('/api/alerts/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    }).catch(() => {});
  }, []);

  const toggleAlertType = useCallback((type: string) => {
    setAlertTypes(prev => {
      const updated = prev.map(at => at.type === type ? { ...at, enabled: !at.enabled } : at);
      persistAlertSettings({ enabledTypes: updated.filter(at => at.enabled).map(at => at.type) });
      return updated;
    });
  }, [persistAlertSettings]);

  const setSensitivity = useCallback((s: Sensitivity) => {
    setSensitivityState(s);
    persistAlertSettings({ sensitivity: s });
  }, [persistAlertSettings]);

  const toggleMarketHours = useCallback(() => {
    setMarketHoursState(prev => {
      persistAlertSettings({ marketHoursOnly: !prev });
      return !prev;
    });
  }, [persistAlertSettings]);

  // Watchlist actions
  const handleAddTicker = useCallback(() => {
    const t = tickerInput.trim().toUpperCase();
    if (t && /^[A-Z]{1,5}$/.test(t)) {
      addSymbol(t);
      setTickerInput('');
    }
  }, [tickerInput, addSymbol]);

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
        <div style={{ color: 'rgba(255,255,255,0.5)', fontFamily: FONT, fontSize: 14 }}>Sign in to view your profile</div>
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

  const currentTier = TIER_INFO.PRO; // TODO: read from session/DB

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
        <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: 0.5 }}>👤 Profile & Settings</div>
      </div>

      {/* ── Content ─────────────────────────────────────── */}
      <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 24px 60px' }}>

        {/* ═══ 1. PROFILE CARD ═══ */}
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            {session.user?.image ? (
              <img
                src={session.user.image}
                alt=""
                style={{ width: 56, height: 56, borderRadius: '50%', border: `2px solid ${C.cyan}` }}
                referrerPolicy="no-referrer"
              />
            ) : (
              <div style={{
                width: 56, height: 56, borderRadius: '50%',
                background: 'rgba(0,230,118,0.2)', border: `2px solid ${C.cyan}`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, fontWeight: 700, color: C.cyan,
              }}>
                {(session.user?.name || '?')[0].toUpperCase()}
              </div>
            )}
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{session.user?.name || 'Trader'}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{session.user?.email}</div>
            </div>
            <button
              onClick={() => signOut({ callbackUrl: '/ask' })}
              style={{
                padding: '6px 16px', borderRadius: 6,
                background: 'rgba(255,82,82,0.1)', border: '1px solid rgba(255,82,82,0.25)',
                color: '#ff5252', fontSize: 11, fontWeight: 600, fontFamily: FONT, cursor: 'pointer',
              }}
            >
              Sign Out
            </button>
          </div>
        </SectionCard>

        {/* ═══ 2. SUBSCRIPTION ═══ */}
        <SectionTitle>Subscription</SectionTitle>
        <SectionCard>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{
              fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 4,
              background: `${currentTier.color}18`, color: currentTier.color,
              letterSpacing: 1,
            }}>
              {currentTier.label}
            </span>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
              Active subscription
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <InfoBox label="Watchlist" value={`${watchlist.length}/${currentTier.tickers}`} />
            <InfoBox label="AI Questions" value={currentTier.questions} />
            <InfoBox label="Data Feed" value={currentTier.data} />
          </div>
        </SectionCard>

        {/* ═══ 3. WATCHLIST ═══ */}
        <SectionTitle>Watchlist ({watchlist.length}/20)</SectionTitle>
        <SectionCard>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {watchlist.map((ticker, i) => (
              <div key={ticker} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 12px', borderRadius: 6,
                background: C.cyanDim, border: `1px solid rgba(0,229,255,0.25)`,
                fontSize: 12, fontWeight: 600, color: C.cyan,
              }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginRight: 2 }}>
                  {i + 1}
                </span>
                {ticker}
                <button
                  onClick={() => removeSymbol(ticker)}
                  style={{
                    background: 'none', border: 'none', color: 'rgba(255,255,255,0.2)',
                    cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0, marginLeft: 2,
                  }}
                  onMouseEnter={e => e.currentTarget.style.color = C.red}
                  onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.2)'}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              value={tickerInput}
              onChange={e => setTickerInput(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleAddTicker()}
              placeholder="Add ticker..."
              style={{
                flex: 1, padding: '8px 12px', borderRadius: 6,
                background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.border}`,
                color: C.textPrimary, fontSize: 12, fontFamily: FONT, outline: 'none',
              }}
            />
            <button
              onClick={handleAddTicker}
              style={{
                padding: '8px 20px', borderRadius: 6,
                background: C.cyanDim, border: `1px solid ${C.cyan}`,
                color: C.cyan, fontSize: 11, fontWeight: 600,
                fontFamily: FONT, cursor: 'pointer',
              }}
            >
              + Add
            </button>
          </div>
        </SectionCard>

        {/* ═══ 4. ALERT CONFIGURATION ═══ */}
        <SectionTitle>Alert Configuration</SectionTitle>

        {/* Sensitivity */}
        <SectionCard>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', marginBottom: 14,
          }}>
            Sensitivity
          </div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            {(['LOW', 'MEDIUM', 'HIGH'] as Sensitivity[]).map(s => {
              const cfg = SENS_CONFIG[s];
              const active = sensitivity === s;
              return (
                <button
                  key={s}
                  onClick={() => setSensitivity(s)}
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 6,
                    background: active ? cfg.bg : 'rgba(255,255,255,0.03)',
                    border: active ? `1px solid ${cfg.color}` : `1px solid ${C.border}`,
                    color: active ? cfg.color : 'rgba(255,255,255,0.35)',
                    fontSize: 12, fontWeight: 700, fontFamily: FONT, cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {s}
                </button>
              );
            })}
          </div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
            {SENS_CONFIG[sensitivity].desc}
          </div>
        </SectionCard>

        {/* Alert Types */}
        <SectionCard>
          <div style={{
            fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)', marginBottom: 14,
          }}>
            Alert Types
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alertTypes.map(at => {
              const tier = TIER_STYLE[at.tier];
              return (
                <div key={at.type} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 14px', borderRadius: 6,
                  background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
                }}>
                  <span style={{ fontSize: 16, width: 24, textAlign: 'center' }}>{at.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>{at.name}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{at.description}</div>
                  </div>
                  <span style={{
                    fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 2,
                    background: tier.bg, color: tier.color,
                  }}>
                    {tier.label}
                  </span>
                  <Toggle on={at.enabled} onClick={() => toggleAlertType(at.type)} />
                </div>
              );
            })}
          </div>
        </SectionCard>

        {/* Schedule */}
        <SectionCard>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '12px 14px', borderRadius: 6,
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
          }}>
            <span style={{ fontSize: 16 }}>🕐</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>Market Hours Only</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                Alerts fire 9:15 AM – 4:15 PM ET only
              </div>
            </div>
            <Toggle on={marketHoursOnly} onClick={toggleMarketHours} />
          </div>
        </SectionCard>

        {/* ═══ 5. PREFERENCES ═══ */}
        <SectionTitle>Display Preferences</SectionTitle>
        <SectionCard>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <PrefRow
              label="Default Timeframe"
              value={prefs.defaultTimeframe}
              options={['1D', '1W', '1M', '3M']}
              onChange={(v) => prefs.setPreference('defaultTimeframe', v as any)}
            />
            <PrefToggle label="Compact Mode" desc="Denser panel layout" on={prefs.compactMode}
              onClick={() => prefs.setPreference('compactMode', !prefs.compactMode)} />
            <PrefToggle label="Show Tooltips" desc="Hover hints on panels" on={prefs.showTooltips}
              onClick={() => prefs.setPreference('showTooltips', !prefs.showTooltips)} />
            <PrefToggle label="Sound Effects" desc="Play sounds on alerts" on={prefs.soundEnabled}
              onClick={() => prefs.setPreference('soundEnabled', !prefs.soundEnabled)} />
          </div>
        </SectionCard>

      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase',
      color: 'rgba(255,255,255,0.3)', margin: '28px 0 10px', paddingLeft: 2,
    }}>
      {children}
    </div>
  );
}

function SectionCard({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: CARD_BG, borderRadius: 10,
      border: `1px solid rgba(255,255,255,0.08)`,
      padding: '20px 24px', marginBottom: 8,
    }}>
      {children}
    </div>
  );
}

function InfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 6, textAlign: 'center',
      background: 'rgba(255,255,255,0.03)', border: `1px solid ${C.border}`,
    }}>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.textPrimary }}>{value}</div>
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

function PrefRow({ label, value, options, onChange }: {
  label: string; value: string; options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 6,
      background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
    }}>
      <span style={{ fontSize: 12, fontWeight: 600, flex: 1, color: C.textPrimary }}>{label}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        {options.map(opt => (
          <button
            key={opt}
            onClick={() => onChange(opt)}
            style={{
              padding: '3px 8px', borderRadius: 4, border: 'none',
              fontSize: 10, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer',
              color: value === opt ? C.cyan : 'rgba(255,255,255,0.3)',
              background: value === opt ? C.cyanDim : 'rgba(255,255,255,0.04)',
            }}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

function PrefToggle({ label, desc, on, onClick }: {
  label: string; desc: string; on: boolean; onClick: () => void;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 14px', borderRadius: 6,
      background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.textPrimary }}>{label}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{desc}</div>
      </div>
      <Toggle on={on} onClick={onClick} />
    </div>
  );
}
