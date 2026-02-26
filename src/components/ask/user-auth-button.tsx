'use client';

import React, { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useSession, signIn, signOut } from 'next-auth/react';

/* ════════════════════════════════════════════════════════════════
   USER AUTH BUTTON — Sign in / avatar dropdown for header bar
   
   States:
   - Not signed in → "Sign In" button
   - Signed in → Avatar circle with dropdown (name, email, sign out)
   
   Placement: top header bar, after AlertBell
   ════════════════════════════════════════════════════════════════ */

export function UserAuthButton() {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (status === 'loading') {
    return (
      <div style={{
        width: 28, height: 28, borderRadius: '50%',
        background: 'rgba(255,255,255,0.08)',
        animation: 'auth-pulse 1.5s ease infinite',
      }} />
    );
  }

  // ── Not signed in ──────────────────────────────────────────
  if (!session) {
    return (
      <>
        <button
          onClick={() => signIn('google')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 6,
            background: 'rgba(0,230,118,0.12)',
            border: '1px solid rgba(0,230,118,0.25)',
            color: '#00e676', fontSize: 11, fontWeight: 600,
            fontFamily: "'JetBrains Mono', monospace",
            cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(0,230,118,0.2)';
            e.currentTarget.style.borderColor = 'rgba(0,230,118,0.4)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(0,230,118,0.12)';
            e.currentTarget.style.borderColor = 'rgba(0,230,118,0.25)';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
            <polyline points="10 17 15 12 10 7" />
            <line x1="15" y1="12" x2="3" y2="12" />
          </svg>
          Sign In
        </button>
        <style>{`@keyframes auth-pulse { 0%,100%{opacity:.5} 50%{opacity:.2} }`}</style>
      </>
    );
  }

  // ── Signed in — avatar + dropdown ──────────────────────────
  const initial = (session.user?.name || session.user?.email || '?')[0].toUpperCase();
  const img = session.user?.image;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: 28, height: 28, borderRadius: '50%', overflow: 'hidden',
          border: open ? '2px solid #00e676' : '2px solid rgba(255,255,255,0.15)',
          cursor: 'pointer',
          background: img ? 'transparent' : 'rgba(0,230,118,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'border-color 0.15s', padding: 0,
        }}
        aria-label="User menu"
      >
        {img ? (
          <img src={img} alt="" width={28} height={28}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            referrerPolicy="no-referrer" />
        ) : (
          <span style={{ color: '#00e676', fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>
            {initial}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 240, background: '#1a1f2e', borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          zIndex: 1000, overflow: 'hidden',
          animation: 'auth-dropdown-in 0.15s ease',
        }}>
          {/* User info */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{
              fontSize: 13, fontWeight: 600, color: '#fff',
              fontFamily: "'JetBrains Mono', monospace",
              marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {session.user?.name || 'Trader'}
            </div>
            <div style={{
              fontSize: 11, color: 'rgba(255,255,255,0.45)',
              fontFamily: "'JetBrains Mono', monospace",
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {session.user?.email}
            </div>
          </div>

          {/* Tier badge */}
          <div style={{ padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                background: 'rgba(0,230,118,0.12)', color: '#00e676',
                fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5,
              }}>PRO</span>
              <span style={{
                fontSize: 10, color: 'rgba(255,255,255,0.35)',
                fontFamily: "'JetBrains Mono', monospace",
              }}>Real-time data</span>
            </div>
          </div>

          {/* Profile & Settings */}
          <Link
            href="/profile"
            onClick={() => setOpen(false)}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'transparent', border: 'none',
              color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.1s', textDecoration: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Profile & Settings
          </Link>

          {/* Sign out */}
          <button
            onClick={() => { setOpen(false); signOut({ callbackUrl: '/ask' }); }}
            style={{
              width: '100%', padding: '12px 16px',
              background: 'transparent', border: 'none',
              color: '#ff5252', fontSize: 12, fontWeight: 600,
              fontFamily: "'JetBrains Mono', monospace",
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 8,
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,82,82,0.08)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Sign Out
          </button>
        </div>
      )}

      <style>{`
        @keyframes auth-pulse { 0%,100%{opacity:.5} 50%{opacity:.2} }
        @keyframes auth-dropdown-in { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  );
}
