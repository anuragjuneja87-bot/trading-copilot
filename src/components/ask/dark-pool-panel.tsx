'use client';

import { useMemo, useRef, useEffect, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { isMarketClosed, getLastTradingDay, formatTradingDay } from '@/lib/market-utils';
import {
  PANEL_COLORS as C, FONT_MONO, fmtVol, fmtTime,
  setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   DARK POOL PANEL v3 — Canvas Scatter + Top Prints Table
   
   Metrics strip: Regime | Block Value | Avg vs VWAP | Largest
   Chart: Scatter (bubble size = value, green above VWAP, red below)
   Table: Top 5 prints by value
   Insight: Accumulation/distribution clustering
   ════════════════════════════════════════════════════════════════ */

interface DarkPoolPanelProps {
  prints: any[];
  stats: any;
  loading: boolean;
  error: string | null;
  currentPrice: number;
  vwap: number | null;
  timeframeRange?: {
    from: number;
    to: number;
    label: string;
    isMarketClosed: boolean;
    tradingDay?: string;
  };
  meta?: {
    isMarketClosed?: boolean;
    tradingDay?: string;
    dataFrom?: string;
    dataTo?: string;
  };
}

function fmtValue(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
}

export function DarkPoolPanel({
  prints,
  stats,
  loading,
  error,
  currentPrice,
  vwap,
  timeframeRange,
  meta,
}: DarkPoolPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isClosed = isMarketClosed() || timeframeRange?.isMarketClosed || meta?.isMarketClosed;
  const lastTradingDay = getLastTradingDay();
  const tradingDayStr = formatTradingDay(lastTradingDay);

  const regime = stats?.regime || 'NEUTRAL';
  const regimeColor = regime === 'ACCUMULATION' ? C.green : regime === 'DISTRIBUTION' ? C.red : C.yellow;
  const regimeBg = regime === 'ACCUMULATION' ? C.greenDim : regime === 'DISTRIBUTION' ? C.redDim : C.yellowDim;

  // ── Computed metrics ──
  const computed = useMemo(() => {
    if (!prints.length) return null;

    const totalValue = prints.reduce((sum: number, p: any) => sum + (p.value || p.price * (p.size || 0)), 0);
    const totalShares = prints.reduce((sum: number, p: any) => sum + (p.size || 0), 0);
    const avgPrice = totalShares > 0 ? totalValue / totalShares : 0;
    const dpVsVwap = vwap && avgPrice ? (avgPrice > vwap ? 'ABOVE' : 'BELOW') : null;

    // Largest print
    const largest = prints.reduce((best: any, p: any) => {
      const v = p.value || p.price * (p.size || 0);
      const bv = best.value || best.price * (best.size || 0);
      return v > bv ? p : best;
    }, prints[0]);
    const largestValue = largest.value || largest.price * (largest.size || 0);
    const largestTs = largest.timestamp || largest.timestampMs;

    // % above VWAP
    const aboveVwapValue = vwap ? prints.reduce((sum: number, p: any) => {
      if (p.price >= vwap) return sum + (p.value || p.price * (p.size || 0));
      return sum;
    }, 0) : 0;
    const aboveVwapPct = totalValue > 0 ? Math.round((aboveVwapValue / totalValue) * 100) : 50;

    return {
      totalValue, avgPrice, dpVsVwap, largest, largestValue, largestTs,
      aboveVwapPct, printCount: prints.length,
    };
  }, [prints, vwap]);

  // ── Top 5 prints by value ──
  const topPrints = useMemo(() => {
    return [...prints]
      .map(p => ({ ...p, _value: p.value || p.price * (p.size || 0) }))
      .sort((a, b) => b._value - a._value)
      .slice(0, 5);
  }, [prints]);

  // ── Draw scatter chart ──
  const drawChart = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !prints.length) return;

    const r = setupCanvas(canvas, container);
    if (!r) return;
    const { ctx, W, H } = r;

    const PAD = { top: 12, right: 50, bottom: 24, left: 50 };
    const cW = W - PAD.left - PAD.right;
    const cH = H - PAD.top - PAD.bottom;

    // Compute price/time ranges
    const validPrints = prints.filter((p: any) => p.price > 0 && (p.timestamp || p.timestampMs));
    if (validPrints.length < 2) return;

    const prices = validPrints.map((p: any) => p.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const priceRange = maxPrice - minPrice || 1;
    const pricePad = priceRange * 0.08;

    const timestamps = validPrints.map((p: any) => {
      const ts = p.timestampMs || new Date(p.timestamp).getTime();
      return ts;
    });
    const minTime = Math.min(...timestamps);
    const maxTime = Math.max(...timestamps);
    const timeRange = maxTime - minTime || 1;

    const values = validPrints.map((p: any) => p.value || p.price * (p.size || 0));
    const maxVal = Math.max(...values, 1);

    const xPos = (ts: number) => PAD.left + ((ts - minTime) / timeRange) * cW;
    const yPos = (price: number) => PAD.top + (1 - (price - (minPrice - pricePad)) / (priceRange + pricePad * 2)) * cH;

    ctx.clearRect(0, 0, W, H);
    drawGridLines(ctx, PAD, W, H);

    // ── VWAP line ──
    if (vwap && vwap >= minPrice - pricePad && vwap <= maxPrice + pricePad) {
      const vwapY = yPos(vwap);
      ctx.strokeStyle = 'rgba(0,229,255,0.3)';
      ctx.setLineDash([5, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, Math.round(vwapY) + 0.5);
      ctx.lineTo(W - PAD.right, Math.round(vwapY) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = 'rgba(0,229,255,0.5)';
      ctx.font = `600 9px ${FONT_MONO}`;
      ctx.textAlign = 'left';
      ctx.fillText(`VWAP $${vwap.toFixed(2)}`, W - PAD.right + 4, vwapY + 3);
    }

    // ── Current price line ──
    if (currentPrice && currentPrice >= minPrice - pricePad && currentPrice <= maxPrice + pricePad) {
      const priceY = yPos(currentPrice);
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PAD.left, Math.round(priceY) + 0.5);
      ctx.lineTo(W - PAD.right, Math.round(priceY) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Scatter dots ──
    validPrints.forEach((p: any) => {
      const ts = p.timestampMs || new Date(p.timestamp).getTime();
      const val = p.value || p.price * (p.size || 0);
      const x = xPos(ts);
      const y = yPos(p.price);
      const radius = Math.max(2, Math.min(12, Math.sqrt(val / maxVal) * 12));
      const aboveVwap = vwap ? p.price >= vwap : true;

      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fillStyle = aboveVwap ? 'rgba(0,220,130,0.25)' : 'rgba(255,71,87,0.25)';
      ctx.fill();
      ctx.strokeStyle = aboveVwap ? 'rgba(0,220,130,0.5)' : 'rgba(255,71,87,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    // ── X-axis labels ──
    ctx.fillStyle = C.textMuted;
    ctx.font = `500 9px ${FONT_MONO}`;
    ctx.textAlign = 'center';
    const hourMs = 3_600_000;
    const startHour = new Date(minTime);
    startHour.setMinutes(0, 0, 0);
    for (let ts = startHour.getTime(); ts <= maxTime + hourMs; ts += hourMs) {
      if (ts < minTime) continue;
      const x = xPos(ts);
      if (x < PAD.left || x > W - PAD.right) continue;
      const d = new Date(ts);
      const h = d.toLocaleTimeString('en-US', { hour: 'numeric', hour12: true, timeZone: 'America/New_York' }).toLowerCase().replace(' ', '');
      ctx.fillText(h, x, H - PAD.bottom + 14);
    }

    // ── Y-axis labels ──
    ctx.textAlign = 'right';
    const pMin = minPrice - pricePad;
    const pMax = maxPrice + pricePad;
    const pRange = pMax - pMin;
    for (let i = 0; i <= 4; i++) {
      const price = pMax - (i / 4) * pRange;
      const y = PAD.top + (i / 4) * cH;
      ctx.fillText(`$${price.toFixed(0)}`, PAD.left - 6, y + 3);
    }
  }, [prints, vwap, currentPrice]);

  useEffect(() => { drawChart(); }, [drawChart]);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => drawChart());
    ro.observe(container);
    return () => ro.disconnect();
  }, [drawChart]);

  // ── Loading / Error / Empty ──
  if (loading && !stats) {
    return <div style={S.panel}><div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, fontSize: 13 }}>Loading dark pool data...</div></div>;
  }
  if (!stats && !loading) {
    return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>🏦</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Dark Pool Data</span></div></div>;
  }

  return (
    <div style={S.panel}>
      {/* ── METRICS STRIP ── */}
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Regime</span>
          <span style={S.metricValue(regimeColor, 15)}>{regime === 'ACCUMULATION' ? 'ACCUM' : regime === 'DISTRIBUTION' ? 'DISTRIB' : regime}</span>
          <div style={S.badge(regimeColor, regimeBg)}>● {regime}</div>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Block Value</span>
          <span style={S.metricValue(C.textPrimary, 15)}>{computed ? fmtValue(computed.totalValue) : '—'}</span>
          <span style={S.metricSub}>{computed?.printCount || 0} prints today</span>
        </div>
        <div style={S.metricBlock()}>
          <span style={S.metricLabel}>Avg vs VWAP</span>
          <span style={S.metricValue(computed?.dpVsVwap === 'ABOVE' ? C.green : computed?.dpVsVwap === 'BELOW' ? C.red : C.textMuted, 15)}>
            {computed?.dpVsVwap || '—'}
          </span>
          <span style={S.metricSub}>
            {computed?.avgPrice ? `$${computed.avgPrice.toFixed(2)} avg` : ''}
            {vwap ? ` / $${vwap.toFixed(2)} VWAP` : ''}
          </span>
        </div>
        <div style={S.metricBlock(true)}>
          <span style={S.metricLabel}>Largest</span>
          <span style={S.metricValue(C.textPrimary, 15)}>{computed ? fmtValue(computed.largestValue) : '—'}</span>
          <span style={S.metricSub}>
            {computed?.largest ? `@ $${computed.largest.price?.toFixed(2)} · ${fmtTime(computed.largestTs)}` : ''}
          </span>
        </div>
      </div>

      {/* ── SCATTER CHART ── */}
      <div ref={containerRef} style={{ ...S.chartArea, minHeight: 100 }}>
        {isClosed && (
          <div style={S.staleTag}>
            <div style={{ fontSize: 10, fontWeight: 600, padding: '3px 10px', borderRadius: 4, background: 'rgba(251,191,36,0.12)', color: C.yellow, border: '1px solid rgba(251,191,36,0.2)' }}>
              ⚠ {tradingDayStr} · Market Closed
            </div>
          </div>
        )}
        <canvas ref={canvasRef} style={S.canvas} />
      </div>

      {/* ── TOP PRINTS TABLE ── */}
      {topPrints.length > 0 && (
        <div style={{ ...S.scrollArea, maxHeight: 108, borderTop: `1px solid ${C.border}` }}>
          <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse', fontFamily: FONT_MONO }}>
            <thead>
              <tr>
                {['Time', 'Price', 'Shares', 'Value', 'vs VWAP'].map(h => (
                  <th key={h} style={{ fontSize: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', color: C.textMuted, textAlign: 'left', padding: '4px 10px', borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, background: C.cardBg }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPrints.map((p, i) => {
                const ts = p.timestampMs || (p.timestamp ? new Date(p.timestamp).getTime() : 0);
                const val = p._value;
                const vsVwap = vwap && p.price ? ((p.price - vwap) / vwap * 100) : null;
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${C.borderSubtle}` }}>
                    <td style={{ padding: '5px 10px', color: C.textSecondary, whiteSpace: 'nowrap' }}>{ts ? fmtTime(ts) : '—'}</td>
                    <td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>${p.price?.toFixed(2)}</td>
                    <td style={{ padding: '5px 10px', color: C.textSecondary }}>{(p.size || 0).toLocaleString()}</td>
                    <td style={{ padding: '5px 10px', color: C.textPrimary, fontWeight: 600 }}>{fmtValue(val)}</td>
                    <td style={{ padding: '5px 10px', color: vsVwap !== null ? (vsVwap >= 0 ? C.green : C.red) : C.textMuted }}>
                      {vsVwap !== null ? `${vsVwap >= 0 ? '+' : ''}${vsVwap.toFixed(2)}%` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── BOTTOM INSIGHT ── */}
      <div style={S.bottomStrip}>
        <div style={S.dot(regimeColor)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}>
          <strong style={{ color: C.textPrimary, fontWeight: 600 }}>
            {regime === 'ACCUMULATION' ? 'Accumulation cluster' : regime === 'DISTRIBUTION' ? 'Distribution pattern' : 'Neutral positioning'}
          </strong>{' '}
          — {computed?.aboveVwapPct || 50}% of block value {(computed?.aboveVwapPct || 50) >= 50 ? 'above' : 'below'} VWAP
        </span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' }}>
          {computed?.printCount || 0} prints
        </span>
      </div>
    </div>
  );
}
