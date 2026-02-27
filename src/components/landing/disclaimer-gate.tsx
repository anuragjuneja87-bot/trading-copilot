'use client';

import { useState } from 'react';
import { AlertTriangle, Shield, Check, ExternalLink } from 'lucide-react';
import Link from 'next/link';

/* ════════════════════════════════════════════════════════════════
   DISCLAIMER GATE
   
   Two usage modes:
   
   A) LANDING PAGE (pre-auth): 
      Shows before sign-in. After accepting → onAccept fires → 
      landing page triggers Google sign-in with callbackUrl=/ask?da=1
      
   B) /ASK PAGE (post-auth fallback):
      If user somehow reaches /ask without having accepted,
      this modal blocks until they accept → saves to DB → loads War Room.
   
   User must check 4 acknowledgment boxes to unlock the accept button.
   ════════════════════════════════════════════════════════════════ */

interface DisclaimerGateProps {
  onAccept: () => void;
  onClose?: () => void;           // Optional — allows dismissing on landing page
  saveToDb?: boolean;              // If true, POSTs to /api/user/disclaimer (for /ask usage)
}

const CHECKBOXES = [
  { id: 'not_advice', text: 'I understand that TradeYodha is NOT a registered investment advisor and does not provide financial, investment, or trading advice.' },
  { id: 'ai_mistakes', text: 'I understand that AI models, machine learning predictions, and automated analysis can and will make mistakes. Past performance does not guarantee future results.' },
  { id: 'risk_loss', text: 'I understand that trading involves substantial risk of loss. I may lose some or all of my invested capital. I will only trade with money I can afford to lose.' },
  { id: 'own_decisions', text: 'I accept full responsibility for my own trading decisions and their financial consequences. TradeYodha is not liable for any losses I incur.' },
];

