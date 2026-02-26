'use client';

import { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import type { EnhancedFlowStats, EnhancedOptionTrade, FlowTimeSeries } from '@/types/flow';
import type { Timeframe } from '@/components/war-room/timeframe-selector';
import {
  PANEL_COLORS as C, FONT_MONO, fmtDollar, fmtTime,
  setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   OPTIONS FLOW PANEL v4.0

   FIXES:
   1. Independent full-session fetch → line chart ALWAYS shows 9:30→close
   2. BOTH charts always visible:
      - Top: Cumulative Call vs Put lines (full session) with timeframe highlight
      - Bottom: Premium by Strike bars (timeframe-filtered trades)
   3. No more fallback switching — you always get crossover + strike view
   4. ALL crossovers shown (not just the last one)
   ════════════════════════════════════════════════════════════════ */

interface FlowPanelProps {
  ticker: string;
  stats: EnhancedFlowStats | null;
  trades: EnhancedOptionTrade[];
  loading: boolean;
  error: string | null;
  avgDailyFlow?: number;
  timeframe?: Timeframe;
  timeframeRange?: {
    from: number; to: number; label: string;
    isMarketClosed: boolean; tradingDay?: string;
  };
  currentPrice?: number;
  vwap?: number | null;
}

export function OptionsFlowPanel({
  ticker, stats, trades, loading, error,
  avgDailyFlow = 2_000_000, timeframe = '15m', timeframeRange,
  currentPrice, vwap,
}: FlowPanelProps) {
  const lineCanvasRef = useRef<HTMLCanvasElement>(null);
  const lineContainerRef = useRef<HTMLDivElement>(null);
  const barCanvasRef = useRef<HTMLCanvasElement>(null);
  const barContainerRef = useRef<HTMLDivElement>(null);

  /* ══════════════════════════════════════════════════════════════
     ★ INDEPENDENT FULL-SESSION FETCH — no timeframe filter
     This ensures the cumulative line chart ALWAYS has full session data.
     ══════════════════════════════════════════════════════════════ */
  const [fullSessionSeries, setFullSessionSeries] = useState<FlowTimeSeries[]>([]);
  const [fetchedTicker, setFetchedTicker] = useState('');

  useEffect(() => {
    if (!ticker) return;
    // Reset on ticker change
    if (ticker !== fetchedTicker) setFullSessionSeries([]);

    const fetchFullSession = async () => {
      try {
        // NO from/to params → gets full session data
        const res = await fetch(
          `/api/flow/options?tickers=${ticker}&limit=500&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (json.data?.stats?.flowTimeSeries?.length) {
          setFullSessionSeries(json.data.stats.flowTimeSeries);
          setFetchedTicker(ticker);
        }
      } catch {
        // Silently fall back to parent data
      }
    };

    fetchFullSession();
    // Refresh every 60s during market hours
    const iv = setInterval(fetchFullSession, 60000);
    return () => clearInterval(iv);
  }, [ticker]);

  // Line chart uses full-session data; falls back to parent if fetch hasn't completed
  const lineTimeSeries = fullSessionSeries.length > 0
    ? fullSessionSeries
    : (stats?.flowTimeSeries || []);

  /* ── Derived metrics (parent data — timeframe-filtered) ── */
  const metrics = useMemo(() => {
    if (!stats) return null;
    const callPrem = stats.callPremium || 0;
    const putPrem = stats.putPremium || 0;
    const totalPrem = callPrem + putPrem;
    const netFlow = stats.netDeltaAdjustedFlow || (callPrem - putPrem);
    const callPct = totalPrem > 0 ? Math.round((callPrem / totalPrem) * 100) : 50;
    const flowBias = callPct >= 60 ? 'BULLISH' : callPct <= 40 ? 'BEARISH' : 'NEUTRAL';
    const flowColor = flowBias === 'BULLISH' ? C.green : flowBias === 'BEARISH' ? C.red : C.yellow;
    const flowBg = flowBias === 'BULLISH' ? C.greenDim : flowBias === 'BEARISH' ? C.redDim : C.yellowDim;
    const ratio = avgDailyFlow > 0 ? Math.abs(netFlow) / avgDailyFlow : 0;
    const volumeLabel = ratio < 0.1 ? 'VERY LOW' : ratio < 0.5 ? 'LOW' : ratio < 1 ? 'MODERATE' : ratio < 2 ? 'HIGH' : 'VERY HIGH';
    const volumeColor = ratio < 0.5 ? C.red : ratio < 1 ? C.yellow : C.cyan;
    const volumeBg = ratio < 0.5 ? C.redDim : ratio < 1 ? C.yellowDim : C.cyanDim;
    return { netFlow, callPrem, putPrem, totalPrem, callPct, flowBias, flowColor, flowBg, tradeCount: stats.tradeCount || 0, volumeLabel, volumeColor, volumeBg };
  }, [stats, avgDailyFlow]);

  const topTrade = useMemo(() => trades.length ? [...trades].sort((a, b) => (b.premium || 0) - (a.premium || 0))[0] : null, [trades]);
  const topTrades = useMemo(() => [...trades].sort((a, b) => (b.premium || 0) - (a.premium || 0)).slice(0, 5), [trades]);

  /* ── Cumulative chart data (from full session) ── */
  const lineData = useMemo(() => {
    if (!lineTimeSeries.length) return null;
    let cumCall = 0, cumPut = 0;
    const calls: number[] = [], puts: number[] = [], times: string[] = [], timeMs: number[] = [];
    lineTimeSeries.forEach(d => {
      cumCall += d.callPremium || 0; cumPut += d.putPremium || 0;
      calls.push(cumCall); puts.push(cumPut);
      times.push(d.time || '');
      timeMs.push(d.timeMs || 0);
    });
    // Find ALL crossovers
    const crossovers: { idx: number; type: 'bull' | 'bear' }[] = [];
    for (let i = 1; i < calls.length; i++) {
      const prevCallAbove = calls[i - 1] > puts[i - 1];
      const currCallAbove = calls[i] > puts[i];
      if (prevCallAbove !== currCallAbove) {
        crossovers.push({ idx: i, type: currCallAbove ? 'bull' : 'bear' });
      }
    }
    return { calls, puts, times, timeMs, crossovers };
  }, [lineTimeSeries]);

  /* ── Strike breakdown (from parent data — timeframe-filtered) ── */
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
      .slice(0, 8);
  }, [trades]);

  /* ── Sweep insight ── */
  const sweepInsight = useMemo(() => {
    if (!trades.length) return null;
    const sweeps = trades.filter(t => t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep);
    if (sweeps.length < 2) return null;
    const byStrike: Record<number, { count: number; total: number; cp: string }> = {};
    sweeps.forEach(s => { const k = s.strike; if (!byStrike[k]) byStrike[k] = { count: 0, total: 0, cp: s.callPut }; byStrike[k].count++; byStrike[k].total += s.premium || 0; });
    const top = Object.entries(byStrike).sort(([, a], [, b]) => b.total - a.total)[0];
    if (!top) return null;
    const [strike, info] = top;
    if (info.count < 2) return null;
    return { strike: Number(strike), cp: info.cp, total: info.total, count: info.count, color: info.cp === 'C' ? C.green : C.red };
  }, [trades]);

  /* ══════════════════════════════════════════════════════════════
     DRAW: Cumulative Line Chart (full session)
     ══════════════════════════════════════════════════════════════ */
  const drawLineChart = useCallback(() => {
    const canvas = lineCanvasRef.current, container = lineContainerRef.current;
    if (!canvas || !container || !lineData) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 14, right: 54, bottom: 26, left: 52 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const N = lineData.calls.length; if (N < 2) return;
    const maxVal = Math.max(...lineData.calls, ...lineData.puts, 1);
    const xPos = (i: number) => PAD.left + (i / (N - 1)) * cW;
    const yPos = (v: number) => PAD.top + (1 - v / maxVal) * cH;

    ctx.clearRect(0, 0, W, H);
    drawGridLines(ctx, PAD, W, H);

    // ── Timeframe highlight: dim region outside current timeframe ──
    if (timeframeRange && lineData.timeMs.length > 0) {
      const fi = lineData.timeMs.findIndex(t => t >= timeframeRange.from);
      const li = (() => { for (let j = lineData.timeMs.length - 1; j >= 0; j--) { if (lineData.timeMs[j] <= timeframeRange.to) return j; } return -1; })();
      if (fi >= 0 && li >= 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        if (fi > 0) ctx.fillRect(PAD.left, PAD.top, xPos(fi) - PAD.left, cH);
        if (li < N - 1) ctx.fillRect(xPos(li), PAD.top, W - PAD.right - xPos(li), cH);
        // Subtle border at window edges
        ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        if (fi > 0) { ctx.beginPath(); ctx.moveTo(xPos(fi), PAD.top); ctx.lineTo(xPos(fi), PAD.top + cH); ctx.stroke(); }
        if (li < N - 1) { ctx.beginPath(); ctx.moveTo(xPos(li), PAD.top); ctx.lineTo(xPos(li), PAD.top + cH); ctx.stroke(); }
        ctx.setLineDash([]);
      }
    }

    // ── Call area fill ──
    ctx.beginPath(); ctx.moveTo(xPos(0), PAD.top + cH);
    for (let i = 0; i < N; i++) ctx.lineTo(xPos(i), yPos(lineData.calls[i]));
    ctx.lineTo(xPos(N - 1), PAD.top + cH); ctx.closePath();
    const gC = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    gC.addColorStop(0, 'rgba(0,220,130,0.15)'); gC.addColorStop(1, 'rgba(0,220,130,0.01)');
    ctx.fillStyle = gC; ctx.fill();

    // ── Put area fill ──
    ctx.beginPath(); ctx.moveTo(xPos(0), PAD.top + cH);
    for (let i = 0; i < N; i++) ctx.lineTo(xPos(i), yPos(lineData.puts[i]));
    ctx.lineTo(xPos(N - 1), PAD.top + cH); ctx.closePath();
    const gP = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH);
    gP.addColorStop(0, 'rgba(255,71,87,0.12)'); gP.addColorStop(1, 'rgba(255,71,87,0.01)');
    ctx.fillStyle = gP; ctx.fill();

    // ── Call line ──
    ctx.strokeStyle = 'rgba(0,220,130,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i < N; i++) { i === 0 ? ctx.moveTo(xPos(i), yPos(lineData.calls[i])) : ctx.lineTo(xPos(i), yPos(lineData.calls[i])); }
    ctx.stroke();

    // ── Put line ──
    ctx.strokeStyle = 'rgba(255,71,87,0.75)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < N; i++) { i === 0 ? ctx.moveTo(xPos(i), yPos(lineData.puts[i])) : ctx.lineTo(xPos(i), yPos(lineData.puts[i])); }
    ctx.stroke();

    // ── Right edge labels (with anti-overlap) ──
    ctx.font = `600 10px ${FONT_MONO}`; ctx.textAlign = 'left';
    let cLY = yPos(lineData.calls[N - 1]), pLY = yPos(lineData.puts[N - 1]);
    if (Math.abs(cLY - pLY) < 24) { if (cLY < pLY) { cLY -= 12; pLY += 12; } else { pLY -= 12; cLY += 12; } }
    ctx.fillStyle = C.green; ctx.fillText('CALLS', W - PAD.right + 4, cLY - 4);
    ctx.fillText(fmtDollar(lineData.calls[N - 1]).replace('+', ''), W - PAD.right + 4, cLY + 8);
    ctx.fillStyle = C.red; ctx.fillText('PUTS', W - PAD.right + 4, pLY - 4);
    ctx.fillText(fmtDollar(lineData.puts[N - 1]).replace('+', ''), W - PAD.right + 4, pLY + 8);

    // ── ALL crossover markers ──
    lineData.crossovers.forEach(cross => {
      const cx = xPos(cross.idx), cy = yPos(lineData.calls[cross.idx]);
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(251,191,36,0.2)'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = C.yellow; ctx.fill();
      ctx.fillStyle = 'rgba(251,191,36,0.6)'; ctx.font = `600 8px ${FONT_MONO}`;
      ctx.textAlign = 'center'; ctx.fillText('CROSS', cx, cy - 10);
    });

    // ── X-axis labels ──
    ctx.fillStyle = C.textMuted; ctx.font = `500 9px ${FONT_MONO}`; ctx.textAlign = 'center';
    const step = Math.max(Math.floor(N / 8), 1);
    for (let i = 0; i < N; i += step) {
      if (lineData.times[i]) ctx.fillText(lineData.times[i], xPos(i), H - PAD.bottom + 14);
    }
    if (N > 1 && lineData.times[N - 1]) ctx.fillText(lineData.times[N - 1], xPos(N - 1), H - PAD.bottom + 14);

    // ── Y-axis labels ──
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) {
      const val = (maxVal / 4) * (4 - i);
      const y = PAD.top + (i / 4) * cH;
      const lbl = val >= 1e6 ? `$${(val / 1e6).toFixed(1)}M` : val >= 1e3 ? `$${(val / 1e3).toFixed(0)}K` : `$${val.toFixed(0)}`;
      ctx.fillText(lbl, PAD.left - 6, y + 3);
    }
  }, [lineData, timeframeRange]);

  /* ══════════════════════════════════════════════════════════════
     DRAW: Strike Premium Bar Chart (timeframe-filtered)
     ══════════════════════════════════════════════════════════════ */
  const drawBarChart = useCallback(() => {
    const canvas = barCanvasRef.current, container = barContainerRef.current;
    if (!canvas || !container || !strikeBreakdown.length) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 6, right: 54, bottom: 6, left: 52 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;

    ctx.clearRect(0, 0, W, H);

    const N = strikeBreakdown.length;
    const maxPrem = Math.max(...strikeBreakdown.map(s => s.total), 1);
    const barH = Math.min(Math.floor(cH / N) - 4, 22);
    const gapY = (cH - barH * N) / (N + 1);

    strikeBreakdown.forEach((s, i) => {
      const y = PAD.top + gapY + i * (barH + gapY);
      const totalW = (s.total / maxPrem) * cW * 0.82;
      const callW = s.total > 0 ? (s.callPrem / s.total) * totalW : 0;
      const putW = totalW - callW;

      // Call portion (green)
      if (callW > 0) {
        const g = ctx.createLinearGradient(PAD.left, 0, PAD.left + callW, 0);
        g.addColorStop(0, 'rgba(0,220,130,0.2)'); g.addColorStop(1, 'rgba(0,220,130,0.45)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(PAD.left, y, callW, barH, 3); ctx.fill();
      }
      // Put portion (red)
      if (putW > 0) {
        const g = ctx.createLinearGradient(PAD.left + callW, 0, PAD.left + callW + putW, 0);
        g.addColorStop(0, 'rgba(255,71,87,0.2)'); g.addColorStop(1, 'rgba(255,71,87,0.45)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.roundRect(PAD.left + callW, y, putW, barH, 3); ctx.fill();
      }

      // Strike label (left)
      ctx.fillStyle = C.textSecondary;
      ctx.font = `600 10px ${FONT_MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(s.strike, PAD.left - 6, y + barH / 2 + 3);

      // Premium label (right of bar)
      ctx.fillStyle = C.textMuted;
      ctx.font = `500 9px ${FONT_MONO}`;
      ctx.textAlign = 'left';
      const premLabel = s.total >= 1e6 ? `$${(s.total / 1e6).toFixed(1)}M` : `$${(s.total / 1e3).toFixed(0)}K`;
      ctx.fillText(premLabel, PAD.left + totalW + 6, y + barH / 2 + 3);
    });
  }, [strikeBreakdown]);

  // ── Mount / Resize observers ──
  useEffect(() => { drawLineChart(); }, [drawLineChart]);
  useEffect(() => { drawBarChart(); }, [drawBarChart]);
  useEffect(() => {
    const c = lineContainerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => drawLineChart());
    ro.observe(c);
    return () => ro.disconnect();
  }, [drawLineChart]);
  useEffect(() => {
    const c = barContainerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => drawBarChart());
    ro.observe(c);
    return () => ro.disconnect();
  }, [drawBarChart]);

  // ── Loading / Error / Empty ──
  if (loading && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading flow data...</div></div>;
  if (error && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>📊</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Flow Data</span></div></div>;

  const m = metrics!;
  const hasLineData = lineData && lineData.calls.length >= 2;
  const hasBarData = strikeBreakdown.length > 0;

  return (
    <div style={S.panel}>
      {/* ── METRICS STRIP ── */}
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Net Flow</span><span style={S.metricValue(m.flowColor, 15)}>{fmtDollar(m.netFlow)}</span><div style={S.badge(m.flowColor, m.flowBg)}>● {m.flowBias}</div></div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Call / Put $</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={S.metricValue(C.green, 13)}>{fmtDollar(m.callPrem).replace('+', '')}</span><span style={{ color: C.textMuted, fontSize: 11 }}>/</span><span style={S.metricValue(C.red, 13)}>{fmtDollar(m.putPrem).replace(/[+-]/, '')}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}><div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${m.callPct}%`, borderRadius: 2, background: C.green, opacity: 0.7 }} /></div><span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: m.callPct >= 50 ? C.green : C.red, minWidth: 28, textAlign: 'right' as const }}>{m.callPct}%</span></div>
        </div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Trades</span><span style={S.metricValue(C.textPrimary, 15)}>{m.tradeCount}</span><div style={S.badge(m.volumeColor, m.volumeBg)}>{m.volumeLabel} FLOW</div></div>
        <div style={S.metricBlock(true)}><span style={S.metricLabel}>Top Strike</span>{topTrade ? (<><span style={S.metricValue(C.textPrimary, 15)}>${topTrade.strike}{topTrade.callPut}</span><span style={S.metricSub}>{fmtDollar(topTrade.premium).replace('+', '')} · {topTrade.expiry?.slice(5) || ''} · {topTrade.tradeType === 'SWEEP' || topTrade.isSweep ? 'Sweep' : 'Block'}</span></>) : <span style={S.metricValue(C.textMuted, 15)}>—</span>}</div>
      </div>

      {/* ── CUMULATIVE LINE CHART (full session) ── */}
      {hasLineData && (
        <div ref={lineContainerRef} style={{ ...S.chartArea, minHeight: 130 }}>
          <canvas ref={lineCanvasRef} style={S.canvas} />
        </div>
      )}

      {/* ── STRIKE BAR CHART (timeframe-filtered) ── */}
      {hasBarData && (
        <div style={{ borderTop: hasLineData ? `1px solid ${C.border}` : 'none', flexShrink: 0 }}>
          <div style={{ padding: '4px 14px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' as const, color: 'rgba(255,255,255,0.25)' }}>Premium by Strike</span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.04)' }} />
            <span style={{ fontSize: 8, color: 'rgba(255,255,255,0.2)' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 1, background: 'rgba(0,220,130,0.5)', marginRight: 3, verticalAlign: 'middle' }} />Calls
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 1, background: 'rgba(255,71,87,0.5)', marginLeft: 8, marginRight: 3, verticalAlign: 'middle' }} />Puts
            </span>
          </div>
          <div ref={barContainerRef} style={{ position: 'relative', height: Math.min(strikeBreakdown.length * 26 + 12, 180) }}>
            <canvas ref={barCanvasRef} style={S.canvas} />
          </div>
        </div>
      )}

      {/* ── TOP TRADES TABLE (timeframe-filtered) ── */}
      {topTrades.length > 0 && (
        <div style={{ ...S.scrollArea, maxHeight: 108, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', fontFamily: FONT_MONO }}>
            <thead><tr>{['Time', 'C/P', 'Strike', 'Exp', 'Premium', 'Type'].map(h => (<th key={h} style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, textAlign: 'left', padding: '4px 10px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.cardBg }}>{h}</th>))}</tr></thead>
            <tbody>{topTrades.map((t, i) => (<tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}><td style={{ padding: '5px 10px', color: C.textSecondary, whiteSpace: 'nowrap' }}>{fmtTime(t.timestampMs)}</td><td style={{ padding: '5px 10px', color: t.callPut === 'C' ? C.green : C.red, fontWeight: 600 }}>{t.callPut}</td><td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>${t.strike}</td><td style={{ padding: '5px 10px', color: C.textSecondary }}>{t.expiry?.slice(5) || ''}</td><td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>{fmtDollar(t.premium).replace('+', '')}</td><td style={{ padding: '5px 10px' }}>{(t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep) ? <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: C.cyanDim, color: C.cyan }}>SWEEP</span> : <span style={{ fontSize: 9, color: C.textMuted }}>{t.tradeType || 'BLOCK'}</span>}</td></tr>))}</tbody>
          </table>
        </div>
      )}

      {/* ── BOTTOM INSIGHT ── */}
      <div style={{ ...S.bottomStrip, flexShrink: 0 }}>
        <div style={S.dot(sweepInsight ? sweepInsight.color : C.textMuted)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}>{sweepInsight ? (<><strong style={{ color: C.textPrimary, fontWeight: 600 }}>{sweepInsight.cp === 'C' ? 'Call' : 'Put'} sweep cluster</strong>{' '}at ${sweepInsight.strike} — {fmtDollar(sweepInsight.total).replace('+', '')} in {sweepInsight.count} sweeps</>) : (<><strong style={{ color: C.textPrimary, fontWeight: 600 }}>Flow:</strong>{' '}{m.flowBias === 'BULLISH' ? 'Call premium leading' : m.flowBias === 'BEARISH' ? 'Put premium dominant' : 'Balanced flow'} this session</>)}</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{timeframeRange?.label || 'Session'} · {ticker}</span>
      </div>
    </div>
  );
}
