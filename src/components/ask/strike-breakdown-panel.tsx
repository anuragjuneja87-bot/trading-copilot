'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
import type { EnhancedOptionTrade } from '@/types/flow';
import {
  PANEL_COLORS as C, FONT_MONO, fmtDollar,
  setupCanvas, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   STRIKE BREAKDOWN PANEL v1.0

   Extracted from Options Flow Panel.
   Shows premium distribution by strike price as horizontal bars.
   Call premium (green) stacked with Put premium (red).
   
   Top 8 strikes by total premium, sorted descending.
   ════════════════════════════════════════════════════════════════ */

interface StrikeBreakdownPanelProps {
  ticker: string;
  trades: EnhancedOptionTrade[];
  loading?: boolean;
  error?: string | null;
}

export function StrikeBreakdownPanel({
  ticker, trades, loading, error,
}: StrikeBreakdownPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Strike breakdown computation ── */
  const strikeBreakdown = useMemo(() => {
    if (!trades.length) return [];
    const byStrike: Record<string, { callPrem: number; putPrem: number; count: number }> = {};
    trades.forEach(t => {
      const key = `$${t.strike}`;
      if (!byStrike[key]) byStrike[key] = { callPrem: 0, putPrem: 0, count: 0 };
      if (t.callPut === 'C') byStrike[key].callPrem += t.premium || 0;
      else byStrike[key].putPrem += t.premium || 0;
      byStrike[key].count++;
    });
    return Object.entries(byStrike)
      .map(([strike, data]) => ({ strike, ...data, total: data.callPrem + data.putPrem }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [trades]);

  /* ── Summary stats ── */
  const summary = useMemo(() => {
    if (!strikeBreakdown.length) return null;
    const totalCall = strikeBreakdown.reduce((s, b) => s + b.callPrem, 0);
    const totalPut = strikeBreakdown.reduce((s, b) => s + b.putPrem, 0);
    const total = totalCall + totalPut;
    const topStrike = strikeBreakdown[0];
    const callPct = total > 0 ? Math.round((totalCall / total) * 100) : 50;
    return { totalCall, totalPut, total, topStrike, callPct, strikeCount: strikeBreakdown.length };
  }, [strikeBreakdown]);

  /* ── Draw bar chart ── */
  const drawBarChart = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container || !strikeBreakdown.length) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 10, right: 60, bottom: 10, left: 58 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const N = strikeBreakdown.length;
    const maxPrem = Math.max(...strikeBreakdown.map(s => s.total), 1);
    const barH = Math.min(Math.floor(cH / N) - 5, 24);
    const gapY = (cH - barH * N) / (N + 1);

    strikeBreakdown.forEach((s, i) => {
      const y = PAD.top + gapY + i * (barH + gapY);
      const totalW = (s.total / maxPrem) * cW * 0.85;
      const callW = s.total > 0 ? (s.callPrem / s.total) * totalW : 0;
      const putW = totalW - callW;

      // Call bar (green)
      if (callW > 0) {
        const g = ctx.createLinearGradient(PAD.left, 0, PAD.left + callW, 0);
        g.addColorStop(0, 'rgba(0,220,130,0.2)'); g.addColorStop(1, 'rgba(0,220,130,0.5)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(PAD.left, y, callW, barH, 3); ctx.fill();
      }
      // Put bar (red)
      if (putW > 0) {
        const g = ctx.createLinearGradient(PAD.left + callW, 0, PAD.left + callW + putW, 0);
        g.addColorStop(0, 'rgba(255,71,87,0.2)'); g.addColorStop(1, 'rgba(255,71,87,0.5)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(PAD.left + callW, y, putW, barH, 3); ctx.fill();
      }

      // Strike label (left)
      ctx.fillStyle = C.textSecondary; ctx.font = `600 11px ${FONT_MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(s.strike, PAD.left - 8, y + barH / 2 + 4);

      // Premium label (right)
      ctx.fillStyle = C.textMuted; ctx.font = `500 10px ${FONT_MONO}`;
      ctx.textAlign = 'left';
      const premLabel = s.total >= 1e6 ? `$${(s.total / 1e6).toFixed(1)}M` : `$${(s.total / 1e3).toFixed(0)}K`;
      ctx.fillText(premLabel, PAD.left + totalW + 8, y + barH / 2 + 4);
    });
  }, [strikeBreakdown]);

  useEffect(() => { drawBarChart(); }, [drawBarChart]);
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => drawBarChart());
    ro.observe(c);
    return () => ro.disconnect();
  }, [drawBarChart]);

  // ── States ──
  if (loading && !trades.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading strike data...</div></div>;
  if (error && !trades.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!strikeBreakdown.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>🎯</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Strike Data</span></div></div>;

  return (
    <div style={S.panel}>
      {/* ── Summary strip ── */}
      {summary && (
        <div style={S.metricsStrip}>
          <div style={S.metricBlock()}>
            <span style={S.metricLabel}>Top Strike</span>
            <span style={S.metricValue(C.textPrimary, 15)}>{summary.topStrike.strike}</span>
            <span style={S.metricSub}>{fmtDollar(summary.topStrike.total).replace('+', '')} total</span>
          </div>
          <div style={S.metricBlock()}>
            <span style={S.metricLabel}>Call / Put Split</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <div style={{ flex: 1, height: 5, borderRadius: 3, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${summary.callPct}%`, borderRadius: 3, background: C.green, opacity: 0.7 }} />
              </div>
              <span style={{ fontFamily: FONT_MONO, fontSize: 11, fontWeight: 700, color: summary.callPct >= 50 ? C.green : C.red }}>{summary.callPct}%C</span>
            </div>
          </div>
          <div style={S.metricBlock(true)}>
            <span style={S.metricLabel}>Strikes Active</span>
            <span style={S.metricValue(C.textPrimary, 15)}>{summary.strikeCount}</span>
            <span style={S.metricSub}>{ticker}</span>
          </div>
        </div>
      )}

      {/* ── Legend ── */}
      <div style={{ padding: '6px 14px 0', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${C.border}` }}>
        <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)' }}>
          Premium by Strike
        </span>
        <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)' }}>
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(0,220,130,0.5)', marginRight: 4, verticalAlign: 'middle' }} />Calls
          <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'rgba(255,71,87,0.5)', marginLeft: 10, marginRight: 4, verticalAlign: 'middle' }} />Puts
        </span>
      </div>

      {/* ── Bar chart ── */}
      <div ref={containerRef} style={{ position: 'relative', flex: 1, minHeight: Math.min(strikeBreakdown.length * 30 + 20, 300) }}>
        <canvas ref={canvasRef} style={S.canvas} />
      </div>
    </div>
  );
}