export function DisclaimerGate({ onAccept, onClose, saveToDb = false }: DisclaimerGateProps) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  const allChecked = CHECKBOXES.every(cb => checked.has(cb.id));

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleAccept = async () => {
    if (!allChecked || submitting) return;
    setSubmitting(true);

    if (saveToDb) {
      try {
        await fetch('/api/user/disclaimer', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ accepted: true }),
        });
      } catch {
        // Continue anyway — we'll retry on next load
      }
    }

    onAccept();
    setSubmitting(false);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
    }}>
      <div style={{
        width: '100%', maxWidth: 640, maxHeight: '90vh',
        background: '#0d1117', borderRadius: 16,
        border: '1px solid rgba(255,193,7,0.2)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 60px rgba(255,193,7,0.05)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 28px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 12, background: 'rgba(255,193,7,0.12)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <AlertTriangle style={{ width: 24, height: 24, color: '#ffc107' }} />
          </div>
          <div style={{ flex: 1 }}>
            <h2 style={{
              fontSize: 20, fontWeight: 800, color: '#ffc107', margin: 0,
              fontFamily: "'Oxanium', 'JetBrains Mono', monospace",
            }}>
              Risk Disclosure & Disclaimer
            </h2>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: '4px 0 0' }}>
              Please read carefully before entering the War Room
            </p>
          </div>
          {onClose && (
            <button onClick={onClose} style={{
              width: 32, height: 32, borderRadius: 6, border: 'none',
              background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.3)',
              cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>×</button>
          )}
        </div>

        {/* Scrollable content */}
        <div style={{
          flex: 1, overflowY: 'auto', padding: '24px 28px',
          scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
        }}>
          {/* Full disclosure text */}
          <div style={{
            padding: '20px 24px', borderRadius: 12,
            background: 'rgba(255,193,7,0.04)', border: '1px solid rgba(255,193,7,0.1)',
            marginBottom: 24,
          }}>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>
              <p style={{ marginBottom: 16 }}>
                <strong style={{ color: '#ffc107' }}>TradeYodha</strong> is a software platform that provides AI-powered market analysis tools. It is <strong style={{ color: 'rgba(255,255,255,0.85)' }}>NOT a registered investment advisor, broker-dealer, or financial planner</strong>. No content on this platform constitutes a solicitation, recommendation, endorsement, or offer to buy or sell any securities or other financial instruments.
              </p>
              <p style={{ marginBottom: 16 }}>
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>AI & Machine Learning Limitations:</strong> The analysis, predictions, thesis statements, confluence signals, and trade levels generated by TradeYodha are produced by artificial intelligence and machine learning models. These models are probabilistic tools that <strong style={{ color: '#ff5252' }}>can and will make errors</strong>. Our ML model has an approximately 59% win rate — meaning it is <strong style={{ color: '#ff5252' }}>wrong roughly 40% of the time</strong>.
              </p>
              <p style={{ marginBottom: 16 }}>
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Data Accuracy:</strong> Real-time market data, options flow, dark pool prints, gamma levels, and other information may contain errors, delays, or inaccuracies. Data is sourced from third-party providers and may not reflect the most current market conditions.
              </p>
              <p style={{ marginBottom: 16 }}>
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Trading Risk:</strong> Trading securities, options, and other financial instruments involves <strong style={{ color: '#ff5252' }}>substantial risk of loss</strong> and is not suitable for all investors. You may lose some or all of your invested capital. Past performance does not guarantee future results.
              </p>
              <p style={{ marginBottom: 0 }}>
                <strong style={{ color: 'rgba(255,255,255,0.85)' }}>Your Responsibility:</strong> If you choose to execute trades based on information from TradeYodha, you do so <strong style={{ color: 'rgba(255,255,255,0.85)' }}>entirely at your own risk</strong>. You are solely responsible for your trading decisions and their financial consequences. Always consult with a qualified financial advisor before making investment decisions.
              </p>
            </div>
          </div>

          {/* Checkboxes */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 14 }}>
              I acknowledge and accept:
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {CHECKBOXES.map(cb => {
                const isChecked = checked.has(cb.id);
                return (
                  <label key={cb.id} onClick={() => toggle(cb.id)} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                    background: isChecked ? 'rgba(0,230,118,0.04)' : 'rgba(255,255,255,0.02)',
                    border: `1px solid ${isChecked ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    transition: 'all 0.2s',
                  }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 4, flexShrink: 0, marginTop: 1,
                      background: isChecked ? 'rgba(0,230,118,0.2)' : 'rgba(255,255,255,0.06)',
                      border: `1.5px solid ${isChecked ? '#00e676' : 'rgba(255,255,255,0.15)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'all 0.2s',
                    }}>
                      {isChecked && <Check style={{ width: 14, height: 14, color: '#00e676' }} />}
                    </div>
                    <span style={{
                      fontSize: 12, color: isChecked ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.45)',
                      lineHeight: 1.6, transition: 'color 0.2s',
                    }}>
                      {cb.text}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Legal links */}
          <div style={{ display: 'flex', gap: 16, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <Link href="/terms" target="_blank" style={{ fontSize: 11, color: 'rgba(0,229,255,0.7)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
              Terms of Service <ExternalLink style={{ width: 10, height: 10 }} />
            </Link>
            <Link href="/privacy" target="_blank" style={{ fontSize: 11, color: 'rgba(0,229,255,0.7)', display: 'flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}>
              Privacy Policy <ExternalLink style={{ width: 10, height: 10 }} />
            </Link>
          </div>
        </div>

        {/* Footer with accept button */}
        <div style={{ padding: '20px 28px', borderTop: '1px solid rgba(255,255,255,0.06)', background: 'rgba(0,0,0,0.2)' }}>
          <button onClick={handleAccept} disabled={!allChecked || submitting}
            style={{
              width: '100%', padding: '14px 24px', borderRadius: 10,
              border: 'none', cursor: allChecked ? 'pointer' : 'not-allowed',
              fontSize: 14, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              background: allChecked ? 'linear-gradient(135deg, #00e5ff 0%, #00b8d4 100%)' : 'rgba(255,255,255,0.06)',
              color: allChecked ? '#060810' : 'rgba(255,255,255,0.2)',
              transition: 'all 0.3s', transform: allChecked ? 'scale(1)' : 'scale(0.98)',
            }}>
            <Shield style={{ width: 18, height: 18 }} />
            {submitting
              ? 'Saving...'
              : allChecked
                ? (saveToDb ? 'I Accept — Enter the War Room' : 'I Accept — Continue to Sign In')
                : 'Check all boxes to continue'}
          </button>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', textAlign: 'center', marginTop: 10, lineHeight: 1.5 }}>
            By clicking &quot;I Accept&quot; you confirm you have read and agree to the risk disclosure above,
            our Terms of Service, and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
