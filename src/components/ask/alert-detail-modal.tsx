'use client';

import { useAlerts } from './alert-provider';
import { PANEL_COLORS as C } from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   ALERT DETAIL MODAL

   Expanded view when user clicks any alert. Shows:
   - Ticker + bias badge
   - Full summary
   - Contributing signal pills (maps to 6 panels)
   - Trade levels grid: Entry / Target / Stop
   - Reward:Risk ratio bar
   - Actions: Dismiss, Snooze, Open Ticker
   ════════════════════════════════════════════════════════════════ */

const FONT = "'JetBrains Mono', 'SF Mono', monospace";

export function AlertDetailModal() {
  const { detailAlert, closeDetail, dismissAlert, onTickerClick } = useAlerts();

  if (!detailAlert) return null;

  const a = detailAlert;
  const isBullish = a.bias === 'bullish';
  const isBearish = a.bias === 'bearish';

  // R:R calculation
  const rrRatio = a.target1 && a.stop && a.price
    ? Math.abs(a.target1 - a.price) / Math.abs(a.price - a.stop)
    : null;
  const rrPct = rrRatio ? Math.min(rrRatio / 3 * 100, 100) : 50; // scale 0-3 → 0-100%

  const ts = new Date(a.timestamp);
  const timeStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    + ' · ' + ts.toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit',
      timeZone: 'America/New_York',
    }) + ' ET';

  return (
    <>
      {/* Overlay */}
      <div
        onClick={e => { if (e.target === e.currentTarget) closeDetail(); }}
        style={{
          position: 'fixed', inset: 0, zIndex: 250,
          background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: FONT,
        }}
      >
        {/* Panel */}
        <div style={{
          width: 480, background: '#111827',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
          animation: 'alert-detail-in 0.2s ease',
        }}>
          {/* Header */}
          <div style={{
            padding: '20px 24px 14px',
            borderBottom: `1px solid ${C.border}`,
          }}>
            {/* Top row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{
                fontSize: 16, fontWeight: 700, padding: '3px 10px',
                borderRadius: 4, background: 'rgba(255,255,255,0.08)',
                color: C.textPrimary,
              }}>
                {a.ticker}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.textSecondary }}>
                {a.title}
              </span>
              <span style={{
                marginLeft: 'auto', fontSize: 12, fontWeight: 700,
                padding: '3px 10px', borderRadius: 4,
                background: isBullish ? C.greenDim : isBearish ? C.redDim : C.yellowDim,
                color: isBullish ? C.green : isBearish ? C.red : C.yellow,
              }}>
                {isBullish ? '▲' : isBearish ? '▼' : '◆'} {a.bias.toUpperCase()}
              </span>
            </div>

            {/* Timestamp */}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 6 }}>
              {timeStr} · @ ${a.price.toFixed(2)}
            </div>

            {/* Summary */}
            <div style={{ fontSize: 12, color: C.textSecondary, lineHeight: 1.6, marginTop: 8 }}>
              {a.summary}
            </div>
          </div>

          {/* Body */}
          <div style={{ padding: '18px 24px' }}>
            {/* Contributing Signals */}
            {a.signals.length > 0 && (
              <>
                <SectionTitle>Contributing Signals</SectionTitle>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
                  {a.signals.map((s, i) => {
                    const pillBg = s.status === 'bullish' ? C.greenDim
                      : s.status === 'bearish' ? C.redDim
                      : 'rgba(255,255,255,0.06)';
                    const pillColor = s.status === 'bullish' ? C.green
                      : s.status === 'bearish' ? C.red
                      : C.textSecondary;
                    return (
                      <span key={i} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 5,
                        padding: '4px 10px', borderRadius: 12,
                        fontSize: 10, fontWeight: 600,
                        background: pillBg, color: pillColor,
                      }}>
                        {s.status === 'bullish' ? '✓' : s.status === 'bearish' ? '✗' : '○'}{' '}
                        {s.panel} — {s.detail}
                      </span>
                    );
                  })}
                </div>
              </>
            )}

            {/* Trade Levels */}
            {(a.target1 || a.stop) && (
              <>
                <SectionTitle>Trade Levels</SectionTitle>
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 1fr',
                  gap: 8, marginBottom: 18,
                }}>
                  <LevelCard label="Entry" value={`$${a.price.toFixed(2)}`} sub="Current price" color={C.textPrimary} />
                  {a.target1 && (
                    <LevelCard
                      label="Target 1"
                      value={`$${a.target1.toFixed(2)}`}
                      sub={`${((a.target1 - a.price) / a.price * 100).toFixed(1)}%`}
                      color={isBullish ? C.green : C.red}
                    />
                  )}
                  {a.stop && (
                    <LevelCard
                      label="Stop"
                      value={`$${a.stop.toFixed(2)}`}
                      sub={`${((a.stop - a.price) / a.price * 100).toFixed(1)}%`}
                      color={C.red}
                    />
                  )}
                </div>
              </>
            )}

            {/* R:R Bar */}
            {rrRatio !== null && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.015)',
                border: `1px solid ${C.border}`,
              }}>
                <span style={{
                  fontSize: 9, fontWeight: 700, letterSpacing: 0.5,
                  color: 'rgba(255,255,255,0.3)',
                }}>R:R</span>
                <div style={{
                  flex: 1, height: 6, borderRadius: 3,
                  background: 'rgba(255,255,255,0.06)',
                  position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', top: 0, bottom: 0, left: 0,
                    width: `${rrPct}%`, borderRadius: 3,
                    background: `linear-gradient(90deg, ${C.green}, rgba(0,220,130,0.3))`,
                  }} />
                </div>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: rrRatio >= 2 ? C.green : rrRatio >= 1.5 ? C.yellow : C.red,
                }}>
                  {rrRatio.toFixed(1)} : 1
                </span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{
            display: 'flex', gap: 8, padding: '14px 24px',
            borderTop: `1px solid ${C.border}`,
          }}>
            <ActionBtn onClick={() => { dismissAlert(a.id); closeDetail(); }}>
              Dismiss
            </ActionBtn>
            <ActionBtn onClick={closeDetail}>
              Snooze 15m
            </ActionBtn>
            <ActionBtn
              primary
              onClick={() => {
                closeDetail();
                onTickerClick?.(a.ticker);
              }}
            >
              Open {a.ticker} →
            </ActionBtn>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes alert-detail-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}

