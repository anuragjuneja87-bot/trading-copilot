'use client';

import { useState, useEffect, useMemo } from 'react';
import { isMarketClosed, getLastTradingDay, formatTradingDay } from '@/lib/market-utils';
import {
  PANEL_COLORS as C, FONT_MONO, fmtVol, panelStyles as S,
} from '@/lib/panel-design-system';
import { CVDLineChart } from './cvd-line-chart';

/* ════════════════════════════════════════════════════════════════
   VOLUME PRESSURE PANEL v4.0

   Uses lightweight-charts CVDLineChart for interactive CVD chart:
   - Baseline series: green above zero, red below zero
   - Mouse wheel zoom + drag to pan
   - Crosshair with CVD value tooltip
   - Timeframe controls visible range
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}><div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${bp}%`, borderRadius: 2, background: C.green, opacity: 0.7 }} /></div><span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, color: bp >= 50 ? C.green : C.red, minWidth: 28, textAlign: 'right' as const }}>{bp}%</span></div>
        </div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Last {ROLLING_WINDOW} min</span><span style={S.metricValue(tColor)}>{rp > 0 ? '+' : ''}{rp}%</span><div style={S.badge(tColor, tBg)}>{tLabel}</div></div>
        <div style={S.metricBlock(true)}><span style={S.metricLabel}>CVD</span><span style={S.metricValue(metrics?.currentCvd && metrics.currentCvd >= 0 ? C.green : C.red)}>{metrics?.currentCvd && metrics.currentCvd > 0 ? '+' : ''}{fmtVol(metrics?.currentCvd || 0)}</span><span style={S.metricSub}>Peak: {fmtVol(metrics?.peakVal || 0)} at {metrics?.peakTime || ''}</span></div>
      </div>

      {/* ★ INTERACTIVE CVD CHART */}
      <div style={{ borderTop: `1px solid ${C.border}`, position: 'relative' }}>
        {isStaleData && (
          <div style={{ ...S.staleTag, zIndex: 2 }}>
            <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: C.yellow, border: '1px solid rgba(251,191,36,0.2)' }}>⚠ {tradingDayStr} · Market Closed</div>
          </div>
        )}
        <CVDLineChart data={data} timeframeRange={timeframeRange} sessionBounds={sessionBounds} height={150} />
      </div>

      <div style={{ ...S.bottomStrip, flexShrink: 0 }}>
        <div style={S.dot(cvdM >= 0 ? C.green : C.red)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}><strong style={{ color: C.textPrimary, fontWeight: 600 }}>Momentum:</strong> {cvdM >= 0 ? `CVD rising +${fmtVol(cvdM)} over last 30 bars — buying pressure intact` : `CVD falling ${fmtVol(cvdM)} over last 30 bars — selling pressure building`}</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{bucketLabel} · {ticker}</span>
      </div>
    </div>
  );
}
