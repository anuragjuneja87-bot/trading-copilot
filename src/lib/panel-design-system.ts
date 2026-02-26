/* ════════════════════════════════════════════════════════════════
   PANEL DESIGN SYSTEM v3.1 — Shared constants for all panels
   
   v3.1 fixes:
   - fmtPriceAxis: adaptive decimals (fixes "$201" repeated Y-axis)
   - classifySentiment: client-side fallback (fixes 0 Bull / 0 Bear)
   - insufficientData overlay style
   ════════════════════════════════════════════════════════════════ */

export const PANEL_COLORS = {
  green: '#00dc82',
  greenDim: 'rgba(0,220,130,0.12)',
  greenGlow: 'rgba(0,220,130,0.3)',
  red: '#ff4757',
  redDim: 'rgba(255,71,87,0.12)',
  redGlow: 'rgba(255,71,87,0.3)',
  yellow: '#fbbf24',
  yellowDim: 'rgba(251,191,36,0.1)',
  cyan: '#00e5ff',
  cyanDim: 'rgba(0,229,255,0.1)',
  purple: '#a78bfa',
  purpleDim: 'rgba(167,139,250,0.12)',
  textPrimary: '#e8eaf0',
  textSecondary: 'rgba(255,255,255,0.5)',
  textMuted: 'rgba(255,255,255,0.25)',
  border: 'rgba(255,255,255,0.06)',
  borderSubtle: 'rgba(255,255,255,0.04)',
  cardBg: '#0c1018',
  cardInner: 'rgba(255,255,255,0.015)',
  indigo: 'rgba(99,102,241,0.035)',
  grid: 'rgba(255,255,255,0.03)',
};

export const FONT_MONO = "'JetBrains Mono', 'SF Mono', 'Cascadia Code', monospace";

export function fmtVol(v: number): string {
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${Math.round(abs)}`;
}

export function fmtDollar(v: number): string {
  const abs = Math.abs(v);
  const sign = v >= 0 ? '+' : '-';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${Math.round(abs)}`;
}

/**
 * Adaptive price formatting — auto-adjusts decimals based on Y-axis range
 * Fixes the "$201 $201 $201" repeated label bug when price range is < $1
 */
export function fmtPriceAxis(price: number, priceRange: number): string {
  if (priceRange < 0.1) return `$${price.toFixed(4)}`;
  if (priceRange < 0.5) return `$${price.toFixed(3)}`;
  if (priceRange < 2) return `$${price.toFixed(2)}`;
  if (priceRange < 20) return `$${price.toFixed(1)}`;
  return `$${price.toFixed(0)}`;
}

