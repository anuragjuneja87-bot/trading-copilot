'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import type { EnhancedFlowStats, EnhancedOptionTrade, FlowTimeSeries } from '@/types/flow';
import type { Timeframe } from '@/components/war-room/timeframe-selector';
import {
  PANEL_COLORS as C, FONT_MONO, fmtDollar, fmtTime,
  panelStyles as S,
} from '@/lib/panel-design-system';
import { OptionsFlowLineChart } from './options-flow-line-chart';

/* ════════════════════════════════════════════════════════════════
   OPTIONS FLOW PANEL v6.0

   Cumulative call/put premium lines — the core view.
   Strike breakdown moved to separate StrikeBreakdownPanel.
   
   Chart height: 280px (was 160px) for proper divergence visibility.
   Full-session fetch via Polygon aggregates for complete day coverage.
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


  /* ══════════════════════════════════════════════════════════════
     ★ INDEPENDENT FULL-SESSION FETCH
     Uses fullSession=true → Polygon 5-min aggregates for full day.
     This ensures even high-volume tickers like NVDA get complete
     data from 9:30 AM to 4:00 PM (not just last few minutes).
     ══════════════════════════════════════════════════════════════ */
  const [fullSessionSeries, setFullSessionSeries] = useState<FlowTimeSeries[]>([]);
  const [fetchedTicker, setFetchedTicker] = useState('');

  useEffect(() => {
    if (!ticker) return;
    if (ticker !== fetchedTicker) setFullSessionSeries([]);

    const fetchFullSession = async () => {
      try {
        const res = await fetch(
          `/api/flow/options?tickers=${ticker}&fullSession=true&_t=${Date.now()}`,
          { cache: 'no-store' }
        );
        const json = await res.json();
        if (json.data?.stats?.flowTimeSeries?.length) {
          setFullSessionSeries(json.data.stats.flowTimeSeries);
          setFetchedTicker(ticker);
        }
      } catch {
        // Silent fallback to parent data
      }
    };

    fetchFullSession();
    const iv = setInterval(fetchFullSession, 60000);
    return () => clearInterval(iv);
  }, [ticker]);

  // Line chart: full-session data; fallback to parent if fetch pending
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



  /* ── Sweep insight ── */
  const sweepInsight = useMemo(() => {
    if (!trades.length) return null;
    const sweeps = trades.filter(t => t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep);
    if (sweeps.length < 2) return null;
    const byStrike: Record<number, { count: number; total: number; cp: string }> = {};
    sweeps.forEach(s => {
      const k = s.strike;
      if (!byStrike[k]) byStrike[k] = { count: 0, total: 0, cp: s.callPut };
      byStrike[k].count++; byStrike[k].total += s.premium || 0;
    });
    const top = Object.entries(byStrike).sort(([, a], [, b]) => b.total - a.total)[0];
    if (!top) return null;
    const [strike, info] = top;
    if (info.count < 2) return null;
    return { strike: Number(strike), cp: info.cp, total: info.total, count: info.count, color: info.cp === 'C' ? C.green : C.red };
  }, [trades]);



  // ── Loading / Error / Empty states ──
  if (loading && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading flow data...</div></div>;
  if (error && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>📊</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Flow Data</span></div></div>;

  const m = metrics!;
  const hasLineData = lineTimeSeries.length >= 2;

  return (
    <div style={S.panel}>
      {/* ── METRICS STRIP ── */}
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Net Flow</span>
          <span style={S.metricValue(m.flowColor, 15)}>{fmtDollar(m.netFlow)}</span>
          <div style={S.badge(m.flowColor, m.flowBg)}>● {m.flowBias}</div>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Call / Put $</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span style={S.metricValue(C.green, 13)}>{fmtDollar(m.callPrem).replace('+', '')}</span>
            <span style={{ color: C.textMuted, fontSize: 11 }}>/</span>
            <span style={S.metricValue(C.red, 13)}>{fmtDollar(m.putPrem).replace(/[+-]/, '')}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${m.callPct}%`, borderRadius: 2, background: C.green, opacity: 0.7 }} />
            </div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: m.callPct >= 50 ? C.green : C.red, minWidth: 28, textAlign: 'right' as const }}>{m.callPct}%</span>
          </div>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Trades</span>
          <span style={S.metricValue(C.textPrimary, 15)}>{m.tradeCount}</span>
          <div style={S.badge(m.volumeColor, m.volumeBg)}>{m.volumeLabel} FLOW</div>
        </div>
        <div style={S.metricBlock(true)}>
          <span style={S.metricLabel}>Top Strike</span>
          {topTrade ? (
            <>
              <span style={S.metricValue(C.textPrimary, 15)}>${topTrade.strike}{topTrade.callPut}</span>
              <span style={S.metricSub}>{fmtDollar(topTrade.premium).replace('+', '')} · {topTrade.expiry?.slice(5) || ''} · {topTrade.tradeType === 'SWEEP' || topTrade.isSweep ? 'Sweep' : 'Block'}</span>
            </>
          ) : (
            <span style={S.metricValue(C.textMuted, 15)}>—</span>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════
          ★ INTERACTIVE LINE CHART (TradingView lightweight-charts)
          - Scroll left/right to pan through the day
          - Mouse wheel to zoom in/out  
          - Crosshair shows call/put values
          - Timeframe selector controls visible range
          ══════════════════════════════════════════════════════════ */}
      {hasLineData && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <OptionsFlowLineChart
            data={lineTimeSeries}
            timeframeRange={timeframeRange}
            height={280}
          />
        </div>
      )}



      {/* ── TOP TRADES TABLE ── */}
      {topTrades.length > 0 && (
        <div style={{ ...S.scrollArea, maxHeight: 108, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', fontFamily: FONT_MONO }}>
            <thead>
              <tr>
                {['Time', 'C/P', 'Strike', 'Exp', 'Premium', 'Type'].map(h => (
                  <th key={h} style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, textAlign: 'left', padding: '4px 10px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.cardBg }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topTrades.map((t, i) => (
                <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                  <td style={{ padding: '5px 10px', color: C.textSecondary, whiteSpace: 'nowrap' }}>{fmtTime(t.timestampMs)}</td>
                  <td style={{ padding: '5px 10px', color: t.callPut === 'C' ? C.green : C.red, fontWeight: 600 }}>{t.callPut}</td>
                  <td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>${t.strike}</td>
                  <td style={{ padding: '5px 10px', color: C.textSecondary }}>{t.expiry?.slice(5) || ''}</td>
                  <td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>{fmtDollar(t.premium).replace('+', '')}</td>
                  <td style={{ padding: '5px 10px' }}>
                    {(t.tradeType === 'SWEEP' || t.tradeType === 'INTERMARKET_SWEEP' || t.isSweep)
                      ? <span style={{ fontSize: 8, fontWeight: 700, padding: '1px 4px', borderRadius: 2, background: C.cyanDim, color: C.cyan }}>SWEEP</span>
                      : <span style={{ fontSize: 9, color: C.textMuted }}>{t.tradeType || 'BLOCK'}</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BOTTOM INSIGHT ── */}
      <div style={{ ...S.bottomStrip, flexShrink: 0 }}>
        <div style={S.dot(sweepInsight ? sweepInsight.color : C.textMuted)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}>
          {sweepInsight ? (
            <>
              <strong style={{ color: C.textPrimary, fontWeight: 600 }}>
                {sweepInsight.cp === 'C' ? 'Call' : 'Put'} sweep cluster
              </strong>{' '}
              at ${sweepInsight.strike} — {fmtDollar(sweepInsight.total).replace('+', '')} in {sweepInsight.count} sweeps
            </>
          ) : (
            <>
              <strong style={{ color: C.textPrimary, fontWeight: 600 }}>Flow:</strong>{' '}
              {m.flowBias === 'BULLISH' ? 'Call premium leading' : m.flowBias === 'BEARISH' ? 'Put premium dominant' : 'Balanced flow'} this session
            </>
          )}
        </span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>
          {timeframeRange?.label || 'Session'} · {ticker}
        </span>
      </div>
    </div>
  );
}
