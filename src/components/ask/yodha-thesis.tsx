'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { RefreshCw, Shield } from 'lucide-react';
import { useThesis } from '@/hooks/use-thesis';
import type { ThesisV2Request, ThesisV2Response } from '@/app/api/ai/thesis-v2/route';
import type { MLPrediction } from '@/app/api/ml/predict/route';

/* ══════════════════════════════════════════════════════════════
   YODHA THESIS — AI/LLM-powered thesis panel (v2.2)
   
   v2.2 Changes:
   - Expanded props to include quality metrics (totalPremium,
     netDeltaAdjustedFlow, tradeCount, printCount, totalValue)
   - Quality-aware signal building with minimum thresholds
   - Passes quality metadata through to thesis API for LLM context
   ══════════════════════════════════════════════════════════════ */

// ── Props ──────────────────────────────────────────────────

interface YodhaThesisProps {
  ticker: string;
  price: number;
  changePercent: number;
  flowStats: {
    callRatio?: number;
    putRatio?: number;
    sweepRatio?: number;
    tradeCount?: number;
    // Quality metrics (available from EnhancedFlowStats at runtime)
    totalPremium?: number;
    callPremium?: number;
    putPremium?: number;
    netDeltaAdjustedFlow?: number;
  } | null;
  darkPoolStats: {
    printCount?: number;
    bullishPct?: number;
    bearishPct?: number;
    // Quality metrics (available from DarkPoolStats at runtime)
    totalValue?: number;
    bullishValue?: number;
    bearishValue?: number;
  } | null;
  relativeStrength: {
    rsVsSpy: number;
    regime: string;
  } | null;
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
    maxPain?: number | null;
    vwap?: number | null;
    camR3?: number | null;
    camR4?: number | null;
    camS3?: number | null;
    camS4?: number | null;
    prevHigh?: number | null;
    prevLow?: number | null;
    prevClose?: number | null;
  };
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  volumePressure?: number;
  mlPrediction?: MLPrediction | null;
  mlLoading?: boolean;
}

// ── Color Constants ────────────────────────────────────────

const C = {
  cyan: '#00e5ff',
  green: '#26a69a',
  red: '#ef5350',
  yellow: '#ffc107',
  purple: '#a855f7',
  cardBg: '#131722',
  cardBorder: 'rgba(42,46,57,0.6)',
  textPrimary: 'rgba(255,255,255,0.92)',
  textSecondary: 'rgba(209,212,220,0.65)',
  textMuted: 'rgba(209,212,220,0.35)',
};

const BIAS_STYLES: Record<string, { bg: string; border: string; color: string; label: string }> = {
  BULLISH: { bg: 'rgba(38,166,154,0.12)', border: 'rgba(38,166,154,0.25)', color: C.green, label: '▲ BULLISH' },
  BEARISH: { bg: 'rgba(239,83,80,0.12)', border: 'rgba(239,83,80,0.25)', color: C.red, label: '▼ BEARISH' },
  MIXED: { bg: 'rgba(255,193,7,0.1)', border: 'rgba(255,193,7,0.2)', color: C.yellow, label: '◆ MIXED' },
  NEUTRAL: { bg: 'rgba(255,193,7,0.1)', border: 'rgba(255,193,7,0.2)', color: C.yellow, label: '◆ NEUTRAL' },
};

// ── Quality Thresholds (must match confluence-indicator) ────

const FLOW_MIN_TRADES = 5;
const FLOW_MIN_PREMIUM = 50000;
const DP_MIN_PRINTS = 5;

// ── Signal Builder (quality-aware) ─────────────────────────

