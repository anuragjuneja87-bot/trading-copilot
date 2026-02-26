'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import type { EnhancedFlowStats, EnhancedOptionTrade, FlowTimeSeries } from '@/types/flow';
import type { Timeframe } from '@/components/war-room/timeframe-selector';
import {
  PANEL_COLORS as C, FONT_MONO, fmtDollar, fmtTime,
  setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   OPTIONS FLOW PANEL v3.1

   FIX: Cumulative chart fetches FULL SESSION data independently
   so it always has 50+ data points regardless of timeframe.
   Metrics strip + table use parent-provided (timeframe-filtered) data.
   Chart dims region outside current timeframe for context.
   ════════════════════════════════════════════════════════════════ */

interface FlowPanelProps {
  stats: EnhancedFlowStats | null;
  trades: EnhancedOptionTrade[];
  loading: boolean;
  error: string | null;
  avgDailyFlow?: number;
  timeframe?: Timeframe;
  timeframeRange?: {
    from: number;
    to: number;
    label: string;
    isMarketClosed: boolean;
    tradingDay?: string;
  };
  currentPrice?: number;
  vwap?: number | null;
}

export function OptionsFlowPanel({
  stats, trades, loading, error,
  avgDailyFlow = 2_000_000, timeframe = '15m', timeframeRange,
  currentPrice, vwap,
}: FlowPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Independent full-session fetch for cumulative chart ── */
  const [fullSessionSeries, setFullSessionSeries] = useState<FlowTimeSeries[]>([]);

  useEffect(() => {
    const ticker = trades[0]?.ticker || '';
    if (!ticker) return;
    const fetchFullSession = async () => {
      try {
        const res = await fetch(`/api/flow/options?tickers=${ticker}&limit=500&_t=${Date.now()}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.data?.stats?.flowTimeSeries?.length) setFullSessionSeries(json.data.stats.flowTimeSeries);
      } catch { /* fall back to parent */ }
    };
    fetchFullSession();
    const iv = setInterval(fetchFullSession, 60000);
    return () => clearInterval(iv);
  }, [trades[0]?.ticker]);

  // Chart uses full session, metrics use parent (timeframe-filtered)
  const chartTimeSeries = fullSessionSeries.length > 0 ? fullSessionSeries : (stats?.flowTimeSeries || []);

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
    return { netFlow, callPrem, putPrem, callPct, flowBias, flowColor, flowBg, tradeCount: stats.tradeCount || 0, volumeLabel, volumeColor, volumeBg };
  }, [stats, avgDailyFlow]);

  const topTrade = useMemo(() => trades.length ? [...trades].sort((a, b) => (b.premium || 0) - (a.premium || 0))[0] : null, [trades]);
  const topTrades = useMemo(() => [...trades].sort((a, b) => (b.premium || 0) - (a.premium || 0)).slice(0, 5), [trades]);

  /* ── Cumulative chart data (full session) ── */
  const chartData = useMemo(() => {
    if (!chartTimeSeries.length) return null;
    let cumCall = 0, cumPut = 0;
    const calls: number[] = [], puts: number[] = [], times: string[] = [], timeMs: number[] = [];
    chartTimeSeries.forEach(d => {
      cumCall += d.callPremium || 0; cumPut += d.putPremium || 0;
      calls.push(cumCall); puts.push(cumPut); times.push(d.time || ''); timeMs.push(d.timeMs || 0);
    });
    let crossIdx = -1;
    for (let i = chartTimeSeries.length - 1; i >= 1; i--) {
      if ((calls[i - 1] > puts[i - 1]) !== (calls[i] > puts[i])) { crossIdx = i; break; }
    }
    return { calls, puts, times, timeMs, crossIdx };
  }, [chartTimeSeries]);

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

  /* ── Draw chart ── */
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container || !chartData) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 14, right: 54, bottom: 26, left: 52 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const N = chartData.calls.length; if (N < 2) return;
    const maxVal = Math.max(...chartData.calls, ...chartData.puts, 1);
    const xPos = (i: number) => PAD.left + (i / (N - 1)) * cW;
    const yPos = (v: number) => PAD.top + (1 - v / maxVal) * cH;
    ctx.clearRect(0, 0, W, H);
    drawGridLines(ctx, PAD, W, H);

    // Timeframe highlight: dim region outside current timeframe
    if (timeframeRange && chartData.timeMs.length > 0) {
      const fi = chartData.timeMs.findIndex(t => t >= timeframeRange.from);
      const li = (() => { for (let j = chartData.timeMs.length - 1; j >= 0; j--) { if (chartData.timeMs[j] <= timeframeRange.to) return j; } return -1; })();
      if (fi >= 0 && li >= 0 && fi < li) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        if (fi > 0) ctx.fillRect(PAD.left, PAD.top, xPos(fi) - PAD.left, cH);
        if (li < N - 1) ctx.fillRect(xPos(li), PAD.top, W - PAD.right - xPos(li), cH);
      }
    }

    // Call area fill
    ctx.beginPath(); ctx.moveTo(xPos(0), PAD.top + cH);
    for (let i = 0; i < N; i++) ctx.lineTo(xPos(i), yPos(chartData.calls[i]));
    ctx.lineTo(xPos(N - 1), PAD.top + cH); ctx.closePath();
    const gC = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH); gC.addColorStop(0, 'rgba(0,220,130,0.15)'); gC.addColorStop(1, 'rgba(0,220,130,0.01)');
    ctx.fillStyle = gC; ctx.fill();

    // Put area fill
    ctx.beginPath(); ctx.moveTo(xPos(0), PAD.top + cH);
    for (let i = 0; i < N; i++) ctx.lineTo(xPos(i), yPos(chartData.puts[i]));
    ctx.lineTo(xPos(N - 1), PAD.top + cH); ctx.closePath();
    const gP = ctx.createLinearGradient(0, PAD.top, 0, PAD.top + cH); gP.addColorStop(0, 'rgba(255,71,87,0.12)'); gP.addColorStop(1, 'rgba(255,71,87,0.01)');
    ctx.fillStyle = gP; ctx.fill();

    // Call line
    ctx.strokeStyle = 'rgba(0,220,130,0.85)'; ctx.lineWidth = 2.5; ctx.beginPath();
    for (let i = 0; i < N; i++) { i === 0 ? ctx.moveTo(xPos(i), yPos(chartData.calls[i])) : ctx.lineTo(xPos(i), yPos(chartData.calls[i])); } ctx.stroke();

    // Put line
    ctx.strokeStyle = 'rgba(255,71,87,0.75)'; ctx.lineWidth = 2; ctx.beginPath();
    for (let i = 0; i < N; i++) { i === 0 ? ctx.moveTo(xPos(i), yPos(chartData.puts[i])) : ctx.lineTo(xPos(i), yPos(chartData.puts[i])); } ctx.stroke();

    // Right edge labels (with anti-overlap)
    ctx.font = `600 10px ${FONT_MONO}`; ctx.textAlign = 'left';
    let cLY = yPos(chartData.calls[N - 1]), pLY = yPos(chartData.puts[N - 1]);
    if (Math.abs(cLY - pLY) < 24) { if (cLY < pLY) { cLY -= 12; pLY += 12; } else { pLY -= 12; cLY += 12; } }
    ctx.fillStyle = C.green; ctx.fillText('CALLS', W - PAD.right + 4, cLY - 4); ctx.fillText(fmtDollar(chartData.calls[N - 1]).replace('+', ''), W - PAD.right + 4, cLY + 8);
    ctx.fillStyle = C.red; ctx.fillText('PUTS', W - PAD.right + 4, pLY - 4); ctx.fillText(fmtDollar(chartData.puts[N - 1]).replace('+', ''), W - PAD.right + 4, pLY + 8);

    // Crossover marker
    if (chartData.crossIdx > 0) {
      const cx = xPos(chartData.crossIdx), cy = yPos(chartData.calls[chartData.crossIdx]);
      ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(251,191,36,0.2)'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, 2.5, 0, Math.PI * 2); ctx.fillStyle = C.yellow; ctx.fill();
      ctx.fillStyle = 'rgba(251,191,36,0.6)'; ctx.font = `600 8px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.fillText('CROSS', cx, cy - 10);
    }

    // X-axis labels
    ctx.fillStyle = C.textMuted; ctx.font = `500 9px ${FONT_MONO}`; ctx.textAlign = 'center';
    const step = Math.max(Math.floor(N / 8), 1);
    for (let i = 0; i < N; i += step) { if (chartData.times[i]) ctx.fillText(chartData.times[i], xPos(i), H - PAD.bottom + 14); }
    if (N > 1 && chartData.times[N - 1]) ctx.fillText(chartData.times[N - 1], xPos(N - 1), H - PAD.bottom + 14);

    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) { const val = (maxVal / 4) * (4 - i); const y = PAD.top + (i / 4) * cH; const lbl = val >= 1e6 ? `$${(val / 1e6).toFixed(1)}M` : val >= 1e3 ? `$${(val / 1e3).toFixed(0)}K` : `$${val.toFixed(0)}`; ctx.fillText(lbl, PAD.left - 6, y + 3); }
  }, [chartData, timeframeRange]);

  useEffect(() => { drawChart(); }, [drawChart]);
  useEffect(() => { const c = containerRef.current; if (!c) return; const ro = new ResizeObserver(() => drawChart()); ro.observe(c); return () => ro.disconnect(); }, [drawChart]);

  if (loading && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading flow data...</div></div>;
  if (error && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>📊</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Flow Data</span></div></div>;

  const m = metrics!;
  return (
    <div style={S.panel}>
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

      <div ref={containerRef} style={{ ...S.chartArea, minHeight: 140 }}><canvas ref={canvasRef} style={S.canvas} /></div>

      {topTrades.length > 0 && (
        <div style={{ ...S.scrollArea, maxHeight: 108, borderTop: `1px solid ${C.border}` }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', fontFamily: FONT_MONO }}>
            <thead><tr>{['Time', 'C/P', 'Strike', 'Exp', 'Premium', 'Type'].map(h => (<th key={h} style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, textAlign: 'left', padding: '4px 10px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.cardBg }}>{h}</th>))}</tr></thead>
            <tbody>{topTrades.map((t, i) => (<tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}><td style={{ padding: '5px 10px', color: C.textSecondary, whiteSpace: 'nowrap' }}>{fmtTime(t.timestampMs)}</td><td style={{ padding: '5px 10px', color: t.callPut === 'C' ? C.green : C.red, fontWeight: 600 }}>{t.callPut}</td><td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>${t.strike}</td><td style={{ padding: '5px 10px', color: C.textSecondary }}>{t.expiry?.slice(5) || ''}</td><td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>{fmtDollar(t.premium).replace('+', '')}</td><td style={{ padding: '5px 10px' }}>{(t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep) ? <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: C.cyanDim, color: C.cyan }}>SWEEP</span> : <span style={{ fontSize: 9, color: C.textMuted }}>{t.tradeType || 'BLOCK'}</span>}</td></tr>))}</tbody>
          </table>
        </div>
      )}

      <div style={S.bottomStrip}>
        <div style={S.dot(sweepInsight ? sweepInsight.color : C.textMuted)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}>{sweepInsight ? (<><strong style={{ color: C.textPrimary, fontWeight: 600 }}>{sweepInsight.cp === 'C' ? 'Call' : 'Put'} sweep cluster</strong>{' '}at ${sweepInsight.strike} — {fmtDollar(sweepInsight.total).replace('+', '')} in {sweepInsight.count} sweeps</>) : (<><strong style={{ color: C.textPrimary, fontWeight: 600 }}>Flow:</strong>{' '}{m.flowBias === 'BULLISH' ? 'Call premium leading' : m.flowBias === 'BEARISH' ? 'Put premium dominant' : 'Balanced flow'} this session</>)}</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{timeframeRange?.label || 'Session'}</span>
      </div>
    </div>
  );
}
