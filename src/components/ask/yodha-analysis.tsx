'use client';

import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import type { MLPrediction } from '@/app/api/ml/predict/route';
import {
  Sparkles, Building2, Newspaper, Activity, Target,
  TrendingUp, TrendingDown, Minus, AlertTriangle,
  ChevronDown, ChevronRight, Send, Loader2, Shield,
  BarChart3, Zap, MessageSquare, RefreshCw
} from 'lucide-react';
import { ConfidenceSparkline } from './confidence-sparkline';
import type { ConfidencePoint } from '@/hooks/use-ml-prediction';

/* ──────────────────────────────────────────────────────────
   TYPES
   ────────────────────────────────────────────────────────── */

interface YodhaAnalysisProps {
  ticker: string;
  price: number;
  changePercent: number;
  flowStats: {
    callRatio?: number;
    putRatio?: number;
    netDeltaAdjustedFlow?: number;
    sweepRatio?: number;
    tradeCount?: number;
    unusualCount?: number;
    totalCallPremium?: number;
    totalPutPremium?: number;
  } | null;
  darkPoolStats: {
    printCount?: number;
    bullishPct?: number;
    bearishPct?: number;
    totalValue?: number;
    regime?: string;
  } | null;
  newsItems: any[];
  relativeStrength: {
    rsVsSpy: number;
    rsVsQqq: number;
    regime: string;
    tickerChange: number;
    spyChange: number;
    qqqChange: number;
    session?: string;
  } | null;
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
    maxPain?: number | null;
    vwap?: number | null;
  };
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
  // ML prediction (passed from parent)
  mlPrediction?: MLPrediction | null;
  mlLoading?: boolean;
  mlError?: string | null;
  mlMeta?: { completeness: string; availableFeatures: number; latencyMs: number } | null;
  mlRefresh?: () => void;
  confidenceHistory?: ConfidencePoint[];
}

