'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { isMarketClosed, getLastTradingDay, formatTradingDay } from '@/lib/market-utils';
import {
  PANEL_COLORS as C, FONT_MONO, fmtTime,
  setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   DARK POOL PANEL v3.2

   FIX: ticker prop passed explicitly from page.tsx for reliable
   independent full-session fetch. Adaptive Y-axis formatting.
   ════════════════════════════════════════════════════════════════ */

interface DarkPoolPanelProps {
  ticker: string;                    // ★ REQUIRED
  prints: any[];
  stats: any;
  loading: boolean;
  error: string | null;
  currentPrice: number;
  vwap: number | null;
  timeframeRange?: { from: number; to: number; label: string; isMarketClosed: boolean; tradingDay?: string; };
  meta?: { isMarketClosed?: boolean; tradingDay?: string; dataFrom?: string; dataTo?: string; };
}

function fmtValue(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

function fmtPriceAxis(price: number, priceRange: number): string {
  if (priceRange < 2) return `$${price.toFixed(2)}`;
  if (priceRange < 10) return `$${price.toFixed(1)}`;
  return `$${price.toFixed(0)}`;
}

export function DarkPoolPanel({
  ticker, prints, stats, loading, error, currentPrice, vwap, timeframeRange, meta,
}: DarkPoolPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isClosed = isMarketClosed() || timeframeRange?.isMarketClosed || meta?.isMarketClosed;
  const tradingDayStr = formatTradingDay(getLastTradingDay());

  /* ── Independent full-session fetch using TICKER PROP ── */
  const [fullSessionPrints, setFullSessionPrints] = useState<any[]>([]);
  useEffect(() => {
    if (!ticker) return;
    const fetchFull = async () => {
      try {
        const res = await fetch(`/api/darkpool?tickers=${ticker}&limit=200&_t=${Date.now()}`, { cache: 'no-store' });
        const json = await res.json();
        if (json.data?.prints?.length) setFullSessionPrints(json.data.prints);
      } catch { /* fall back */ }
    };
    fetchFull();
    const iv = setInterval(fetchFull, 60000);
    return () => clearInterval(iv);
  }, [ticker]);

  // Chart uses full session; metrics/table use parent data
  const chartPrints = fullSessionPrints.length > prints.length ? fullSessionPrints : prints;

  const regime = stats?.regime || 'NEUTRAL';
  const regimeColor = regime === 'ACCUMULATION' ? C.green : regime === 'DISTRIBUTION' ? C.red : C.yellow;
  const regimeBg = regime === 'ACCUMULATION' ? C.greenDim : regime === 'DISTRIBUTION' ? C.redDim : C.yellowDim;

  const computed = useMemo(() => {
    if (!prints.length) return null;
    const totalValue = prints.reduce((sum: number, p: any) => sum + (p.value || p.price * (p.size || 0)), 0);
    const totalShares = prints.reduce((sum: number, p: any) => sum + (p.size || 0), 0);
    const avgPrice = totalShares > 0 ? totalValue / totalShares : 0;
    const dpVsVwap = vwap && avgPrice ? (avgPrice > vwap ? 'ABOVE' : 'BELOW') : null;
    const largest = prints.reduce((best: any, p: any) => { const v = p.value || p.price * (p.size || 0); const bv = best.value || best.price * (best.size || 0); return v > bv ? p : best; }, prints[0]);
    const largestValue = largest.value || largest.price * (largest.size || 0);
    const largestTs = largest.timestamp || largest.timestampMs;
    const aboveVwapValue = vwap ? prints.reduce((sum: number, p: any) => p.price >= vwap ? sum + (p.value || p.price * (p.size || 0)) : sum, 0) : 0;
    const aboveVwapPct = totalValue > 0 ? Math.round((aboveVwapValue / totalValue) * 100) : 50;
    return { totalValue, avgPrice, dpVsVwap, largest, largestValue, largestTs, aboveVwapPct, printCount: prints.length };
  }, [prints, vwap]);

  const topPrints = useMemo(() => [...prints].map(p => ({ ...p, _value: p.value || p.price * (p.size || 0) })).sort((a, b) => b._value - a._value).slice(0, 5), [prints]);

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container || !chartPrints.length) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 12, right: 54, bottom: 26, left: 54 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const validPrints = chartPrints.filter((p: any) => p.price > 0 && (p.timestamp || p.timestampMs));
    if (validPrints.length < 1) return;

    const prices = validPrints.map((p: any) => p.price);
    const minPrice = Math.min(...prices), maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 0.01;
    const pricePad = Math.max(priceRange * 0.1, 0.1);
    const timestamps = validPrints.map((p: any) => p.timestampMs || new Date(p.timestamp).getTime());
    const minTime = Math.min(...timestamps), maxTime = Math.max(...timestamps);
    const timeRange = maxTime - minTime || 1;
    const values = validPrints.map((p: any) => p.value || p.price * (p.size || 0));
    const maxVal = Math.max(...values, 1);
    const xPos = (ts: number) => PAD.left + ((ts - minTime) / timeRange) * cW;
    const yPos = (price: number) => PAD.top + (1 - (price - (minPrice - pricePad)) / (priceRange + pricePad * 2)) * cH;

    ctx.clearRect(0, 0, W, H);
    drawGridLines(ctx, PAD, W, H);

    // VWAP line
    if (vwap && vwap >= minPrice - pricePad && vwap <= maxPrice + pricePad) {
      const vwapY = yPos(vwap);
      ctx.strokeStyle = 'rgba(0,229,255,0.3)'; ctx.setLineDash([5, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, Math.round(vwapY) + 0.5); ctx.lineTo(W - PAD.right, Math.round(vwapY) + 0.5); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(0,229,255,0.5)'; ctx.font = `600 9px ${FONT_MONO}`; ctx.textAlign = 'left';
      ctx.fillText(`VWAP ${fmtPriceAxis(vwap, priceRange)}`, W - PAD.right + 4, vwapY + 3);
    }

    // Current price line
    if (currentPrice && currentPrice >= minPrice - pricePad && currentPrice <= maxPrice + pricePad) {
      const priceY = yPos(currentPrice);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(PAD.left, Math.round(priceY) + 0.5); ctx.lineTo(W - PAD.right, Math.round(priceY) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    }

    // Scatter dots
    validPrints.forEach((p: any) => {
      const ts = p.timestampMs || new Date(p.timestamp).getTime();
      const val = p.value || p.price * (p.size || 0);
      const x = xPos(ts), y = yPos(p.price);
      const radius = Math.max(3, Math.min(14, Math.sqrt(val / maxVal) * 14));
      const aboveVwap = vwap ? p.price >= vwap : true;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = aboveVwap ? 'rgba(0,220,130,0.25)' : 'rgba(255,71,87,0.25)'; ctx.fill();
      ctx.strokeStyle = aboveVwap ? 'rgba(0,220,130,0.5)' : 'rgba(255,71,87,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    });

    // X-axis labels
    ctx.fillStyle = C.textMuted; ctx.font = `500 9px ${FONT_MONO}`; ctx.textAlign = 'center';
    const hourMs = 3_600_000;
    const startHour = new Date(minTime); startHour.setMinutes(0, 0, 0);
    for (let ts = startHour.getTime(); ts <= maxTime + hourMs; ts += hourMs) {
      if (ts < minTime) continue;
      const x = xPos(ts); if (x < PAD.left || x > W - PAD.right) continue;
      ctx.fillText(new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' }).toLowerCase().replace(' ', ''), x, H - PAD.bottom + 14);
    }

    // Y-axis — adaptive
    ctx.textAlign = 'right';
    const pMin = minPrice - pricePad, pMax = maxPrice + pricePad, pRange = pMax - pMin;
    for (let i = 0; i <= 5; i++) { const price = pMax - (i / 5) * pRange; const y = PAD.top + (i / 5) * cH; ctx.fillText(fmtPriceAxis(price, pRange), PAD.left - 6, y + 3); }
  }, [chartPrints, vwap, currentPrice]);

  useEffect(() => { drawChart(); }, [drawChart]);
  useEffect(() => { const c = containerRef.current; if (!c) return; const ro = new ResizeObserver(() => drawChart()); ro.observe(c); return () => ro.disconnect(); }, [drawChart]);

  if (loading && !stats) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading dark pool data...</div></div>;
  if (!stats && !loading) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>🏦</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Dark Pool Data</span></div></div>;

  return (
    <div style={S.panel}>
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Regime</span><span style={S.metricValue(regimeColor, 15)}>{regime === 'ACCUMULATION' ? 'ACCUM' : regime === 'DISTRIBUTION' ? 'DISTRIB' : regime}</span><div style={S.badge(regimeColor, regimeBg)}>● {regime}</div></div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Block Value</span><span style={S.metricValue(C.textPrimary, 15)}>{computed ? fmtValue(computed.totalValue) : '—'}</span><span style={S.metricSub}>{computed?.printCount || 0} prints today</span></div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Avg vs VWAP</span><span style={S.metricValue(computed?.dpVsVwap === 'ABOVE' ? C.green : computed?.dpVsVwap === 'BELOW' ? C.red : C.textMuted, 15)}>{computed?.dpVsVwap || '—'}</span><span style={S.metricSub}>{computed?.avgPrice ? `$${computed.avgPrice.toFixed(2)} avg` : ''}{vwap ? ` / $${vwap.toFixed(2)} VWAP` : ''}</span></div>
        <div style={S.metricBlock(true)}><span style={S.metricLabel}>Largest</span><span style={S.metricValue(C.textPrimary, 15)}>{computed ? fmtValue(computed.largestValue) : '—'}</span><span style={S.metricSub}>{computed?.largest ? `@ $${computed.largest.price?.toFixed(2)} · ${fmtTime(computed.largestTs)}` : ''}</span></div>
      </div>

      <div ref={containerRef} style={{ ...S.chartArea, minHeight: 120 }}>
        {isClosed && <div style={S.staleTag}><div style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: C.yellow, border: '1px solid rgba(251,191,36,0.2)' }}>⚠ {tradingDayStr} · Market Closed</div></div>}
        <canvas ref={canvasRef} style={S.canvas} />
      </div>

      {topPrints.length > 0 && (
        <div style={{ ...S.scrollArea, maxHeight: 108, borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', fontFamily: FONT_MONO }}>
            <thead><tr>{['Time', 'Price', 'Shares', 'Value', 'vs VWAP'].map(h => (<th key={h} style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, textAlign: 'left', padding: '4px 10px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.cardBg }}>{h}</th>))}</tr></thead>
            <tbody>{topPrints.map((p, i) => {
              const ts = p.timestampMs || (p.timestamp ? new Date(p.timestamp).getTime() : 0);
              const vsVwap = vwap && p.price ? ((p.price - vwap) / vwap * 100) : null;
              return (<tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}><td style={{ padding: '5px 10px', color: C.textSecondary, whiteSpace: 'nowrap' }}>{ts ? fmtTime(ts) : '—'}</td><td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>${p.price?.toFixed(2)}</td><td style={{ padding: '5px 10px', color: C.textSecondary }}>{(p.size || 0).toLocaleString()}</td><td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>{fmtValue(p._value)}</td><td style={{ padding: '5px 10px', color: vsVwap !== null ? (vsVwap >= 0 ? C.green : C.red) : C.textMuted }}>{vsVwap !== null ? `${vsVwap >= 0 ? '+' : ''}${vsVwap.toFixed(2)}%` : '—'}</td></tr>);
            })}</tbody>
          </table>
        </div>
      )}

      <div style={{ ...S.bottomStrip, flexShrink: 0 }}>
        <div style={S.dot(regimeColor)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}><strong style={{ color: C.textPrimary, fontWeight: 600 }}>{regime === 'ACCUMULATION' ? 'Accumulation cluster' : regime === 'DISTRIBUTION' ? 'Distribution pattern' : 'Neutral positioning'}</strong>{' '}— {computed?.aboveVwapPct || 50}% of block value {(computed?.aboveVwapPct || 50) >= 50 ? 'above' : 'below'} VWAP</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{computed?.printCount || 0} prints · {ticker}</span>
      </div>
    </div>
  );
}
