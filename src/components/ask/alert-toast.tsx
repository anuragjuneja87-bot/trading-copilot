'use client';

import { useEffect, useRef } from 'react';
import { useAlerts } from './alert-provider';
import { PANEL_COLORS as C } from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   ALERT TOAST — Real-time notification popup

   Slides in from the right when a new alert fires.
   Auto-dismisses after 8 seconds with a shrinking timer bar.
   Click to open the alert detail modal.
   ════════════════════════════════════════════════════════════════ */

export function AlertToast() {
  const { toastAlert, dismissToast, openDetail } = useAlerts();
  const timerRef = useRef<HTMLDivElement>(null);

  // Reset timer animation when new toast appears
  useEffect(() => {
    if (toastAlert && timerRef.current) {
      timerRef.current.style.animation = 'none';
      // Force reflow
      void timerRef.current.offsetHeight;
      timerRef.current.style.animation = 'alert-timer-shrink 8s linear forwards';
    }
  }, [toastAlert]);

  if (!toastAlert) return null;

  const isBullish = toastAlert.bias === 'bullish';
  const accentColor = isBullish ? C.green : toastAlert.bias === 'bearish' ? C.red : C.yellow;

  return (
    <>
      <div
        style={{
          position: 'fixed', top: 60, right: 20, zIndex: 400,
          width: 380, background: '#1a2235',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 8,
          boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          animation: 'alert-toast-in 0.3s ease',
          fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
          cursor: 'pointer',
        }}
        onClick={() => {
          dismissToast();
          openDetail(toastAlert);
        }}
      >
        {/* Accent bar */}
        <div style={{
          height: 3, width: '100%',
          background: `linear-gradient(90deg, ${accentColor}, transparent)`,
        }} />

        {/* Close button */}
        <button
          onClick={e => { e.stopPropagation(); dismissToast(); }}
          style={{
            position: 'absolute', top: 10, right: 10,
            fontSize: 14, color: 'rgba(255,255,255,0.3)',
            cursor: 'pointer', background: 'none', border: 'none',
            padding: 4, lineHeight: 1,
          }}
        >
          ×
        </button>

        {/* Body */}
        <div style={{ display: 'flex', gap: 12, padding: '14px 16px' }}>
          <div style={{ fontSize: 20, flexShrink: 0 }}>
            {toastAlert.type === 'confluence' ? '🎯' :
             toastAlert.type === 'sweep_cluster' ? '🔥' :
             toastAlert.type === 'thesis_flip' ? '⚡' :
             toastAlert.type === 'cvd_divergence' ? '📉' :
             toastAlert.type === 'dark_pool_large' ? '🏦' : '🔔'}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 12, fontWeight: 700, marginBottom: 3,
              color: C.textPrimary,
            }}>
              {toastAlert.ticker} — {toastAlert.title}
            </div>
            <div style={{
              fontSize: 11, color: C.textSecondary, lineHeight: 1.5,
            }}>
              {toastAlert.summary}
            </div>
          </div>
        </div>

        {/* Timer bar */}
        <div style={{ height: 2, background: 'rgba(255,255,255,0.1)' }}>
          <div
            ref={timerRef}
            style={{
              height: '100%', background: C.cyan,
              animation: 'alert-timer-shrink 8s linear forwards',
            }}
          />
        </div>
      </div>

      <style>{`
        @keyframes alert-toast-in {
          from { opacity: 0; transform: translateX(40px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes alert-timer-shrink {
          from { width: 100%; }
          to { width: 0%; }
        }
      `}</style>
    </>
  );
}