export function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`;
}

export function fmtTime(ts: number | string): string {
  const d = typeof ts === 'string' ? new Date(ts) : new Date(ts);
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'America/New_York',
  }).replace(' ', '').toLowerCase();
}

// Canvas helpers
export function setupCanvas(
  canvas: HTMLCanvasElement,
  container: HTMLElement,
): { ctx: CanvasRenderingContext2D; W: number; H: number } | null {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  const W = rect.width;
  const H = rect.height;
  if (W < 10 || H < 10) return null;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, W, H };
}

export function drawGridLines(
  ctx: CanvasRenderingContext2D,
  pad: { top: number; right: number; bottom: number; left: number },
  W: number,
  H: number,
  steps = 5,
) {
  const cH = H - pad.top - pad.bottom;
  ctx.strokeStyle = PANEL_COLORS.grid;
  ctx.lineWidth = 1;
  for (let i = 0; i <= steps; i++) {
    const y = pad.top + (i / steps) * cH;
    ctx.beginPath();
    ctx.moveTo(pad.left, Math.round(y) + 0.5);
    ctx.lineTo(W - pad.right, Math.round(y) + 0.5);
    ctx.stroke();
  }
}

/**
 * Client-side sentiment classification — fixes "0 Bull / 0 Bear"
 * Lower threshold than server: any single keyword match counts.
 * Also handles context-specific patterns (e.g. "Blow To Nvidia" = bearish for NVDA)
 */
export function classifySentiment(
  title: string,
  ticker?: string
): 'positive' | 'negative' | 'neutral' {
  const t = (title || '').toLowerCase();

  const bullWords = [
    'surge', 'rally', 'gain', 'beat', 'exceed', 'outperform', 'upgrade',
    'buy', 'bullish', 'growth', 'record', 'soar', 'jump', 'high',
    'breakout', 'strong', 'robust', 'optimistic', 'boost', 'accelerat',
    'partnership', 'deal', 'expand', 'launch', 'innovation', 'profit',
    'raised guidance', 'price target raised', 'positive', 'crown', 'king',
    'extend', 'close to', 'agreement',
  ];
  const bearWords = [
    'drop', 'fall', 'crash', 'miss', 'disappoint', 'downgrade', 'sell',
    'bearish', 'decline', 'plunge', 'weak', 'risk', 'concern', 'threat',
    'selloff', 'correction', 'layoff', 'cut', 'loss', 'warning', 'blow',
    'investigation', 'probe', 'fine', 'lawsuit', 'antitrust', 'fraud',
    'recall', 'delay', 'shortage', 'ban', 'restrict', 'negative',
  ];

  let bull = 0, bear = 0;
  bullWords.forEach(w => { if (t.includes(w)) bull++; });
  bearWords.forEach(w => { if (t.includes(w)) bear++; });

  // Context: "blow to Nvidia" is bearish for NVDA even though "blow" is generic
  if (ticker) {
    const tk = ticker.toLowerCase();
    const companyVariants = [tk];
    if (tk === 'nvda') companyVariants.push('nvidia');
    else if (tk === 'aapl') companyVariants.push('apple');
    else if (tk === 'msft') companyVariants.push('microsoft');
    else if (tk === 'goog' || tk === 'googl') companyVariants.push('google', 'alphabet');
    else if (tk === 'amzn') companyVariants.push('amazon');
    else if (tk === 'meta') companyVariants.push('facebook', 'meta');
    else if (tk === 'tsla') companyVariants.push('tesla');

    // Check if negative language targets THIS ticker specifically
    const negativePatterns = ['blow to', 'threat to', 'risk for', 'challenge for', 'lawsuit against', 'probe of', 'investigation into'];
    for (const variant of companyVariants) {
      for (const pattern of negativePatterns) {
        if (t.includes(`${pattern} ${variant}`)) bear += 2;
      }
    }
    // Check if positive language targets THIS ticker
    const positivePatterns = ['upgrade', 'crown', 'king', 'leader', 'partnership with', 'agreement with'];
    for (const variant of companyVariants) {
      for (const pattern of positivePatterns) {
        if (t.includes(`${variant} ${pattern}`) || t.includes(`${pattern} ${variant}`)) bull += 2;
      }
    }
  }

  // Lower threshold: any edge counts
  if (bull > bear) return 'positive';
  if (bear > bull) return 'negative';
  return 'neutral';
}

// Inline style helpers
export const panelStyles = {
  panel: {
    background: PANEL_COLORS.cardBg,
    border: `1px solid ${PANEL_COLORS.border}`,
    borderRadius: 12,
    overflow: 'hidden' as const,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    height: '100%',
    maxHeight: '100%',
  },
  metricsStrip: {
    display: 'flex' as const,
    alignItems: 'stretch' as const,
    borderBottom: `1px solid ${PANEL_COLORS.border}`,
    flexShrink: 0,
  },
  metricBlock: (last = false) => ({
    flex: 1,
    padding: '10px 14px',
    borderRight: last ? 'none' : `1px solid ${PANEL_COLORS.border}`,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    gap: 1,
  }),
  metricLabel: {
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: 1.2,
    textTransform: 'uppercase' as const,
    color: PANEL_COLORS.textMuted,
    fontFamily: FONT_MONO,
  },
  metricValue: (color: string, size = 18) => ({
    fontFamily: FONT_MONO,
    fontSize: size,
    fontWeight: 700,
    lineHeight: 1.2,
    color,
  }),
  badge: (color: string, bg: string) => ({
    display: 'inline-flex' as const,
    alignItems: 'center' as const,
    gap: 4,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 0.5,
    padding: '2px 7px',
    borderRadius: 4,
    width: 'fit-content' as const,
    marginTop: 2,
    color,
    background: bg,
    fontFamily: FONT_MONO,
  }),
  metricSub: {
    fontSize: 10,
    fontWeight: 500,
    color: PANEL_COLORS.textSecondary,
    marginTop: 1,
  },
  chartArea: {
    flex: 1,
    minHeight: 0,
    position: 'relative' as const,
  },
  canvas: {
    width: '100%',
    height: '100%',
    display: 'block' as const,
  },
  bottomStrip: {
    display: 'flex' as const,
    alignItems: 'center' as const,
    padding: '8px 14px',
    borderTop: `1px solid ${PANEL_COLORS.border}`,
    gap: 10,
    flexShrink: 0,
  },
  dot: (color: string) => ({
    width: 5,
    height: 5,
    borderRadius: '50%',
    background: color,
    boxShadow: `0 0 6px ${color}60`,
    flexShrink: 0,
  }),
  scrollArea: {
    overflow: 'auto' as const,
    minHeight: 0,
  },
  staleTag: {
    position: 'absolute' as const,
    top: 8,
    left: 0,
    right: 0,
    display: 'flex' as const,
    justifyContent: 'center' as const,
    zIndex: 5,
  },
  insufficientData: {
    position: 'absolute' as const,
    inset: 0,
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: 6,
    zIndex: 4,
    background: 'rgba(12,16,24,0.88)',
  },
};