interface SupportingSignal {
  icon: any;
  label: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'NO_DATA';
  summary: string;
  details: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

/* ──────────────────────────────────────────────────────────
   MAIN COMPONENT
   ────────────────────────────────────────────────────────── */

export function YodhaAnalysis({
  ticker,
  price,
  changePercent,
  flowStats,
  darkPoolStats,
  newsItems,
  relativeStrength,
  levels,
  marketSession,
  mlPrediction,
  mlLoading,
  mlError,
  mlMeta,
  mlRefresh,
  confidenceHistory,
}: YodhaAnalysisProps) {

  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Build supporting signals
  const signals = useMemo(() => {
    const result: SupportingSignal[] = [];
    result.push(buildFlowSignal(ticker, flowStats, marketSession));
    result.push(buildDarkPoolSignal(ticker, darkPoolStats, marketSession));
    result.push(buildNewsSignal(ticker, newsItems));
    result.push(buildRSSignal(ticker, relativeStrength, changePercent, marketSession));
    return result;
  }, [ticker, flowStats, darkPoolStats, newsItems, relativeStrength, changePercent, marketSession]);

  // Build unified thesis
  const thesis = useMemo(() => {
    return buildUnifiedThesis(ticker, price, changePercent, signals, levels, marketSession, mlPrediction);
  }, [ticker, price, changePercent, signals, levels, marketSession, mlPrediction]);

  // Move probability from ML
  const moveProbability = mlPrediction ? mlPrediction.move_probability * 100 : 0;
  const hasMLSignal = mlPrediction?.has_signal ?? false;
  const mlDirection = mlPrediction?.direction ?? 'NEUTRAL';
  const mlStrength = mlPrediction?.signal_strength ?? 'NONE';

  const biasColor = thesis.bias === 'BULLISH' ? COLORS.green
    : thesis.bias === 'BEARISH' ? COLORS.red
    : '#ffc107';

  const biasGradient = thesis.bias === 'BULLISH'
    ? `linear-gradient(90deg, ${COLORS.green}00 0%, ${COLORS.green}40 ${Math.min(moveProbability, 100)}%, ${COLORS.green}00 100%)`
    : thesis.bias === 'BEARISH'
    ? `linear-gradient(90deg, ${COLORS.red}00 0%, ${COLORS.red}40 ${Math.min(moveProbability, 100)}%, ${COLORS.red}00 100%)`
    : `linear-gradient(90deg, #ffc10700 0%, #ffc10740 ${Math.min(moveProbability, 100)}%, #ffc10700 100%)`;

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* ── HEADER ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${COLORS.cyan}20` }}
          >
            <Shield className="w-4 h-4" style={{ color: COLORS.cyan }} />
          </div>
          <span className="text-sm font-black text-white uppercase tracking-wider" style={{ fontFamily: "'Oxanium', monospace" }}>
            Yodha Analysis
          </span>
          <span className="text-xs text-gray-500">{ticker}</span>
        </div>
        <div className="flex items-center gap-2">
          {mlMeta && (
            <span className="text-[10px] text-gray-600 font-mono">
              {mlMeta.completeness} · {mlMeta.latencyMs}ms
            </span>
          )}
          {mlRefresh && (
            <button
              onClick={mlRefresh}
              disabled={mlLoading}
              className="p-1 rounded hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
              title="Refresh analysis"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${mlLoading ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      </div>

      {/* ── CONFIDENCE METER ─────────────────────────────── */}
      <div className="px-5 py-4 border-b" style={{ borderColor: COLORS.cardBorder }}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Confidence</span>
            {hasMLSignal && (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{ background: `${biasColor}20`, color: biasColor }}
              >
                {mlDirection} · {mlStrength}
              </span>
            )}
          </div>
          <span className="text-sm font-mono font-bold" style={{ color: biasColor }}>
            {moveProbability.toFixed(0)}%
          </span>
        </div>
        {/* Bar */}
        <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
          <div
            className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 ease-out"
            style={{
              width: `${Math.min(moveProbability, 100)}%`,
              background: moveProbability >= 80
                ? `linear-gradient(90deg, ${biasColor}90, ${biasColor})`
                : moveProbability >= 60
                ? `linear-gradient(90deg, ${biasColor}60, ${biasColor}90)`
                : `linear-gradient(90deg, ${biasColor}30, ${biasColor}60)`,
            }}
          />
          {/* 80% threshold marker */}
          <div
            className="absolute top-0 bottom-0 w-px"
            style={{ left: '80%', background: 'rgba(255,255,255,0.2)' }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-[10px] text-gray-600">Low</span>
          <span className="text-[10px] text-gray-600">80% threshold</span>
          <span className="text-[10px] text-gray-600">High</span>
        </div>
        {/* Confidence history sparkline */}
        {confidenceHistory && confidenceHistory.length >= 2 && (
          <div className="mt-3 mb-1 w-full">
            <ConfidenceSparkline
              history={confidenceHistory}
              height={48}
              threshold={80}
            />
          </div>
        )}
        {/* One-liner */}
        <p className="text-xs text-gray-400 mt-2">
          {thesis.oneLiner}
        </p>
        {mlLoading && !mlPrediction && (
          <div className="flex items-center gap-2 mt-2">
            <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
            <span className="text-[10px] text-gray-500">ML model analyzing...</span>
          </div>
        )}
        {mlError && !mlPrediction && (
          <p className="text-[10px] text-amber-500/70 mt-2">{mlError}</p>
        )}
      </div>

      {/* ── THESIS ────────────────────────────────────────── */}
      <div
        className="px-5 py-4 border-b"
        style={{
          borderColor: COLORS.cardBorder,
          background: `${biasColor}08`,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Target className="w-4 h-4" style={{ color: biasColor }} />
          <span className="text-xs font-bold text-gray-300 uppercase tracking-wider">Thesis</span>
          <div
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{ background: `${biasColor}20`, color: biasColor }}
          >
            {thesis.bias}
          </div>
        </div>
        <p className="text-sm text-gray-200 leading-relaxed">{thesis.body}</p>
      </div>

      {/* ── SETUP (entry/targets/stop) ────────────────────── */}
      {thesis.setup && (thesis.setup.entry || thesis.setup.targets.length > 0 || thesis.setup.stop) && (
        <div className="px-5 py-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-3.5 h-3.5" style={{ color: COLORS.cyan }} />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Setup</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {thesis.setup.entry && (
              <SetupLevel label="Entry" value={thesis.setup.entry} color={COLORS.cyan} />
            )}
            {thesis.setup.targets.map((t, i) => (
              <SetupLevel key={i} label={`Target ${i + 1}`} value={t} color={COLORS.green} />
            ))}
            {thesis.setup.stop && (
              <SetupLevel label="Stop" value={thesis.setup.stop} color={COLORS.red} />
            )}
          </div>
        </div>
      )}

      {/* ── RISK ──────────────────────────────────────────── */}
      {thesis.risk && (
        <div className="px-5 py-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Risk</span>
          </div>
          <p className="text-xs text-gray-400 leading-relaxed">{thesis.risk}</p>
        </div>
      )}

      {/* ── SUPPORTING DATA (collapsible) ─────────────────── */}
      <div className="px-5 py-2 border-b" style={{ borderColor: COLORS.cardBorder }}>
        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Supporting Data</span>
      </div>
      {signals.map((signal, i) => {
        const key = signal.label;
        const isOpen = expandedSections.has(key);
        const Icon = signal.icon;
        const color = signal.bias === 'BULLISH' ? COLORS.green
          : signal.bias === 'BEARISH' ? COLORS.red
          : signal.bias === 'NEUTRAL' ? '#ffc107' : '#555';

        return (
          <div key={i} className="border-b last:border-b-0" style={{ borderColor: COLORS.cardBorder }}>
            <button
              onClick={() => toggleSection(key)}
              className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-white/[0.02] transition-colors"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="w-6 h-6 rounded flex items-center justify-center"
                  style={{ background: `${color}15` }}
                >
                  <Icon className="w-3 h-3" style={{ color }} />
                </div>
                <span className="text-xs font-bold text-gray-300">{signal.label}</span>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                <span className="text-[10px] font-semibold" style={{ color }}>
                  {signal.bias === 'NO_DATA' ? 'NO DATA' : signal.bias}
                </span>
              </div>
              {isOpen
                ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />
              }
            </button>
            {isOpen && (
              <div className="px-5 pb-3 pl-[52px]">
                <p className="text-xs text-gray-400 leading-relaxed">{signal.summary}</p>
                {signal.details.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {signal.details.map((d, j) => (
                      <li key={j} className="text-[10px] text-gray-500 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-gray-600" />
                        {d}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   ASK YODHA CHAT INPUT
   ────────────────────────────────────────────────────────── */

interface AskYodhaChatProps {
  ticker: string;
  price: number;
  levels: YodhaAnalysisProps['levels'];
  marketSession: string;
  changePercent?: number;
  flowStats?: YodhaAnalysisProps['flowStats'];
  darkPoolStats?: YodhaAnalysisProps['darkPoolStats'];
  newsItems?: any[];
  relativeStrength?: YodhaAnalysisProps['relativeStrength'];
  mlPrediction?: MLPrediction | null;
  volumePressure?: number;
}

/** Build a comprehensive context string from all war room data */
function buildWarRoomContext(props: AskYodhaChatProps): string {
  const {
    ticker, price, levels, marketSession, changePercent,
    flowStats, darkPoolStats, newsItems, relativeStrength,
    mlPrediction, volumePressure,
  } = props;

  const lines: string[] = [];

  // Price & Session
  lines.push(`TICKER: ${ticker} | Price: $${price?.toFixed(2)} | Change: ${changePercent !== undefined ? `${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%` : 'N/A'} | Session: ${marketSession}`);

  // Key Levels
  const lvl = levels;
  const levelParts: string[] = [];
  if (lvl.callWall) levelParts.push(`Call Wall: $${lvl.callWall.toFixed(2)} (${((lvl.callWall - price) / price * 100).toFixed(1)}% away)`);
  if (lvl.putWall) levelParts.push(`Put Wall: $${lvl.putWall.toFixed(2)} (${((lvl.putWall - price) / price * 100).toFixed(1)}% away)`);
  if (lvl.gexFlip) levelParts.push(`GEX Flip: $${lvl.gexFlip.toFixed(2)} (price ${price > lvl.gexFlip ? 'ABOVE' : 'BELOW'} → gamma is ${price > lvl.gexFlip ? 'positive/stabilizing' : 'negative/volatile'})`);
  if (lvl.maxPain) levelParts.push(`Max Pain: $${lvl.maxPain.toFixed(2)}`);
  if (lvl.vwap) levelParts.push(`VWAP: $${lvl.vwap.toFixed(2)} (price ${price > lvl.vwap ? 'above' : 'below'})`);
  if (levelParts.length) lines.push(`GAMMA & LEVELS: ${levelParts.join(' | ')}`);

  // Options Flow
  if (flowStats) {
    const flowParts: string[] = [];
    if (flowStats.callRatio !== undefined) flowParts.push(`Call ratio: ${(flowStats.callRatio * 100).toFixed(0)}%`);
    if (flowStats.netDeltaAdjustedFlow !== undefined) {
      const ndf = flowStats.netDeltaAdjustedFlow;
      flowParts.push(`Net delta-adjusted flow: ${ndf >= 0 ? '+' : ''}$${(ndf / 1e6).toFixed(1)}M (${ndf > 0 ? 'bullish' : 'bearish'})`);
    }
    if (flowStats.sweepRatio !== undefined) flowParts.push(`Sweep ratio: ${(flowStats.sweepRatio * 100).toFixed(0)}%`);
    if (flowStats.unusualCount !== undefined) flowParts.push(`Unusual trades: ${flowStats.unusualCount}`);
    if (flowStats.totalCallPremium !== undefined && flowStats.totalPutPremium !== undefined) {
      flowParts.push(`Call premium: $${(flowStats.totalCallPremium / 1e6).toFixed(1)}M | Put premium: $${(flowStats.totalPutPremium / 1e6).toFixed(1)}M`);
    }
    if (flowParts.length) lines.push(`OPTIONS FLOW: ${flowParts.join(' | ')}`);
  }

  // Dark Pool
  if (darkPoolStats) {
    const dpParts: string[] = [];
    if (darkPoolStats.bullishPct !== undefined) dpParts.push(`Bullish: ${darkPoolStats.bullishPct.toFixed(0)}%`);
    if (darkPoolStats.bearishPct !== undefined) dpParts.push(`Bearish: ${darkPoolStats.bearishPct.toFixed(0)}%`);
    if (darkPoolStats.printCount !== undefined) dpParts.push(`Prints: ${darkPoolStats.printCount}`);
    if (darkPoolStats.regime) dpParts.push(`Regime: ${darkPoolStats.regime}`);
    if (dpParts.length) lines.push(`DARK POOL: ${dpParts.join(' | ')}`);
  }

  // Relative Strength
  if (relativeStrength) {
    lines.push(`RELATIVE STRENGTH: ${ticker} ${relativeStrength.tickerChange >= 0 ? '+' : ''}${relativeStrength.tickerChange.toFixed(2)}% vs SPY ${relativeStrength.spyChange >= 0 ? '+' : ''}${relativeStrength.spyChange.toFixed(2)}% → RS score: ${relativeStrength.rsVsSpy.toFixed(2)} (${relativeStrength.regime})`);
  }

  // ML Prediction
  if (mlPrediction) {
    lines.push(`ML MODEL: Move probability: ${(mlPrediction.move_probability * 100).toFixed(0)}% | Direction: ${mlPrediction.direction} (${(mlPrediction.direction_confidence * 100).toFixed(0)}% confidence) | Signal: ${mlPrediction.signal_strength}`);
  }

  // Volume Pressure
  if (volumePressure !== undefined) {
    const vpLabel = volumePressure > 60 ? 'heavy buying' : volumePressure < 40 ? 'heavy selling' : 'neutral';
    lines.push(`VOLUME PRESSURE: ${volumePressure.toFixed(0)}% buy-side (${vpLabel})`);
  }

  // News Sentiment
  if (newsItems && newsItems.length > 0) {
    const sentiments = newsItems.slice(0, 5).map((n: any) =>
      `"${(n.title || '').slice(0, 60)}${(n.title || '').length > 60 ? '...' : ''}" [${n.sentiment || 'neutral'}]`
    );
    lines.push(`NEWS (last ${sentiments.length}): ${sentiments.join(' | ')}`);
  }

  return lines.join('\n');
}

/* Animated glowing Yodha icon */
function YodhaGlowIcon({ size = 28, pulse = true }: { size?: number; pulse?: boolean }) {
  return (
    <div className="relative flex items-center justify-center" style={{ width: size + 12, height: size + 12 }}>
      {/* Outer glow rings */}
      {pulse && (
        <>
          <div
            className="absolute inset-0 rounded-full animate-ping"
            style={{
              background: `radial-gradient(circle, ${COLORS.cyan}30 0%, transparent 70%)`,
              animationDuration: '3s',
            }}
          />
          <div
            className="absolute rounded-full"
            style={{
              inset: 2,
              background: `radial-gradient(circle, ${COLORS.cyan}15 0%, transparent 60%)`,
              animation: 'pulse 2s ease-in-out infinite',
            }}
          />
        </>
      )}
      {/* Core icon */}
      <div
        className="relative z-10 flex items-center justify-center rounded-full"
        style={{
          width: size,
          height: size,
          background: `linear-gradient(135deg, ${COLORS.cyan}25, ${COLORS.purple}20)`,
          border: `1.5px solid ${COLORS.cyan}50`,
          boxShadow: `0 0 12px ${COLORS.cyan}30, 0 0 4px ${COLORS.cyan}20`,
        }}
      >
        <Shield className="text-white" style={{ width: size * 0.5, height: size * 0.5, color: COLORS.cyan }} />
      </div>
    </div>
  );
}

/** Generate smart suggestions based on current market context */
function getContextSuggestions(
  ticker: string,
  session: string,
  levels: AskYodhaChatProps['levels'],
  changePercent?: number,
): string[] {
  const t = ticker;

  // Session-aware suggestions
  if (session === 'pre-market' || session === 'premarket') {
    return [
      `How should I play the ${t} gap today?`,
      `What does premarket flow say about ${t}?`,
      `Key levels to watch for ${t} at open`,
      `Is this a fade or follow for ${t}?`,
    ];
  }

  if (session === 'closed' || session === 'after-hours') {
    return [
      `Recap ${t}'s session — what stood out?`,
      `What's the setup for ${t} tomorrow?`,
      `Where are the key gamma levels for ${t}?`,
      `Break down today's dark pool activity on ${t}`,
    ];
  }

  // Market-hours suggestions — adapt to price action
  const isSelling = (changePercent ?? 0) < -1.5;
  const isRipping = (changePercent ?? 0) > 1.5;

  if (isSelling) {
    return [
      `Is ${t} finding support here or more downside?`,
      `Where's the put wall floor for ${t}?`,
      `Is smart money buying this ${t} dip?`,
      `Risk/reward to go long ${t} here?`,
    ];
  }

  if (isRipping) {
    return [
      `Is ${t} extended or just getting started?`,
      `Where does ${t} run into call wall resistance?`,
      `Is the ${t} rally backed by flow?`,
      `Where should I take profit on ${t}?`,
    ];
  }

  // Default market-hours (choppy / neutral)
  return [
    `What's the best entry for ${t} right now?`,
    `Bull or bear case for ${t} today?`,
    `Is options flow confirming the ${t} move?`,
    `What would invalidate the ${t} thesis?`,
  ];
}

