'use client';

import { useMemo, useEffect, useState, useRef, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import type { GexStrike } from '@/types/flow';
import {
  PANEL_COLORS as C, FONT_MONO,
  setupCanvas, drawGridLines, panelStyles as S,
} from '@/lib/panel-design-system';

/* ════════════════════════════════════════════════════════════════
   GAMMA LEVELS PANEL v3.1 — Canvas GEX Butterfly + Key Levels
   ════════════════════════════════════════════════════════════════ */

interface GammaLevelsPanelProps { ticker: string; gexByStrike: GexStrike[]; currentPrice?: number; }

export function GammaLevelsPanel({ ticker, gexByStrike, currentPrice }: GammaLevelsPanelProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [apiLevels, setApiLevels] = useState<{ callWall: number | null; putWall: number | null; maxGamma: number | null; gexFlip: number | null } | null>(null);

  useEffect(() => {
    const fetchLevels = async () => {
      try { const res = await fetch(`/api/market/levels/${ticker}`); const json = await res.json(); if (json.success && json.data) setApiLevels({ callWall: json.data.callWall, putWall: json.data.putWall, maxGamma: json.data.maxGamma, gexFlip: json.data.gexFlip }); } catch { /* silent */ }
    };
    fetchLevels(); const iv = setInterval(fetchLevels, 30000); return () => clearInterval(iv);
  }, [ticker]);

  const callWall = apiLevels?.callWall || null, putWall = apiLevels?.putWall || null, maxGamma = apiLevels?.maxGamma || null, gexFlip = apiLevels?.gexFlip || null;

  const netGex = useMemo(() => gexByStrike.reduce((s, g) => s + (g.callGex || 0), 0) - gexByStrike.reduce((s, g) => s + Math.abs(g.putGex || 0), 0), [gexByStrike]);
  const isPositiveGamma = netGex >= 0;
  const gexColor = isPositiveGamma ? C.green : C.red;
  const gexBg = isPositiveGamma ? C.greenDim : C.redDim;

  const chartData = useMemo(() => {
    if (!gexByStrike.length || !currentPrice) return [...gexByStrike].sort((a, b) => a.strike - b.strike).slice(0, 20);
    const range = currentPrice * 0.15;
    return [...gexByStrike].filter(g => g.strike >= currentPrice - range && g.strike <= currentPrice + range).sort((a, b) => a.strike - b.strike);
  }, [gexByStrike, currentPrice]);

  const distPct = (level: number | null) => level && currentPrice ? ((level - currentPrice) / currentPrice * 100) : null;
  const fmtGex = (v: number) => { const abs = Math.abs(v), sign = v >= 0 ? '+' : '-'; if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`; if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`; if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`; return `${sign}$${abs.toFixed(0)}`; };

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current, container = containerRef.current;
    if (!canvas || !container || !chartData.length) return;
    const r = setupCanvas(canvas, container); if (!r) return;
    const { ctx, W, H } = r;
    const PAD = { top: 10, right: 16, bottom: 22, left: 54 };
    const cW = W - PAD.left - PAD.right, cH = H - PAD.top - PAD.bottom;
    const N = chartData.length; if (N < 1) return;
    const maxGexVal = Math.max(...chartData.map(g => Math.max(g.callGex || 0, Math.abs(g.putGex || 0))), 1);
    const barH = Math.min(cH / N - 2, 16);
    const centerX = PAD.left + cW / 2;
    ctx.clearRect(0, 0, W, H);

    chartData.forEach((g, i) => {
      const y = PAD.top + (i / N) * cH + 1;
      const callW = ((g.callGex || 0) / maxGexVal) * (cW / 2) * 0.9;
      if (callW > 0) { const grd = ctx.createLinearGradient(centerX, 0, centerX + callW, 0); grd.addColorStop(0, 'rgba(0,220,130,0.15)'); grd.addColorStop(1, 'rgba(0,220,130,0.45)'); ctx.fillStyle = grd; ctx.fillRect(centerX, y, callW, barH); }
      const putW = (Math.abs(g.putGex || 0) / maxGexVal) * (cW / 2) * 0.9;
      if (putW > 0) { const grd = ctx.createLinearGradient(centerX - putW, 0, centerX, 0); grd.addColorStop(0, 'rgba(255,71,87,0.45)'); grd.addColorStop(1, 'rgba(255,71,87,0.15)'); ctx.fillStyle = grd; ctx.fillRect(centerX - putW, y, putW, barH); }

      const isNearPrice = currentPrice && Math.abs(g.strike - currentPrice) < currentPrice * 0.005;
      const isKeyLevel = g.strike === callWall || g.strike === putWall || g.strike === maxGamma;
      ctx.fillStyle = isNearPrice ? C.textPrimary : isKeyLevel ? C.yellow : C.textMuted;
      ctx.font = `${isNearPrice || isKeyLevel ? '700' : '500'} 10px ${FONT_MONO}`; ctx.textAlign = 'right';
      ctx.fillText(`$${g.strike}`, PAD.left - 6, y + barH / 2 + 3);
    });

    // Center line
    ctx.strokeStyle = 'rgba(255,255,255,0.1)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(centerX) + 0.5, PAD.top); ctx.lineTo(Math.round(centerX) + 0.5, PAD.top + cH); ctx.stroke();

    // Current price marker
    if (currentPrice) {
      const priceIdx = chartData.findIndex(g => g.strike >= currentPrice);
      if (priceIdx >= 0) {
        const priceY = PAD.top + (priceIdx / N) * cH;
        ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(PAD.left, Math.round(priceY) + 0.5); ctx.lineTo(W - PAD.right, Math.round(priceY) + 0.5); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `600 8px ${FONT_MONO}`; ctx.textAlign = 'left'; ctx.fillText('PRICE', W - PAD.right - 30, priceY - 4);
      }
    }

    // Bottom labels
    ctx.fillStyle = 'rgba(0,220,130,0.4)'; ctx.font = `600 9px ${FONT_MONO}`; ctx.textAlign = 'center'; ctx.fillText('CALL GEX →', centerX + cW / 4, H - PAD.bottom + 14);
    ctx.fillStyle = 'rgba(255,71,87,0.4)'; ctx.fillText('← PUT GEX', centerX - cW / 4, H - PAD.bottom + 14);
  }, [chartData, currentPrice, callWall, putWall, maxGamma]);

  useEffect(() => { drawChart(); }, [drawChart]);
  useEffect(() => { const c = containerRef.current; if (!c) return; const ro = new ResizeObserver(() => drawChart()); ro.observe(c); return () => ro.disconnect(); }, [drawChart]);

  const LevelRow = ({ label, price, color, dist }: { label: string; price: number | null; color: string; dist: number | null }) => (
    <div style={{ display: 'flex', alignItems: 'center', padding: '6px 14px', gap: 10, borderBottom: `1px solid ${C.borderSubtle}` }}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.8, textTransform: 'uppercase', fontFamily: FONT_MONO, width: 72, flexShrink: 0, color }}>{label}</span>
      <span style={{ fontFamily: FONT_MONO, fontSize: 13, fontWeight: 700, width: 72, flexShrink: 0, color }}>{price ? `$${price.toFixed(0)}` : '—'}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,0.04)', position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: `${dist !== null ? Math.min(Math.abs(dist) * 15, 95) : 0}%`, borderRadius: 3, background: color, opacity: 0.4, transition: 'width 0.3s' }} />
        </div>
      </div>
      <span style={{ fontFamily: FONT_MONO, fontSize: 10, fontWeight: 600, width: 52, textAlign: 'right', flexShrink: 0, color: dist !== null ? (dist >= 0 ? C.green : C.red) : C.textMuted }}>{dist !== null ? `${dist >= 0 ? '+' : ''}${dist.toFixed(1)}%` : '—'}</span>
    </div>
  );

  if (!gexByStrike.length && !apiLevels) return <div style={S.panel}><div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: C.textSecondary, gap: 6 }}><span style={{ fontSize: 28 }}>⚡</span><span style={{ fontSize: 14, fontWeight: 600 }}>No Gamma Data</span></div></div>;

  return (
    <div style={S.panel}>
      <div style={S.metricsStrip}>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Net GEX</span><span style={S.metricValue(gexColor, 15)}>{fmtGex(netGex)}</span><div style={S.badge(gexColor, gexBg)}>{isPositiveGamma ? 'POSITIVE γ' : 'NEGATIVE γ'}</div></div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>GEX Flip</span><span style={S.metricValue(C.yellow, 15)}>{gexFlip ? `$${gexFlip.toFixed(0)}` : '—'}</span><span style={S.metricSub}>{gexFlip && currentPrice ? (currentPrice > gexFlip ? 'Price above → pinned' : 'Price below → volatile') : ''}</span></div>
        <div style={S.metricBlock()}><span style={S.metricLabel}>Call Wall</span><span style={S.metricValue(C.green, 15)}>{callWall ? `$${callWall.toFixed(0)}` : '—'}</span><span style={S.metricSub}>{distPct(callWall) !== null ? `${distPct(callWall)! >= 0 ? '+' : ''}${distPct(callWall)!.toFixed(1)}% from current` : ''}</span></div>
        <div style={S.metricBlock(true)}><span style={S.metricLabel}>Put Wall</span><span style={S.metricValue(C.red, 15)}>{putWall ? `$${putWall.toFixed(0)}` : '—'}</span><span style={S.metricSub}>{distPct(putWall) !== null ? `${distPct(putWall)!.toFixed(1)}% from current` : ''}</span></div>
      </div>

      <div ref={containerRef} style={{ ...S.chartArea, minHeight: 120 }}><canvas ref={canvasRef} style={S.canvas} /></div>

      <div style={{ borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
        <LevelRow label="Call Wall" price={callWall} color={C.green} dist={distPct(callWall)} />
        <LevelRow label="Max Gamma" price={maxGamma} color={C.yellow} dist={distPct(maxGamma)} />
        <LevelRow label="GEX Flip" price={gexFlip} color={C.cyan} dist={distPct(gexFlip)} />
        <LevelRow label="Put Wall" price={putWall} color={C.red} dist={distPct(putWall)} />
      </div>

      <div style={{ ...S.bottomStrip, flexShrink: 0 }}>
        <div style={S.dot(gexColor)} />
        <span style={{ fontSize: 11, color: C.textSecondary, lineHeight: 1.3, flex: 1 }}><strong style={{ color: C.textPrimary, fontWeight: 600 }}>{isPositiveGamma ? 'Positive gamma' : 'Negative gamma'}</strong>{' '}— {isPositiveGamma ? 'dealers dampen moves, expect mean reversion' : 'dealers amplify moves, expect trend continuation'}</span>
        <span style={{ fontSize: 10, color: C.textMuted, fontFamily: FONT_MONO, whiteSpace: 'nowrap' as const }}>{ticker}</span>
      </div>
    </div>
  );
}