function buildSignals(
  flowStats: YodhaThesisProps['flowStats'],
  darkPoolStats: YodhaThesisProps['darkPoolStats'],
  volumePressure: number | undefined,
  levels: YodhaThesisProps['levels'],
  price: number,
  relativeStrength: YodhaThesisProps['relativeStrength'],
  mlPrediction: MLPrediction | null | undefined,
  ticker: string,
  marketSession: string,
): ThesisV2Request['signals'] {
  const isClosed = marketSession === 'closed' || marketSession === 'after-hours';
  const isIndex = ['SPY', 'QQQ', 'IWM', 'DIA'].includes(ticker.toUpperCase());

  // ── Flow (quality-gated) ──
  const callRatio = flowStats?.callRatio;
  const flowTradeCount = flowStats?.tradeCount ?? 0;
  const flowPremium = flowStats?.totalPremium ?? ((flowStats?.callPremium || 0) + (flowStats?.putPremium || 0));
  const flowNetDelta = flowStats?.netDeltaAdjustedFlow ?? 0;
  const hasFlow = callRatio != null && flowTradeCount > 0;
  const flowMeetsThreshold = hasFlow && flowTradeCount >= FLOW_MIN_TRADES && flowPremium >= FLOW_MIN_PREMIUM;
  const flowStatus = flowMeetsThreshold ? (callRatio! >= 60 ? 'bullish' : callRatio! <= 40 ? 'bearish' : 'neutral') : 'no_data';

  // ── Volume ──
  const vp = volumePressure ?? 0;
  const hasVol = vp !== 0;
  const volStatus = hasVol ? (vp > 20 ? 'bullish' : vp < -20 ? 'bearish' : 'neutral') : 'no_data';

  // ── Dark Pool (quality-gated) ──
  const dpBull = darkPoolStats?.bullishPct;
  const dpPrintCount = darkPoolStats?.printCount ?? 0;
  const dpTotalValue = darkPoolStats?.totalValue ?? 0;
  const hasDp = dpPrintCount > 0 && dpBull != null;
  const dpMeetsThreshold = hasDp && dpPrintCount >= DP_MIN_PRINTS;
  const dpStatus = dpMeetsThreshold ? (dpBull! > 55 ? 'bullish' : dpBull! < 45 ? 'bearish' : 'neutral') : 'no_data';

  // ── GEX ──
  const gexFlip = levels.gexFlip;
  const gexStatus = gexFlip ? (price > gexFlip ? 'bullish' : 'bearish') : 'no_data';

  // ── VWAP ──
  const vwap = levels.vwap;
  const vwapDist = vwap && vwap > 0 ? ((price - vwap) / vwap) * 100 : null;
  const vwapStatus = vwapDist != null ? (vwapDist > 0.1 ? 'bullish' : vwapDist < -0.1 ? 'bearish' : 'neutral') : 'no_data';

  // ── RS ──
  const rs = relativeStrength?.rsVsSpy;
  const regime = relativeStrength?.regime;
  const rsStatus = !isIndex && rs != null
    ? (regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM' || rs > 0.5 ? 'bullish' : regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM' || rs < -0.5 ? 'bearish' : 'neutral')
    : 'no_data';

  // ── ML ──
  const mlDir = mlPrediction?.direction?.toLowerCase();
  const mlProb = mlPrediction?.move_probability;
  const mlStatus = mlDir ? (mlDir === 'bullish' ? 'bullish' : mlDir === 'bearish' ? 'bearish' : 'neutral') : 'no_data';

  // Build flow value label (show thin data hint if below threshold)
  let flowValue: string;
  if (flowMeetsThreshold) flowValue = `${callRatio!.toFixed(0)}% calls`;
  else if (hasFlow) flowValue = `${callRatio!.toFixed(0)}% (thin)`;
  else flowValue = isClosed ? 'Closed' : 'No data';

  // Build DP value label
  let dpValue: string;
  if (dpMeetsThreshold) dpValue = `${dpBull!.toFixed(0)}% buy`;
  else if (hasDp) dpValue = `${dpPrintCount}p (thin)`;
  else dpValue = isClosed ? 'Closed' : 'No data';

  return {
    flow: {
      status: flowStatus, value: flowValue, callRatio, sweepRatio: flowStats?.sweepRatio,
      tradeCount: flowTradeCount, totalPremium: flowPremium, netDelta: flowNetDelta,
    },
    volume: {
      status: volStatus,
      value: hasVol ? `${vp > 0 ? '+' : ''}${vp.toFixed(0)}%` : isClosed ? 'Closed' : 'No data',
      pressure: vp,
    },
    darkPool: {
      status: dpStatus, value: dpValue, bullishPct: dpBull,
      printCount: dpPrintCount, totalValue: dpTotalValue,
    },
    gex: {
      status: gexStatus,
      value: gexFlip ? (price > gexFlip ? 'Above flip' : 'Below flip') : 'No data',
    },
    vwap: {
      status: vwapStatus,
      value: vwapDist != null ? `${vwapDist >= 0 ? '+' : ''}${vwapDist.toFixed(2)}%` : 'No data',
      vwapPrice: vwap ?? undefined,
    },
    rs: {
      status: rsStatus,
      value: rs != null && !isIndex ? `${rs >= 0 ? '+' : ''}${rs.toFixed(1)} vs SPY` : isIndex ? 'Index' : 'No data',
      rsVsSpy: rs ?? undefined,
    },
    ml: {
      status: mlStatus,
      value: mlProb != null ? `${(mlProb * 100).toFixed(0)}%` : 'Loading',
      probability: mlProb != null ? mlProb * 100 : undefined,
      direction: mlPrediction?.direction,
    },
  };
}

