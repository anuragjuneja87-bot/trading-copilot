'use client';

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import {
  PANEL_COLORS as C, FONT_MONO, setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   RELATIVE STRENGTH PANEL v3.3

   FIX: Badge thresholds now match API regime thresholds (±0.5)
   so "vs SPY: OUTPERFORM" and "Regime: INLINE" never contradict.
   Badge shows relative direction (▲/▼) not regime label.
   ════════════════════════════════════════════════════════════════ */

interface RelativeStrengthPanelProps {
  ticker: string;
  timeframeRange?: { from: number; to: number; label: string; isMarketClosed?: boolean; tradingDay?: string; };
}
interface RSDataPoint { time: string; timeMs: number; tickerPct: number; spyPct: number; qqqPct: number; rsVsSpy: number; rsVsQqq: number; }
interface RSSummary { tickerChange: number; spyChange: number; qqqChange: number; rsVsSpy: number; rsVsQqq: number; corrSpy: number; corrQqq: number; regime: string; session?: string; }

// Match API thresholds exactly: >1.5 STRONG_OUTPERFORM, >0.5 OUTPERFORM, >-0.5 INLINE, >-1.5 UNDERPERFORM, else STRONG_UNDERPERFORM
function classifyRegime(avgRS: number): string {
  if (avgRS > 1.5) return 'STRONG_OUTPERFORM';
  if (avgRS > 0.5) return 'OUTPERFORM';
  if (avgRS > -0.5) return 'INLINE';
  if (avgRS > -1.5) return 'UNDERPERFORM';
  return 'STRONG_UNDERPERFORM';
}

export function RelativeStrengthPanel({ ticker, timeframeRange }: RelativeStrengthPanelProps) {
  const [data, setData] = useState<RSDataPoint[]>([]);
  const [summary, setSummary] = useState<RSSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const filteredData = useMemo(() => {
    if (!data.length || !timeframeRange) return data;
    return data.filter(d => d.timeMs >= timeframeRange.from && d.timeMs <= timeframeRange.to);
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
    return { ...summary, tickerChange, spyChange, qqqChange, rsVsSpy, rsVsQqq, regime: classifyRegime(avgRS) };
  }, [filteredData, summary, timeframeRange, data.length]);

  const s = filteredSummary;
  const rsSpy = s?.rsVsSpy || 0;
  const rsQqq = s?.rsVsQqq || 0;
  const avgRS = (rsSpy + rsQqq) / 2;

  // Regime from API-aligned thresholds (always consistent)
  const regime = s?.regime || classifyRegime(avgRS);
  const regimeLabel = regime === 'STRONG_OUTPERFORM' ? 'LEADING' : regime === 'OUTPERFORM' ? 'OUTPERFORM' : regime === 'INLINE' ? 'INLINE' : regime === 'UNDERPERFORM' ? 'UNDERPERFORM' : 'LAGGING';
  const regimeColor = (regimeLabel === 'LEADING' || regimeLabel === 'OUTPERFORM') ? C.green : (regimeLabel === 'LAGGING' || regimeLabel === 'UNDERPERFORM') ? C.red : C.yellow;
  const regimeBg = regimeColor === C.green ? C.greenDim : regimeColor === C.red ? C.redDim : C.yellowDim;

  // Per-benchmark badges show DIRECTION (▲ leading / ▼ lagging) not regime
  const spyBadgeColor = rsSpy >= 0 ? C.green : C.red;
  const spyBadgeBg = rsSpy >= 0 ? C.greenDim : C.redDim;
  const spyBadge = rsSpy >= 0 ? '▲ LEADING' : '▼ LAGGING';
  const qqqBadgeColor = rsQqq >= 0 ? C.green : C.red;
  const qqqBadgeBg = rsQqq >= 0 ? C.greenDim : C.redDim;
  const qqqBadge = rsQqq >= 0 ? '▲ LEADING' : '▼ LAGGING';

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container || !filteredData.length) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 12, right: 48, bottom: 24, left: 44 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const N = filteredData.length; if (N < 2) return;
    const allVals = filteredData.flatMap(d => [d.tickerPct, d.spyPct, d.qqqPct]);
    const minVal = Math.min(...allVals), maxVal = Math.max(...allVals);
    const valRange = maxVal - minVal || 0.01;
    const padded = Math.max(valRange * 0.15, 0.02);
    const yMin = minVal - padded, yMax = maxVal + padded, yRange = yMax - yMin;
    const xPos = (i: number) => PAD.left + (i / (N - 1)) * cW;
    const yPos = (v: number) => PAD.top + (1 - (v - yMin) / yRange) * cH;
    ctx.clearRect(0, 0, W, H);
    drawGridLines(ctx, PAD, W, H);

    const zeroY = yPos(0);
    if (zeroY > PAD.top && zeroY < PAD.top + cH) {
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, Math.round(zeroY) + 0.5); ctx.lineTo(W - PAD.right, Math.round(zeroY) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    }

    const drawLine = (getData: (d: RSDataPoint) => number, color: string, width: number) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.beginPath();
      for (let i = 0; i < N; i++) { const y = yPos(getData(filteredData[i])); i === 0 ? ctx.moveTo(xPos(i), y) : ctx.lineTo(xPos(i), y); }
      ctx.stroke();
    };
    drawLine(d => d.spyPct, 'rgba(0,220,130,0.5)', 1.5);
    drawLine(d => d.qqqPct, 'rgba(167,139,250,0.5)', 1.5);
    drawLine(d => d.tickerPct, 'rgba(232,234,240,0.9)', 2.5);

    const last = filteredData[N - 1];
    const labelYs = [
      { y: yPos(last.tickerPct), label: ticker, color: C.textPrimary },
      { y: yPos(last.spyPct), label: 'SPY', color: 'rgba(0,220,130,0.6)' },
      { y: yPos(last.qqqPct), label: 'QQQ', color: 'rgba(167,139,250,0.6)' },
    ].sort((a, b) => a.y - b.y);
    for (let i = 1; i < labelYs.length; i++) { if (labelYs[i].y - labelYs[i - 1].y < 12) labelYs[i].y = labelYs[i - 1].y + 12; }
    ctx.font = `600 10px ${FONT_MONO}`; ctx.textAlign = 'left';
    labelYs.forEach(l => { ctx.fillStyle = l.color; ctx.fillText(l.label, W - PAD.right + 4, l.y + 3); });

    ctx.fillStyle = C.textMuted; ctx.font = `500 9px ${FONT_MONO}`; ctx.textAlign = 'center';
    const step = Math.max(Math.floor(N / 8), 1);
    for (let i = 0; i < N; i += step) { if (filteredData[i]?.time) ctx.fillText(filteredData[i].time, xPos(i), H - PAD.bottom + 14); }
    ctx.textAlign = 'right';
    for (let i = 0; i <= 4; i++) { const val = yMax - (i / 4) * yRange; const y = PAD.top + (i / 4) * cH; ctx.fillText(`${val >= 0 ? '+' : ''}${val.toFixed(2)}%`, PAD.left - 4, y + 3); }
  }, [filteredData, ticker]);

  useEffect(() => { drawChart(); }, [drawChart]);
  useEffect(() => { const c = containerRef.current; if (!c) return; const ro = new ResizeObserver(() => drawChart()); ro.observe(c); return () => ro.disconnect(); }, [drawChart]);

  if (loading && !data.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading RS data...</div></div>;
  if (error && !data.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!data.length) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>💪</span><span style={{ fontSize: 14, fontWeight: 600 }}>No RS Data</span></div></div>;

  return (
    <div style={S.panel}>
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}><span style={S.metricLabel}>{ticker} Change</span><span style={S.metricValue((s?.tickerChange || 0) >= 0 ? C.green : C.red, 15)}>{(s?.tickerChange || 0) >= 0 ? '+' : ''}{(s?.tickerChange || 0).toFixed(2)}%</span></div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>vs SPY</span><span style={S.metricValue(spyBadgeColor, 15)}>{rsSpy >= 0 ? '+' : ''}{rsSpy.toFixed(2)}%</span><div style={S.badge(spyBadgeColor, spyBadgeBg)}>{spyBadge}</div></div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>vs QQQ</span><span style={S.metricValue(qqqBadgeColor, 15)}>{rsQqq >= 0 ? '+' : ''}{rsQqq.toFixed(2)}%</span><div style={S.badge(qqqBadgeColor, qqqBadgeBg)}>{qqqBadge}</div></div>
        <div style={S.metricBlock(true)}><span style={S.metricLabel}>Regime</span><span style={S.metricValue(regimeColor, 15)}>{regimeLabel}</span><span style={S.metricSub}>Corr: {(s?.corrSpy || 0).toFixed(2)} SPY · {(s?.corrQqq || 0).toFixed(2)} QQQ</span></div>
      </div>

      <div ref={containerRef} style={{ ...S.chartArea, minHeight: 140 }}><canvas ref={canvasRef} style={S.canvas} /></div>

      <div style={{ borderTop: `1px solid ${C.border}`, padding: '6px 0', flexShrink: 0 }}>
        {[{ label: 'SPY', val: rsSpy, color: spyBadgeColor }, { label: 'QQQ', val: rsQqq, color: qqqBadgeColor }].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 14px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, fontFamily: FONT_MONO, width: 36, flexShrink: 0, color: C.textSecondary }}>{item.label}</span>
            <div style={{ flex: 1, height: 20, borderRadius: 4, background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: 1, background: 'rgba(255,255,255,0.15)' }} />
              {item.val >= 0 ? (
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', width: `${Math.min(Math.abs(item.val) * 20, 48)}%`, borderRadius: 4, background: `${item.color}33`, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: item.color }}>{`+${item.val.toFixed(2)}%`}</div>
              ) : (
                <div style={{ position: 'absolute', top: 0, bottom: 0, right: '50%', width: `${Math.min(Math.abs(item.val) * 20, 48)}%`, borderRadius: 4, background: `${item.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 8, fontSize: 10, fontWeight: 700, fontFamily: FONT_MONO, color: item.color }}>{`${item.val.toFixed(2)}%`}</div>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...S.bottomStrip, flexShrink: 0 }}>
        <div style={S.dot(regimeColor)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}><strong style={{ color: C.textPrimary, fontWeight: 600 }}>{regimeLabel}</strong>{' '}— relative strength {rsSpy >= 0 ? 'expanding' : 'contracting'} ({timeframeRange?.label || 'full session'})</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{ticker}</span>
      </div>
    </div>
  );
}