export function AskYodhaChat(props: AskYodhaChatProps) {
  const { ticker, price, levels, marketSession, changePercent } = props;
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => getContextSuggestions(ticker, marketSession, levels, changePercent),
    [ticker, marketSession, levels, changePercent]
  );

  // Reset answer when ticker changes
  useEffect(() => { setAnswer(''); }, [ticker]);

  const handleAsk = useCallback(async (q?: string) => {
    const question = q || query.trim();
    if (!question) return;
    setLoading(true);
    setAnswer('');
    try {
      const warRoomContext = buildWarRoomContext(props);
      const res = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: `[WAR ROOM DATA]\n${warRoomContext}\n\n[QUESTION]\n${question}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setAnswer(`Error: ${data.error || `HTTP ${res.status}`}`);
      } else {
        setAnswer(data.data?.message || data.answer || data.data?.answer || data.fullResponse || 'No response received.');
      }
    } catch (err: any) {
      setAnswer(`Error: ${err.message}`);
    } finally {
      setLoading(false);
      setQuery('');
    }
  }, [query, props]);

  const borderColor = focused || loading ? COLORS.cyan : 'rgba(0,229,255,0.15)';

  return (
    <div
      className="rounded-xl overflow-hidden relative transition-all duration-500"
      style={{
        background: `linear-gradient(135deg, rgba(0,229,255,0.04) 0%, rgba(124,77,255,0.03) 50%, rgba(0,229,255,0.02) 100%)`,
        border: `1px solid ${borderColor}`,
        boxShadow: focused || loading
          ? `0 0 20px ${COLORS.cyan}15, 0 0 40px ${COLORS.cyan}08`
          : `0 0 10px ${COLORS.cyan}06`,
      }}
    >
      {/* Header with glowing icon */}
      <div className="px-4 pt-3.5 pb-1 flex items-center gap-2.5">
        <YodhaGlowIcon size={24} pulse={!answer && !loading} />
        <div className="flex-1">
          <span
            className="text-xs font-bold tracking-wide"
            style={{ color: COLORS.cyan, fontFamily: "'Oxanium', monospace" }}
          >
            ASK YODHA
          </span>
          <span className="text-[10px] text-gray-500 ml-2">
            AI Trading Analysis
          </span>
        </div>
        {answer && (
          <button
            onClick={() => setAnswer('')}
            className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            Clear
          </button>
        )}
      </div>

      {/* Answer area */}
      {answer && (
        <div className="px-4 pt-2 pb-3">
          <div
            className="rounded-lg px-4 py-3"
            style={{
              background: `linear-gradient(135deg, ${COLORS.cyan}08, ${COLORS.purple}05)`,
              border: `1px solid ${COLORS.cyan}15`,
            }}
          >
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>
        </div>
      )}

      {/* Suggestions — only show when no answer */}
      {!answer && !loading && (
        <div className="px-4 pt-1 pb-1 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => { setQuery(s); handleAsk(s); }}
              className="group px-3 py-1.5 rounded-full text-[11px] transition-all duration-200"
              style={{
                color: 'rgba(255,255,255,0.5)',
                background: 'rgba(0,229,255,0.04)',
                border: '1px solid rgba(0,229,255,0.08)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = `${COLORS.cyan}30`;
                e.currentTarget.style.color = 'rgba(255,255,255,0.8)';
                e.currentTarget.style.background = `${COLORS.cyan}10`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(0,229,255,0.08)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.5)';
                e.currentTarget.style.background = 'rgba(0,229,255,0.04)';
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Loading state */}
      {loading && !answer && (
        <div className="px-4 pt-2 pb-1 flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-gray-500">Yodha is analyzing {ticker}...</span>
        </div>
      )}

      {/* Input bar */}
      <div className="px-4 py-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={`Ask about ${ticker}...`}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 focus:outline-none"
          style={{ fontFamily: "'Oxanium', monospace" }}
          disabled={loading}
        />
        <button
          onClick={() => handleAsk()}
          disabled={loading || !query.trim()}
          className="p-2 rounded-lg transition-all duration-200 disabled:opacity-20"
          style={{
            background: query.trim() ? `${COLORS.cyan}20` : 'transparent',
            color: COLORS.cyan,
            boxShadow: query.trim() ? `0 0 8px ${COLORS.cyan}20` : 'none',
          }}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   SETUP LEVEL DISPLAY
   ────────────────────────────────────────────────────────── */

function SetupLevel({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="px-3 py-2 rounded-lg" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
      <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-mono font-bold" style={{ color }}>{value}</div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   THESIS BUILDERS
   ────────────────────────────────────────────────────────── */

function buildFlowSignal(ticker: string, flow: YodhaAnalysisProps['flowStats'], session: string): SupportingSignal {
  if (session !== 'open') {
    return { icon: Sparkles, label: 'Options Flow', bias: 'NO_DATA', summary: 'Options flow data not available outside market hours.', details: [], confidence: 'NONE' };
  }
  if (!flow || !flow.tradeCount || flow.tradeCount === 0) {
    return { icon: Sparkles, label: 'Options Flow', bias: 'NO_DATA', summary: 'No options flow detected in the selected timeframe.', details: [], confidence: 'NONE' };
  }

  const callRatio = flow.callRatio || 50;
  const putRatio = flow.putRatio || 50;
  const netFlow = flow.netDeltaAdjustedFlow || 0;
  const sweepRatio = (flow.sweepRatio || 0) * 100;
  const unusualCount = flow.unusualCount || 0;

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  const details: string[] = [];

  if (callRatio >= 65) { bias = 'BULLISH'; details.push(`${callRatio.toFixed(0)}% call-dominated flow`); }
  else if (putRatio >= 65) { bias = 'BEARISH'; details.push(`${putRatio.toFixed(0)}% put-dominated flow`); }
  else { details.push(`Balanced ${callRatio.toFixed(0)}/${putRatio.toFixed(0)} call/put ratio`); }

  if (Math.abs(netFlow) > 50000) details.push(`Net delta flow ${netFlow > 0 ? '+' : ''}$${(netFlow / 1000).toFixed(0)}K`);
  if (sweepRatio > 10) details.push(`${sweepRatio.toFixed(0)}% sweep activity — institutional urgency`);
  if (unusualCount > 0) details.push(`${unusualCount} unusual trade${unusualCount > 1 ? 's' : ''} flagged`);

  const confidence = flow.tradeCount >= 50 ? 'HIGH' : flow.tradeCount >= 20 ? 'MEDIUM' : 'LOW';

  let summary = '';
  if (bias === 'BULLISH') {
    summary = `Call-heavy flow (${callRatio.toFixed(0)}%) with ${flow.tradeCount} trades.`;
    if (sweepRatio > 10) summary += ` Sweep activity at ${sweepRatio.toFixed(0)}% signals institutional conviction.`;
    if (netFlow > 100000) summary += ` Strong bullish delta positioning.`;
  } else if (bias === 'BEARISH') {
    summary = `Put-heavy flow (${putRatio.toFixed(0)}%) across ${flow.tradeCount} trades.`;
    if (sweepRatio > 10) summary += ` Aggressive put sweeps suggest downside bets.`;
    if (netFlow < -100000) summary += ` Strong bearish delta positioning.`;
  } else {
    summary = `Balanced flow with no clear directional bias. ${flow.tradeCount} trades, ${callRatio.toFixed(0)}/${putRatio.toFixed(0)} call/put.`;
  }

  return { icon: Sparkles, label: 'Options Flow', bias, summary, details, confidence };
}

function buildDarkPoolSignal(ticker: string, dp: YodhaAnalysisProps['darkPoolStats'], session: string): SupportingSignal {
  if (session !== 'open') {
    return { icon: Building2, label: 'Dark Pool', bias: 'NO_DATA', summary: 'Dark pool data not available outside market hours.', details: [], confidence: 'NONE' };
  }
  if (!dp || !dp.printCount || dp.printCount === 0) {
    return { icon: Building2, label: 'Dark Pool', bias: 'NO_DATA', summary: 'No significant dark pool prints detected in this timeframe.', details: [], confidence: 'NONE' };
  }

  const bullPct = dp.bullishPct || 0;
  const totalValue = dp.totalValue || 0;
  const printCount = dp.printCount;

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullPct > 60) bias = 'BULLISH';
  else if (bullPct < 40) bias = 'BEARISH';

  const valueStr = totalValue >= 1000000
    ? `$${(totalValue / 1000000).toFixed(1)}M`
    : `$${(totalValue / 1000).toFixed(0)}K`;

  let summary = `${printCount} dark pool prints totaling ${valueStr}.`;
  if (bias === 'BULLISH') summary += ` ${bullPct.toFixed(0)}% bullish — institutional accumulation pattern.`;
  else if (bias === 'BEARISH') summary += ` ${(100 - bullPct).toFixed(0)}% bearish — institutional distribution detected.`;
  else summary += ` Flow evenly split (${bullPct.toFixed(0)}% bullish) — no clear institutional direction.`;

  return {
    icon: Building2,
    label: 'Dark Pool',
    bias,
    summary,
    details: [],
    confidence: printCount >= 10 ? 'HIGH' : printCount >= 3 ? 'MEDIUM' : 'LOW',
  };
}

function buildNewsSignal(ticker: string, news: any[]): SupportingSignal {
  if (!news || news.length === 0) {
    return { icon: Newspaper, label: 'News Sentiment', bias: 'NEUTRAL', summary: `No recent news for ${ticker}. Sentiment neutral by default.`, details: [], confidence: 'LOW' };
  }

  const tickerSpecific = news.filter(n => {
    const title = (n.title || n.headline || '').toLowerCase();
    return title.includes(ticker.toLowerCase());
  });
  const hasSpecificNews = tickerSpecific.length > 0;

  const positiveWords = ['surge', 'rally', 'gain', 'beat', 'upgrade', 'bull', 'growth', 'record', 'soar', 'jump'];
  const negativeWords = ['drop', 'fall', 'crash', 'miss', 'downgrade', 'bear', 'cut', 'decline', 'plunge', 'weak'];

  let posScore = 0, negScore = 0;
  news.forEach(item => {
    const title = (item.title || item.headline || '').toLowerCase();
    positiveWords.forEach(w => { if (title.includes(w)) posScore++; });
    negativeWords.forEach(w => { if (title.includes(w)) negScore++; });
  });

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (posScore > negScore + 1) bias = 'BULLISH';
  else if (negScore > posScore + 1) bias = 'BEARISH';

  let summary = hasSpecificNews
    ? `${tickerSpecific.length} ${ticker}-specific headline${tickerSpecific.length > 1 ? 's' : ''}.`
    : `${news.length} market news items, none ${ticker}-specific.`;

  if (bias === 'BULLISH') summary += ' Headlines lean positive — supportive sentiment backdrop.';
  else if (bias === 'BEARISH') summary += ' Headlines lean negative — cautious sentiment.';
  else summary += ' Mixed or neutral sentiment from recent headlines.';

  return { icon: Newspaper, label: 'News Sentiment', bias, summary, details: [], confidence: hasSpecificNews ? 'MEDIUM' : 'LOW' };
}

function buildRSSignal(ticker: string, rs: YodhaAnalysisProps['relativeStrength'], changePercent: number, session: string): SupportingSignal {
  if (!rs) {
    return { icon: Activity, label: 'Relative Strength', bias: 'NEUTRAL', summary: 'Relative strength data loading or unavailable.', details: [], confidence: 'NONE' };
  }

  const { rsVsSpy, rsVsQqq, regime, tickerChange, spyChange, qqqChange } = rs;

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM') bias = 'BULLISH';
  else if (regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM') bias = 'BEARISH';

  const isPreMarket = session === 'pre-market';
  const sessionLabel = isPreMarket ? 'Pre-market' : 'Intraday';

  let summary = '';
  if (bias === 'BULLISH') {
    summary = `${sessionLabel}: ${ticker} outperforming — `;
    if (tickerChange > 0 && spyChange < 0) {
      summary += `holding green (+${tickerChange.toFixed(2)}%) while SPY drops (${spyChange.toFixed(2)}%). Strong relative strength.`;
    } else if (tickerChange < 0 && spyChange < 0) {
      summary += `falling less (${tickerChange.toFixed(2)}%) vs SPY (${spyChange.toFixed(2)}%). Relative outperformance in a down market.`;
    } else {
      summary += `up ${tickerChange.toFixed(2)}% vs SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%. Leading by ${rsVsSpy.toFixed(2)}%.`;
    }
  } else if (bias === 'BEARISH') {
    summary = `${sessionLabel}: ${ticker} underperforming — `;
    if (tickerChange < 0 && spyChange > 0) {
      summary += `red (${tickerChange.toFixed(2)}%) while SPY rallies (+${spyChange.toFixed(2)}%). Notable weakness.`;
    } else if (tickerChange < 0 && spyChange < 0) {
      summary += `falling harder (${tickerChange.toFixed(2)}%) vs SPY (${spyChange.toFixed(2)}%). Relative weakness amplifying the selloff.`;
    } else {
      summary += `lagging at ${tickerChange.toFixed(2)}% vs SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%. Trailing by ${rsVsSpy.toFixed(2)}%.`;
    }
  } else {
    summary = `${sessionLabel}: ${ticker} trading in line. RS vs SPY: ${rsVsSpy >= 0 ? '+' : ''}${rsVsSpy.toFixed(2)}%, vs QQQ: ${rsVsQqq >= 0 ? '+' : ''}${rsVsQqq.toFixed(2)}%.`;
  }

  // During pre-market, if both ticker and market are down, highlight the relative weakness
  if (isPreMarket && tickerChange < -1 && spyChange < -1 && bias === 'NEUTRAL') {
    const bothDown = `Both ${ticker} (${tickerChange.toFixed(2)}%) and SPY (${spyChange.toFixed(2)}%) gapping down pre-market. `;
    if (Math.abs(rsVsSpy) < 0.5) {
      summary = `${sessionLabel}: Broad selloff. ${bothDown}Moving in lockstep — watch for divergence at open.`;
    }
  }

  return { icon: Activity, label: 'Relative Strength', bias, summary, details: [], confidence: isPreMarket ? 'LOW' : 'MEDIUM' };
}

/* ──────────────────────────────────────────────────────────
   UNIFIED THESIS BUILDER
   ────────────────────────────────────────────────────────── */

interface UnifiedThesis {
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  oneLiner: string;
  body: string;
  setup: {
    entry: string | null;
    targets: string[];
    stop: string | null;
  };
  risk: string | null;
}

function buildUnifiedThesis(
  ticker: string,
  price: number,
  changePercent: number,
  signals: SupportingSignal[],
  levels: YodhaAnalysisProps['levels'],
  session: string,
  ml: MLPrediction | null | undefined,
): UnifiedThesis {

  if (session === 'closed' || session === 'after-hours') {
    return {
      bias: 'NEUTRAL',
      oneLiner: `Market closed · ${ticker} ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% today`,
      body: `Market closed. ${ticker} finished the session ${changePercent >= 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}%. Active thesis resumes at market open. Review supporting data from today's session below.`,
      setup: { entry: null, targets: [], stop: null },
      risk: null,
    };
  }

  if (session === 'pre-market') {
    return {
      bias: 'NEUTRAL',
      oneLiner: `Pre-market · ${ticker} data loading`,
      body: `Pre-market session for ${ticker}. Options flow and dark pool not yet active. Check news sentiment for early reads on today's direction.`,
      setup: { entry: null, targets: [], stop: null },
      risk: null,
    };
  }

  // Count signals
  const activeSignals = signals.filter(t => t.bias !== 'NO_DATA');
  const bullish = activeSignals.filter(t => t.bias === 'BULLISH').length;
  const bearish = activeSignals.filter(t => t.bias === 'BEARISH').length;

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';

  // Factor in ML signal
  if (ml?.has_signal) {
    if (ml.direction === 'BULLISH' && bullish >= 2) bias = 'BULLISH';
    else if (ml.direction === 'BEARISH' && bearish >= 2) bias = 'BEARISH';
    else if (ml.direction === 'BULLISH' && bullish >= 1) bias = 'BULLISH';
    else if (ml.direction === 'BEARISH' && bearish >= 1) bias = 'BEARISH';
    else bias = ml.direction === 'NEUTRAL' ? 'NEUTRAL' : ml.direction;
  } else {
    if (bullish >= 3) bias = 'BULLISH';
    else if (bearish >= 3) bias = 'BEARISH';
    else if (bullish >= 2 && bearish === 0) bias = 'BULLISH';
    else if (bearish >= 2 && bullish === 0) bias = 'BEARISH';
  }

  // Build one-liner (Confidence section)
  const movePct = ml ? (ml.move_probability * 100).toFixed(0) : '—';
  const biasWord = bias === 'BULLISH' ? 'Bullish bias' : bias === 'BEARISH' ? 'Bearish bias' : 'Neutral stance';
  const moveDesc = ml && ml.move_probability >= 0.8 ? 'High move probability' : ml && ml.move_probability >= 0.6 ? 'Moderate move probability' : 'Low move probability';
  const oneLiner = `${biasWord} · ${moveDesc}`;

  // Build thesis body
  const bodyParts: string[] = [];

  // ML context
  if (ml?.has_signal) {
    bodyParts.push(`The ML model shows ${movePct}% probability of a significant move with ${ml.direction.toLowerCase()} directional bias.`);
  }

  // Flow context
  const flowSignal = signals.find(s => s.label === 'Options Flow');
  if (flowSignal && flowSignal.bias !== 'NO_DATA') {
    bodyParts.push(flowSignal.summary);
  }

  // Dark pool context
  const dpSignal = signals.find(s => s.label === 'Dark Pool');
  if (dpSignal && dpSignal.bias !== 'NO_DATA') {
    bodyParts.push(dpSignal.summary);
  }

  // RS context
  const rsSignal = signals.find(s => s.label === 'Relative Strength');
  if (rsSignal && rsSignal.bias !== 'NO_DATA' && rsSignal.bias !== 'NEUTRAL') {
    bodyParts.push(rsSignal.summary);
  }

  // GEX context
  if (levels.gexFlip && price) {
    const aboveFlip = price > levels.gexFlip;
    bodyParts.push(`Price ${aboveFlip ? 'above' : 'below'} GEX flip ($${levels.gexFlip.toFixed(0)}) — ${aboveFlip ? 'mean-reversion zone, moves likely capped' : 'trend zone, moves can extend'}.`);
  }

  if (bodyParts.length === 0) {
    bodyParts.push(`${ticker} at $${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%). Limited data available — wait for more signals before committing.`);
  }

  // Build setup
  const setup: UnifiedThesis['setup'] = { entry: null, targets: [], stop: null };

  if (bias === 'BULLISH') {
    if (levels.vwap) setup.entry = `$${levels.vwap.toFixed(2)} (VWAP)`;
    else setup.entry = `$${price.toFixed(2)} (current)`;

    if (levels.gexFlip && levels.gexFlip > price) setup.targets.push(`$${levels.gexFlip.toFixed(2)} (GEX flip)`);
    if (levels.callWall && levels.callWall > price) setup.targets.push(`$${levels.callWall.toFixed(2)} (call wall)`);
    if (levels.putWall) setup.stop = `$${levels.putWall.toFixed(2)} (put wall)`;
  } else if (bias === 'BEARISH') {
    if (levels.vwap) setup.entry = `$${levels.vwap.toFixed(2)} (VWAP)`;
    else setup.entry = `$${price.toFixed(2)} (current)`;

    if (levels.gexFlip && levels.gexFlip < price) setup.targets.push(`$${levels.gexFlip.toFixed(2)} (GEX flip)`);
    if (levels.putWall && levels.putWall < price) setup.targets.push(`$${levels.putWall.toFixed(2)} (put wall)`);
    if (levels.callWall) setup.stop = `$${levels.callWall.toFixed(2)} (call wall)`;
  }

  // Build risk
  let risk: string | null = null;
  if (bias === 'BULLISH' && levels.putWall) {
    risk = `Thesis invalidated below $${levels.putWall.toFixed(2)} (put wall). Watch for reversal in options flow direction.`;
  } else if (bias === 'BEARISH' && levels.callWall) {
    risk = `Thesis invalidated above $${levels.callWall.toFixed(2)} (call wall). Watch for sudden call sweep activity.`;
  } else if (bias === 'NEUTRAL') {
    risk = `Mixed signals — avoid directional bets until confluence improves. Key levels to watch: call wall at $${levels.callWall?.toFixed(2) || '—'}, put wall at $${levels.putWall?.toFixed(2) || '—'}.`;
  }

  return {
    bias,
    oneLiner,
    body: bodyParts.join(' '),
    setup,
    risk,
  };
}
