'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { isMarketClosed, getLastTradingDay, formatTradingDay } from '@/lib/market-utils';
import {
  PANEL_COLORS as C, FONT_MONO, fmtVol,
  setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   VOLUME PRESSURE PANEL v3 — Canvas CVD, Session-Aware
   ════════════════════════════════════════════════════════════════ */

interface VolumePressurePanelProps {
  ticker: string;
  timeframeRange?: { from: number; to: number; label: string; isMarketClosed?: boolean; tradingDay?: string; };
}
interface TickBucket { time: string; timeMs: number; buyVolume: number; sellVolume: number; totalVolume: number; pressure: number; session?: 'pre' | 'rth' | 'post'; }
const ROLLING_WINDOW = 15;

export function VolumePressurePanel({ ticker, timeframeRange }: VolumePressurePanelProps) {
  const [data, setData] = useState<TickBucket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bucketLabel, setBucketLabel] = useState('1min buckets');
  const [sessionBounds, setSessionBounds] = useState<{ rthOpenIdx: number; rthCloseIdx: number }>({ rthOpenIdx: -1, rthCloseIdx: -1 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isClosed = isMarketClosed();
  const tradingDayStr = formatTradingDay(getLastTradingDay());
  const hasData = data.length > 0;
  const isStaleData = isClosed && hasData;

  useEffect(() => {
    const f = async () => {
      if (!ticker) return;
      setLoading(true);
      try {
        let url = `/api/market/volume-pressure?ticker=${ticker}`;
        if (timeframeRange) url += `&from=${timeframeRange.from}&to=${timeframeRange.to}`;
        const res = await fetch(url);
        const json = await res.json();
        if (json.success && json.data) {
          setData(json.data.buckets || []);
          if (json.data.bucketMinutes) setBucketLabel(`${json.data.bucketMinutes}min buckets`);
          if (json.data.sessionBoundaries) setSessionBounds(json.data.sessionBoundaries);
        } else setError(json.error || 'Failed to load');
      } catch (err: any) { setError(err.message); }
      finally { setLoading(false); }
    };
    f();
    const iv = setInterval(f, 60000);
    return () => clearInterval(iv);
  }, [ticker, timeframeRange]);

  const metrics = useMemo(() => {
    if (!data.length) return null;
    let cvd = 0; const cvdArr: number[] = []; let totalBuy = 0, totalSell = 0;
    data.forEach(d => { cvd += d.buyVolume - d.sellVolume; cvdArr.push(cvd); totalBuy += d.buyVolume; totalSell += d.sellVolume; });
    const totalVol = totalBuy + totalSell;
    const sessionPressure = totalVol > 0 ? Math.round(((totalBuy - totalSell) / totalVol) * 100) : 0;
    const recent = data.slice(-ROLLING_WINDOW);
    const rBuy = recent.reduce((s, d) => s + d.buyVolume, 0), rSell = recent.reduce((s, d) => s + d.sellVolume, 0);
    const rTotal = rBuy + rSell;
    const rollingPressure = rTotal > 0 ? Math.round(((rBuy - rSell) / rTotal) * 100) : 0;
    const trendDelta = rollingPressure - sessionPressure;
    const peakVal = Math.max(...cvdArr); const peakIdx = cvdArr.indexOf(peakVal);
    const currentCvd = cvdArr[cvdArr.length - 1] || 0;
    const mw = Math.min(30, cvdArr.length);
    const cvdMomentum = currentCvd - (cvdArr[cvdArr.length - mw] || 0);
    const buyPct = totalVol > 0 ? Math.round((totalBuy / totalVol) * 100) : 50;
    return { cvdArr, sessionPressure, rollingPressure, trendDelta, totalBuy: Math.round(totalBuy), totalSell: Math.round(totalSell), peakVal, peakIdx, peakTime: data[peakIdx]?.time || '', currentCvd, cvdMomentum, buyPct };
  }, [data]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current; const container = containerRef.current;
    if (!canvas || !container || !metrics || !data.length) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 12, right: 50, bottom: 24, left: 50 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const N = metrics.cvdArr.length; if (N < 2) return;
    const cvdMin = Math.min(...metrics.cvdArr), cvdMax = Math.max(...metrics.cvdArr);
    const range = cvdMax - cvdMin || 1, padded = range * 0.05;
    const yMin = cvdMin - padded, yMax = cvdMax + padded, yRange = yMax - yMin;
    const xPos = (i: number) => PAD.left + (i / (N - 1)) * cW;
    const yPos = (v: number) => PAD.top + (1 - (v - yMin) / yRange) * cH;
    const oIdx = sessionBounds.rthOpenIdx, cIdx = sessionBounds.rthCloseIdx;
    ctx.clearRect(0, 0, W, H);
    if (oIdx > 0) { ctx.fillStyle = C.indigo; ctx.fillRect(PAD.left, PAD.top, xPos(oIdx) - PAD.left, cH); }
    if (cIdx > 0 && cIdx < N - 1) { ctx.fillStyle = C.indigo; ctx.fillRect(xPos(cIdx), PAD.top, W - PAD.right - xPos(cIdx), cH); }
    drawGridLines(ctx, PAD, W, H);
    const zeroY = yPos(0); const zV = zeroY > PAD.top && zeroY < PAD.top + cH;
    if (zV) { ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(PAD.left, Math.round(zeroY) + 0.5); ctx.lineTo(W - PAD.right, Math.round(zeroY) + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.font = `500 9px ${FONT_MONO}`; ctx.textAlign = 'right'; ctx.fillText('0', PAD.left - 6, zeroY + 3); }
    [oIdx, cIdx].forEach(idx => { if (idx <= 0 || idx >= N) return; ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.setLineDash([4, 3]); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(Math.round(xPos(idx)) + 0.5, PAD.top); ctx.lineTo(Math.round(xPos(idx)) + 0.5, PAD.top + cH); ctx.stroke(); ctx.setLineDash([]); });
    const eZ = zV ? zeroY : (metrics.currentCvd >= 0 ? PAD.top + cH : PAD.top);
    if (zV) {
      ctx.beginPath(); ctx.moveTo(xPos(0), eZ); for (let i = 0; i < N; i++) ctx.lineTo(xPos(i), Math.min(yPos(metrics.cvdArr[i]), eZ)); ctx.lineTo(xPos(N - 1), eZ); ctx.closePath();
      const gU = ctx.createLinearGradient(0, PAD.top, 0, eZ); gU.addColorStop(0, 'rgba(0,220,130,0.18)'); gU.addColorStop(1, 'rgba(0,220,130,0.02)'); ctx.fillStyle = gU; ctx.fill();
      ctx.beginPath(); ctx.moveTo(xPos(0), eZ); for (let i = 0; i < N; i++) ctx.lineTo(xPos(i), Math.max(yPos(metrics.cvdArr[i]), eZ)); ctx.lineTo(xPos(N - 1), eZ); ctx.closePath();
      const gD = ctx.createLinearGradient(0, eZ, 0, PAD.top + cH); gD.addColorStop(0, 'rgba(255,71,87,0.02)'); gD.addColorStop(1, 'rgba(255,71,87,0.18)'); ctx.fillStyle = gD; ctx.fill();
    }
    for (let i = 0; i < N - 1; i++) {
      const sess = data[i].session; const lw = sess === 'rth' ? 3 : 1.5; const op = sess === 'rth' ? 0.9 : 0.4;
      const v1 = metrics.cvdArr[i], v2 = metrics.cvdArr[i + 1];
      if ((v1 >= 0 && v2 >= 0) || (v1 < 0 && v2 < 0)) { ctx.strokeStyle = v1 >= 0 ? `rgba(0,220,130,${op})` : `rgba(255,71,87,${op})`; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(xPos(i), yPos(v1)); ctx.lineTo(xPos(i + 1), yPos(v2)); ctx.stroke(); }
      else { const t = v1 / (v1 - v2); const xM = xPos(i) + t * (xPos(i + 1) - xPos(i)); const yM = zV ? zeroY : (yPos(v1) + yPos(v2)) / 2; ctx.strokeStyle = v1 >= 0 ? `rgba(0,220,130,${op})` : `rgba(255,71,87,${op})`; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(xPos(i), yPos(v1)); ctx.lineTo(xM, yM); ctx.stroke(); ctx.strokeStyle = v2 >= 0 ? `rgba(0,220,130,${op})` : `rgba(255,71,87,${op})`; ctx.beginPath(); ctx.moveTo(xM, yM); ctx.lineTo(xPos(i + 1), yPos(v2)); ctx.stroke(); }
    }
    if (metrics.peakIdx >= 0) { const px = xPos(metrics.peakIdx), py = yPos(metrics.peakVal); ctx.fillStyle = C.green; ctx.beginPath(); ctx.moveTo(px, py - 4); ctx.lineTo(px + 3, py); ctx.lineTo(px, py + 4); ctx.lineTo(px - 3, py); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(0,220,130,0.5)'; ctx.font = `600 8px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.fillText('Peak', px, py - 8); }
    const lX = xPos(N - 1), lY = yPos(metrics.currentCvd), lC = metrics.currentCvd >= 0 ? C.green : C.red;
    ctx.beginPath(); ctx.arc(lX, lY, 7, 0, Math.PI * 2); ctx.fillStyle = metrics.currentCvd >= 0 ? 'rgba(0,220,130,0.12)' : 'rgba(255,71,87,0.12)'; ctx.fill();
    ctx.beginPath(); ctx.arc(lX, lY, 3.5, 0, Math.PI * 2); ctx.fillStyle = lC; ctx.fill();
    ctx.fillStyle = lC; ctx.font = `700 11px ${FONT_MONO}`; ctx.textAlign = 'left'; ctx.fillText(fmtVol(metrics.currentCvd), W - PAD.right + 6, lY + 4);
    ctx.fillStyle = C.textMuted; ctx.font = `500 10px ${FONT_MONO}`; ctx.textAlign = 'right';
    for (let i = 0; i <= 5; i++) { const val = yMax - (i / 5) * yRange; const y = PAD.top + (i / 5) * cH; if (Math.abs(val) > yRange * 0.04) ctx.fillText(fmtVol(val), PAD.left - 6, y + 4); }
    ctx.fillStyle = C.textMuted; ctx.font = `500 9px ${FONT_MONO}`; ctx.textAlign = 'center';
    const ls = Math.max(Math.floor(N / 10), 1); for (let i = 0; i < N; i += ls) { if (data[i]?.time) ctx.fillText(data[i].time, xPos(i), H - PAD.bottom + 14); }
  }, [metrics, data, sessionBounds]);

  useEffect(() => { drawChart(); }, [drawChart]);
  useEffect(() => { const c = containerRef.current; if (!c) return; const ro = new ResizeObserver(() => drawChart()); ro.observe(c); return () => ro.disconnect(); }, [drawChart]);

  const sp = metrics?.sessionPressure || 0, rp = metrics?.rollingPressure || 0, td = metrics?.trendDelta || 0, bp = metrics?.buyPct || 50;
  const pLabel = sp > 10 ? 'BUYERS' : sp < -10 ? 'SELLERS' : 'BALANCED';
  const pColor = sp > 10 ? C.green : sp < -10 ? C.red : C.yellow;
  const pBg = sp > 10 ? C.greenDim : sp < -10 ? C.redDim : C.yellowDim;
  const tLabel = td > 8 ? '↑ ACCEL' : td < -8 ? '↓ FADING' : '→ STEADY';
  const tColor = td > 8 ? C.green : td < -8 ? C.red : C.textSecondary;
  const tBg = td > 8 ? C.greenDim : td < -8 ? C.redDim : 'rgba(255,255,255,0.05)';
  const cvdM = metrics?.cvdMomentum || 0;

  if (loading && !hasData) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading volume data...</div></div>;
  if (error && !hasData) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.red, fontSize: 13 }}>{error}</div></div>;
  if (!hasData) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>📊</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Volume Data</span></div></div>;

  return (
    <div style={S.panel}>
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Session Pressure</span><span style={S.metricValue(pColor)}>{sp > 0 ? '+' : ''}{sp}%</span><div style={S.badge(pColor, pBg)}>● {pLabel}</div></div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Buy / Sell</span>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={S.metricValue(C.green, 13)}>{fmtVol(metrics?.totalBuy || 0)}</span><span style={{ color: C.textMuted, fontSize: 11 }}>/</span><span style={S.metricValue(C.red, 13)}>{fmtVol(metrics?.totalSell || 0)}</span></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}><div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${bp}%`, borderRadius: 2, background: C.green, opacity: 0.7 }} /></div>
            <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: bp >= 50 ? C.green : C.red, minWidth: 28, textAlign: 'right' as const }}>{bp}%</span>
          </div>
        </div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Last {ROLLING_WINDOW} min</span><span style={S.metricValue(tColor)}>{rp > 0 ? '+' : ''}{rp}%</span><div style={S.badge(tColor, tBg)}>{tLabel}</div></div>
        <div style={S.metricBlock(true)}><span style={S.metricLabel}>CVD</span><span style={S.metricValue(metrics?.currentCvd && metrics.currentCvd >= 0 ? C.green : C.red)}>{metrics?.currentCvd && metrics.currentCvd > 0 ? '+' : ''}{fmtVol(metrics?.currentCvd || 0)}</span><span style={S.metricSub}>Peak: {fmtVol(metrics?.peakVal || 0)} at {metrics?.peakTime || ''}</span></div>
      </div>
      <div ref={containerRef} style={S.chartArea}>
        {isStaleData && <div style={S.staleTag}><div style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: C.yellow, border: '1px solid rgba(251,191,36,0.2)' }}>⚠ {tradingDayStr} · Market Closed</div></div>}
        <canvas ref={canvasRef} style={S.canvas} />
      </div>
      <div style={S.bottomStrip}>
        <div style={S.dot(cvdM >= 0 ? C.green : C.red)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}><strong style={{ color: C.textPrimary, fontWeight: 600 }}>Momentum:</strong> {cvdM >= 0 ? `CVD rising +${fmtVol(cvdM)} over last 30 bars — buying pressure intact` : `CVD falling ${fmtVol(cvdM)} over last 30 bars — selling pressure building`}</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{bucketLabel} · {ticker}</span>
      </div>
    </div>
  );
}
