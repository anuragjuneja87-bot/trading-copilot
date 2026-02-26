'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  PANEL_COLORS as C, FONT_MONO, panelStyles as S,
} from '@/lib/panel-design-system';
import { RSLineChart } from './rs-line-chart';

/* ════════════════════════════════════════════════════════════════
   RELATIVE STRENGTH PANEL v4.0

   Uses lightweight-charts RSLineChart for interactive comparison:
   - Ticker (white), SPY (green), QQQ (purple) lines
   - Mouse wheel zoom + drag to pan
   - Crosshair shows all three values
   - Timeframe controls visible range
   
   Spread bars + regime metrics remain unchanged.
   ════════════════════════════════════════════════════════════════ */

interface RelativeStrengthPanelProps {
  ticker: string;
  timeframeRange?: { from: number; to: number; label: string; isMarketClosed?: boolean; tradingDay?: string; };
}
interface RSDataPoint { time: string; timeMs: number; tickerPct: number; spyPct: number; qqqPct: number; rsVsSpy: number; rsVsQqq: number; }
interface RSSummary { tickerChange: number; spyChange: number; qqqChange: number; rsVsSpy: number; rsVsQqq: number; corrSpy: number; corrQqq: number; regime: string; session?: string; }

export function RelativeStrengthPanel({ ticker, timeframeRange }: RelativeStrengthPanelProps) {
  const [data, setData] = useState<RSDataPoint[]>([]);
  const [summary, setSummary] = useState<RSSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    const fetchRS = async () => {
      setLoading(true); setError(null);
      try {
        const res = await fetch(`/api/market/relative-strength?ticker=${ticker}&_t=${Date.now()}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.success && json.data) { setData(json.data.rsTimeSeries || []); setSummary(json.data.summary || null); }
        else setError(json.error || 'Failed to fetch');
      } catch (err: any) { setError(err.message); }
      finally { setLoading(false); }
    };
    fetchRS();
    const iv = setInterval(fetchRS, 60000);
    return () => clearInterval(iv);
  }, [ticker]);

  // Filter data to timeframe, fall back to full data if < 3 points
  const filteredData = useMemo(() => {
    if (!data.length) return data;
    if (!timeframeRange) return data;
    const filtered = data.filter(d => d.timeMs >= timeframeRange.from && d.timeMs <= timeframeRange.to);
    if (filtered.length < 3) return data;
    return filtered;
  }, [data, timeframeRange]);

  const isShowingFullData = useMemo(() => {
    if (!timeframeRange || !data.length) return true;
    const filtered = data.filter(d => d.timeMs >= timeframeRange.from && d.timeMs <= timeframeRange.to);
    return filtered.length < 3;
  }, [data, timeframeRange]);

  const filteredSummary = useMemo((): RSSummary | null => {
    if (!filteredData.length || !summary) return summary;
    if (!timeframeRange || filteredData.length === data.length) return summary;
    const last = filteredData[filteredData.length - 1], first = filteredData[0];
    const tickerChange = last.tickerPct - first.tickerPct;
    const spyChange = last.spyPct - first.spyPct;
    const qqqChange = last.qqqPct - first.qqqPct;
    const rsVsSpy = Math.round((tickerChange - spyChange) * 100) / 100;
    const rsVsQqq = Math.round((tickerChange - qqqChange) * 100) / 100;
    const avgRS = (rsVsSpy + rsVsQqq) / 2;
    let regime: string;
    if (avgRS > 0.3) regime = 'STRONG_OUTPERFORM';
    else if (avgRS > 0.05) regime = 'OUTPERFORM';
    else if (avgRS > -0.05) regime = 'INLINE';
    else if (avgRS > -0.3) regime = 'UNDERPERFORM';
    else regime = 'STRONG_UNDERPERFORM';
    return { ...summary, tickerChange, spyChange, qqqChange, rsVsSpy, rsVsQqq, regime };
  }, [filteredData, summary, timeframeRange, data.length]);

  const s = filteredSummary;
  const regimeLabel = !s ? '—' : s.regime === 'STRONG_OUTPERFORM' ? 'LEADING' : s.regime === 'OUTPERFORM' ? 'OUTPERFORM' : s.regime === 'INLINE' ? 'INLINE' : s.regime === 'UNDERPERFORM' ? 'UNDERPERFORM' : 'LAGGING';
  const regimeColor = !s ? C.textMuted : (regimeLabel === 'LEADING' || regimeLabel === 'OUTPERFORM') ? C.green : (regimeLabel === 'LAGGING' || regimeLabel === 'UNDERPERFORM') ? C.red : C.yellow;
  const regimeBg = regimeColor === C.green ? C.greenDim : regimeColor === C.red ? C.redDim : C.yellowDim;
  const rsSpy = s?.rsVsSpy || 0;
  const rsQqq = s?.rsVsQqq || 0;
  const rsSpyColor = rsSpy >= 0 ? C.green : C.red;
  const rsSpyBg = rsSpy >= 0 ? C.greenDim : C.redDim;
  const rsSpyLabel = rsSpy >= 0 ? 'OUTPERFORM' : 'UNDERPERFORM';
  const rsQqqColor = rsQqq >= 0 ? C.green : C.red;
  const rsQqqBg = rsQqq >= 0 ? C.greenDim : C.redDim;
  const rsQqqLabel = rsQqq >= 0 ? 'OUTPERFORM' : 'UNDERPERFORM';

  if (loading && !data.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading RS data...</div></div>;
  if (error && !data.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!data.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>💪</span><span style={{ fontSize: 14, fontWeight: 600 }}>No RS Data</span></div></div>;

  return (
    <div style={S.panel}>
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>{ticker} Change</span>
          <span style={S.metricValue((s?.tickerChange || 0) >= 0 ? C.green : C.red, 15)}>{(s?.tickerChange || 0) >= 0 ? '+' : ''}{(s?.tickerChange || 0).toFixed(2)}%</span>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>vs SPY</span>
          <span style={S.metricValue(rsSpyColor, 15)}>{rsSpy >= 0 ? '+' : ''}{rsSpy.toFixed(2)}%</span>
          <div style={S.badge(rsSpyColor, rsSpyBg)}>{rsSpyLabel}</div>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>vs QQQ</span>
          <span style={S.metricValue(rsQqqColor, 15)}>{rsQqq >= 0 ? '+' : ''}{rsQqq.toFixed(2)}%</span>
          <div style={S.badge(rsQqqColor, rsQqqBg)}>{rsQqqLabel}</div>
        </div>
        <div style={S.metricBlock(true)}>
          <span style={S.metricLabel}>Regime</span>
          <span style={S.metricValue(regimeColor, 15)}>{regimeLabel}</span>
          <span style={S.metricSub}>Corr: {(s?.corrSpy || 0).toFixed(2)} SPY · {(s?.corrQqq || 0).toFixed(2)} QQQ</span>
        </div>
      </div>

      {/* ★ INTERACTIVE RS CHART */}
      <div style={{ borderTop: `1px solid ${C.border}` }}>
        <RSLineChart
          data={filteredData}
          ticker={ticker}
          timeframeRange={timeframeRange}
          height={140}
        />
      </div>

      {/* RS Spread Bars */}
      <div style={{ borderTop: `1px solid ${C.border}`, padding: '6px 0' }}>
        {[{ label: 'SPY', val: rsSpy, color: rsSpyColor }, { label: 'QQQ', val: rsQqq, color: rsQqqColor }].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: FONT_MONO, width: 36, flexShrink: 0, color: C.textSecondary }}>{item.label}</span>
            <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.15)' }} />
              {item.val >= 0 ? (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: `${Math.min(Math.abs(item.val) * 20, 48)}%`, borderRadius: 4, background: `${item.color}33`, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: item.color }}>
                  +{item.val.toFixed(2)}%
                </div>
              ) : (
                <div style={{ position: 'absolute', top: 0, bottom: 0, right: '50%', width: `${Math.min(Math.abs(item.val) * 20, 48)}%`, borderRadius: 4, background: `${item.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: item.color }}>
                  {item.val.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={S.bottomStrip}>
        <div style={S.dot(regimeColor)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}>
          <strong style={{ color: C.textPrimary, fontWeight: 600 }}>
            {regimeLabel === 'LEADING' || regimeLabel === 'OUTPERFORM' ? `Leading ${rsSpy > rsQqq ? 'SPY' : 'QQQ'}` : regimeLabel === 'LAGGING' || regimeLabel === 'UNDERPERFORM' ? `Lagging ${Math.abs(rsSpy) > Math.abs(rsQqq) ? 'SPY' : 'QQQ'}` : 'Tracking inline'}
          </strong>{' '}— relative strength {rsSpy >= 0 ? 'expanding' : 'contracting'}
          {isShowingFullData && timeframeRange ? ' (full session)' : ''}
        </span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{ticker}</span>
      </div>
    </div>
  );
}