// ── Main Component ─────────────────────────────────────────

export function YodhaThesis(props: YodhaThesisProps) {
  const { ticker, price, changePercent, flowStats, darkPoolStats, relativeStrength, levels, marketSession, volumePressure, mlPrediction, mlLoading } = props;

  // Build quality-aware signals
  const signals = useMemo(() => buildSignals(
    flowStats, darkPoolStats, volumePressure, levels, price, relativeStrength, mlPrediction, ticker, marketSession,
  ), [flowStats, darkPoolStats, volumePressure, levels, price, relativeStrength, mlPrediction, ticker, marketSession]);

  // Use the thesis hook
  const { thesis, isLoading, error, refresh, secondsSinceUpdate } = useThesis({
    ticker,
    price,
    changePercent,
    prevClose: levels.prevClose || price / (1 + changePercent / 100),
    marketSession,
    signals,
    levels: {
      callWall: levels.callWall,
      putWall: levels.putWall,
      gexFlip: levels.gexFlip,
      vwap: levels.vwap ?? null,
      maxPain: levels.maxPain ?? null,
      camR3: levels.camR3 ?? null,
      camR4: levels.camR4 ?? null,
      camS3: levels.camS3 ?? null,
      camS4: levels.camS4 ?? null,
      prevHigh: levels.prevHigh ?? null,
      prevLow: levels.prevLow ?? null,
      prevClose: levels.prevClose ?? null,
    },
  });

  // ── Render ──────────────────────────────────────────────

  return (
    <div
      className="rounded-xl overflow-hidden relative"
      style={{ background: C.cardBg, border: `1px solid ${C.cardBorder}` }}
    >
      <Header ticker={ticker} thesis={thesis} isLoading={isLoading || !!mlLoading} onRefresh={refresh} marketSession={marketSession} />
      {isLoading && !thesis ? (
        <LoadingState />
      ) : thesis ? (
        <ThesisBody thesis={thesis} ticker={ticker} />
      ) : error ? (
        <ErrorState error={error} onRetry={refresh} />
      ) : (
        <LoadingState />
      )}
      {thesis && <Footer thesis={thesis} secondsSinceUpdate={secondsSinceUpdate} onRefresh={refresh} isLoading={isLoading} />}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  SUB-COMPONENTS (unchanged from v2)
// ══════════════════════════════════════════════════════════════

function Header({ ticker, thesis, isLoading, onRefresh, marketSession }: {
  ticker: string; thesis: ThesisV2Response | null; isLoading: boolean; onRefresh: () => void; marketSession: string;
}) {
  const bias = thesis?.bias || 'NEUTRAL';
  const style = BIAS_STYLES[bias] || BIAS_STYLES.NEUTRAL;
  const isPreMarket = marketSession === 'pre-market';
  const isClosed = marketSession === 'closed';
  const isAfterHours = marketSession === 'after-hours';

  return (
    <div className="flex items-center justify-between px-5 py-3" style={{ borderBottom: `1px solid ${C.cardBorder}` }}>
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `linear-gradient(135deg, ${C.cyan}20, ${C.purple}15)`, border: `1px solid ${C.cyan}30`, boxShadow: `0 0 12px ${C.cyan}15` }}>
          <Shield className="w-4 h-4" style={{ color: C.cyan }} />
        </div>
        <span className="text-sm font-black text-white uppercase tracking-wider" style={{ fontFamily: "'Oxanium', monospace" }}>Yodha</span>
        <span className="text-xs text-gray-300">{ticker}</span>
        {isPreMarket && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(255,193,7,0.1)', color: C.yellow, border: '1px solid rgba(255,193,7,0.2)' }}>PRE-MARKET</span>
        )}
        {isAfterHours && (
          <span className="text-[9px] font-bold px-2 py-0.5 rounded" style={{ background: 'rgba(168,85,247,0.1)', color: C.purple, border: '1px solid rgba(168,85,247,0.2)' }}>AFTER-HOURS</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {isLoading && (
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: C.cyan }} />
            <span className="text-[10px] text-gray-400">Analyzing</span>
          </div>
        )}
        {thesis?.mlConfidence && (
          <div className="text-[10px] font-semibold px-2 py-1 rounded" style={{ color: C.textMuted, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
            {thesis.mlConfidence}
          </div>
        )}
        {thesis && !isClosed && !isAfterHours && (
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold" style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}>
            <div className="w-[6px] h-[6px] rounded-full" style={{ background: style.color, animation: 'pulse 2s ease-in-out infinite' }} />
            {thesis.gapLabel || style.label}
          </div>
        )}
        {(isClosed || isAfterHours) && (
          <span className="text-[10px] font-semibold px-2.5 py-1 rounded" style={{ background: 'rgba(255,193,7,0.08)', color: C.yellow, border: '1px solid rgba(255,193,7,0.15)' }}>
            {isClosed ? 'MARKET CLOSED' : 'AFTER-HOURS'}
          </span>
        )}
        {!isLoading && (
          <button onClick={onRefresh} className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors" title="Refresh thesis">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

function ThesisBody({ thesis, ticker }: { thesis: ThesisV2Response; ticker: string }) {
  if (thesis.marketState === 'closed' || thesis.marketState === 'after_hours') return <ClosedBody thesis={thesis} ticker={ticker} />;
  return (
    <div>
      <div className="px-5 py-4"><ThesisText text={thesis.thesis} /></div>
      {thesis.bullSetup && thesis.bearSetup ? (
        <DualSetup bull={thesis.bullSetup} bear={thesis.bearSetup} />
      ) : thesis.bullSetup ? (
        <SingleSetup setup={thesis.bullSetup} direction="bull" />
      ) : thesis.bearSetup ? (
        <SingleSetup setup={thesis.bearSetup} direction="bear" />
      ) : null}
      {thesis.risk && <RiskBar icon={thesis.risk.icon} text={thesis.risk.text} />}
    </div>
  );
}

function ThesisText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  return (
    <div className="space-y-2.5">
      {paragraphs.map((p, i) => (
        <p key={i} className="text-[13.5px] leading-[1.75] tracking-[0.01em]" style={{ color: C.textPrimary }} dangerouslySetInnerHTML={{ __html: highlightText(p) }} />
      ))}
    </div>
  );
}

function highlightText(text: string): string {
  return text
    .replace(/\$[\d,]+\.?\d*/g, (m) => `<span style="color:${C.cyan};font-weight:600">${m}</span>`)
    .replace(/\+\d+\.?\d*%/g, (m) => `<span style="color:${C.green};font-weight:600">${m}</span>`)
    .replace(/-\d+\.?\d*%/g, (m) => `<span style="color:${C.red};font-weight:600">${m}</span>`)
    .replace(/(\d+\.?\d*%)/g, (m) => `<span style="font-weight:600">${m}</span>`)
    .replace(/\b(VWAP|GEX flip|call wall|put wall|Camarilla R[34]|Camarilla S[34]|mean-reversion|trend-amplification)\b/gi, (m) => `<strong>${m}</strong>`);
}

function SingleSetup({ setup, direction }: { setup: NonNullable<ThesisV2Response['bullSetup']>; direction: 'bull' | 'bear' }) {
  const isBull = direction === 'bull';
  return (
    <div className="px-5 pb-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <SetupItem label="Entry" price={setup.entry.price} context={setup.entry.context} color={isBull ? C.cyan : C.red} />
        {setup.targets.map((t, i) => <SetupItem key={i} label={`Target ${i + 1}`} price={t.price} context={t.context} color={isBull ? C.green : C.red} />)}
        <SetupItem label="Stop" price={setup.stop.price} context={setup.stop.context} color={isBull ? C.red : C.green} />
      </div>
    </div>
  );
}

function DualSetup({ bull, bear }: { bull: NonNullable<ThesisV2Response['bullSetup']>; bear: NonNullable<ThesisV2Response['bearSetup']> }) {
  return (
    <div className="px-5 pb-4 space-y-3">
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.green }} />
          <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: C.green }}>🟢 Bull Setup</span>
          {bull.label && <span className="text-[9px] ml-1" style={{ color: C.textMuted }}>— {bull.label}</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SetupItem label="Entry" price={bull.entry.price} context={bull.entry.context} color={C.cyan} />
          {bull.targets.map((t, i) => <SetupItem key={i} label={`Target ${i + 1}`} price={t.price} context={t.context} color={C.green} />)}
          <SetupItem label="Stop" price={bull.stop.price} context={bull.stop.context} color={C.red} />
        </div>
      </div>
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: C.red }} />
          <span className="text-[9px] font-bold uppercase tracking-[1.5px]" style={{ color: C.red }}>🔴 Bear Setup</span>
          {bear.label && <span className="text-[9px] ml-1" style={{ color: C.textMuted }}>— {bear.label}</span>}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <SetupItem label="Entry" price={bear.entry.price} context={bear.entry.context} color={C.red} />
          {bear.targets.map((t, i) => <SetupItem key={i} label={`Target ${i + 1}`} price={t.price} context={t.context} color={C.red} />)}
          <SetupItem label="Stop" price={bear.stop.price} context={bear.stop.context} color={C.green} />
        </div>
      </div>
    </div>
  );
}