// ── Sub-components ────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: 1,
      textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
      marginBottom: 10,
    }}>
      {children}
    </div>
  );
}

function LevelCard({ label, value, sub, color }: {
  label: string; value: string; sub: string; color: string;
}) {
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 8,
      background: 'rgba(255,255,255,0.015)',
      border: `1px solid ${C.border}`,
    }}>
      <div style={{
        fontSize: 8, fontWeight: 600, letterSpacing: 0.5,
        textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
        marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, color }}>{value}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}

function ActionBtn({ children, onClick, primary }: {
  children: React.ReactNode; onClick: () => void; primary?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: 8, borderRadius: 8,
        fontSize: 11, fontWeight: 600, cursor: 'pointer',
        fontFamily: FONT, transition: 'all 0.15s',
        border: `1px solid ${primary ? 'rgba(0,229,255,0.3)' : C.border}`,
        background: primary ? C.cyanDim : 'none',
        color: primary ? C.cyan : C.textSecondary,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = primary ? 'rgba(0,229,255,0.2)' : 'rgba(255,255,255,0.04)';
        if (!primary) e.currentTarget.style.color = C.textPrimary;
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = primary ? C.cyanDim : 'none';
        if (!primary) e.currentTarget.style.color = C.textSecondary;
      }}
    >
      {children}
    </button>
  );
}