function SetupItem({ label, price, context, color }: { label: string; price: string; context: string; color: string }) {
  return (
    <div className="px-3 py-2.5 rounded-md" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="text-[9px] font-bold uppercase tracking-[1.5px] mb-1" style={{ color }}>{label}</div>
      <div className="text-[13px] font-bold font-mono" style={{ color }}>{price}</div>
      <div className="text-[9px] mt-0.5" style={{ color: C.textMuted }}>{context}</div>
    </div>
  );
}

function RiskBar({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="mx-5 mb-4 px-3.5 py-2.5 rounded-md flex items-start gap-2" style={{ background: 'rgba(255,193,7,0.04)', border: '1px solid rgba(255,193,7,0.12)' }}>
      <span className="text-sm flex-shrink-0 mt-0.5">{icon}</span>
      <p className="text-[11.5px] leading-[1.6]" style={{ color: 'rgba(255,255,255,0.7)' }}>{text}</p>
    </div>
  );
}

function ClosedBody({ thesis, ticker }: { thesis: ThesisV2Response; ticker: string }) {
  return (
    <div className="px-5 py-4">
      {thesis.sessionRecap && (
        <div className="mb-4">
          <div className="text-[9px] font-bold uppercase tracking-[2px] mb-2" style={{ color: C.textMuted }}>Today's Session</div>
          <ThesisText text={thesis.sessionRecap} />
          {thesis.stats && thesis.stats.length > 0 && (
            <div className="flex gap-3 mt-3 flex-wrap">
              {thesis.stats.map((stat, i) => (
                <div key={i} className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px]" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <span className="text-[9px] font-semibold uppercase tracking-[1px]" style={{ color: C.textMuted }}>{stat.label}</span>
                  <span className="font-bold font-mono" style={{ color: stat.color === 'green' ? C.green : stat.color === 'red' ? C.red : stat.color === 'cyan' ? C.cyan : C.textPrimary }}>{stat.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      {thesis.afterHoursNote && (
        <div className="px-3.5 py-2.5 rounded-md mb-4" style={{ background: `${C.purple}08`, border: `1px solid ${C.purple}15` }}>
          <div className="text-[9px] font-bold uppercase tracking-[1.5px] mb-1" style={{ color: C.purple }}>📡 After-Hours Activity</div>
          <p className="text-[12px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>{thesis.afterHoursNote}</p>
        </div>
      )}
      {thesis.tomorrowPlan && (
        <>
          <div className="h-px my-4" style={{ background: C.cardBorder }} />
          <div className="text-[9px] font-bold uppercase tracking-[2px] mb-2" style={{ color: C.textMuted }}>
            {thesis.marketState === 'after_hours' ? "Tomorrow's Game Plan" : 'Key Levels for Tomorrow'}
          </div>
          <ThesisText text={thesis.tomorrowPlan} />
        </>
      )}
      {thesis.bullSetup && (
        <div className="mt-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <SetupItem label="Breakout" price={thesis.bullSetup.entry.price} context={thesis.bullSetup.entry.context} color={C.green} />
            {thesis.bullSetup.targets.map((t, i) => <SetupItem key={i} label={i === 0 ? 'Upside Target' : 'Support'} price={t.price} context={t.context} color={i === 0 ? C.green : C.cyan} />)}
            <SetupItem label="Risk Level" price={thesis.bullSetup.stop.price} context={thesis.bullSetup.stop.context} color={C.red} />
          </div>
        </div>
      )}
      {thesis.risk && <div className="mt-3"><RiskBar icon={thesis.risk.icon} text={thesis.risk.text} /></div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="px-5 py-6 flex items-center gap-4">
      <div className="flex gap-1">
        {[0, 1, 2].map(i => (
          <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: C.cyan, animation: `bounce-dot 1.2s ease-in-out infinite ${i * 0.15}s` }} />
        ))}
      </div>
      <span className="text-xs" style={{ color: C.textSecondary }}>Yodha is analyzing 7 data streams + ML model...</span>
      <style jsx>{`
        @keyframes bounce-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.3; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="px-5 py-4 flex items-center gap-3">
      <span className="text-sm">⚠️</span>
      <div className="flex-1">
        <p className="text-xs" style={{ color: C.red }}>Thesis generation failed</p>
        <p className="text-[10px] mt-0.5" style={{ color: C.textMuted }}>{error}</p>
      </div>
      <button onClick={onRetry} className="text-[10px] font-semibold px-3 py-1.5 rounded-md transition-colors hover:bg-white/5" style={{ color: C.cyan, border: `1px solid ${C.cyan}30` }}>Retry</button>
    </div>
  );
}

function Footer({ thesis, secondsSinceUpdate, onRefresh, isLoading }: {
  thesis: ThesisV2Response; secondsSinceUpdate: number; onRefresh: () => void; isLoading: boolean;
}) {
  const timeLabel = secondsSinceUpdate < 60 ? `Updated ${secondsSinceUpdate}s ago` : `Updated ${Math.floor(secondsSinceUpdate / 60)}m ago`;
  return (
    <div className="flex items-center justify-between px-5 py-2.5" style={{ borderTop: `1px solid ${C.cardBorder}` }}>
      <div className="flex items-center gap-3 text-[9px]" style={{ color: C.textMuted }}>
        <span>{thesis.footer}</span>
        <div className="w-[3px] h-[3px] rounded-full" style={{ background: C.textMuted }} />
        <span>{timeLabel}</span>
      </div>
      <button onClick={onRefresh} disabled={isLoading}
        className="flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all hover:border-cyan-600"
        style={{ color: C.textMuted, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', fontFamily: "'JetBrains Mono', monospace" }}>
        <RefreshCw className={`w-3 h-3 ${isLoading ? 'animate-spin' : ''}`} />
        Refresh
      </button>
    </div>
  );
}
