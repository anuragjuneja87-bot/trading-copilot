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
import { fetchTimelineHistory, postTimelinePoint, type TimelinePoint } from './confidence-timeline';
import { computeBiasScore } from '@/lib/bias-score';
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
  volumePressure?: number;
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
  volumePressure,
  mlPrediction,
  mlLoading,
  mlError,
  mlMeta,
  mlRefresh,
  confidenceHistory,
}: YodhaAnalysisProps) {

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

  // Move probability from ML — fall back to signal-based confidence
  const mlConfidence = mlPrediction ? mlPrediction.move_probability * 100 : null;
  const hasMLSignal = mlPrediction?.has_signal ?? false;
  const mlDirection = mlPrediction?.direction ?? 'NEUTRAL';

  // ── WEIGHTED DIRECTIONAL BIAS SCORE ──
  // Uses shared scoring algorithm (same as server-side cron worker)
  const { biasScore, biasDirection, bullPressure, bearPressure } = useMemo(() => {
    const result = computeBiasScore({
      callRatio: flowStats?.callRatio,
      sweepRatio: flowStats?.sweepRatio,
      netDelta: flowStats?.netDeltaAdjustedFlow,
      tradeCount: flowStats?.tradeCount,
      dpBullishPct: darkPoolStats?.bullishPct,
      dpPrintCount: darkPoolStats?.printCount,
      price,
      vwap: levels.vwap ?? undefined,
      changePercent,
      volumePressure,
      rsVsSpy: relativeStrength?.rsVsSpy,
      gexFlip: levels.gexFlip ?? undefined,
      callWall: levels.callWall ?? undefined,
      putWall: levels.putWall ?? undefined,
    });
    return {
      biasScore: result.score,
      biasDirection: result.direction,
      bullPressure: result.bullPressure,
      bearPressure: result.bearPressure,
    };
  }, [flowStats, darkPoolStats, levels, price, volumePressure, changePercent, relativeStrength]);

  const signalStrength = biasScore;  // Alias for compatibility

  const moveProbability = mlConfidence !== null ? mlConfidence : signalStrength;
  const isMLBacked = mlConfidence !== null;

  // Signal counts for the confluence bar (needed by timeline recorder + display)
  const activeSignals = signals.filter(s => s.bias !== 'NO_DATA');
  const bullCount = activeSignals.filter(s => s.bias === 'BULLISH').length;
  const bearCount = activeSignals.filter(s => s.bias === 'BEARISH').length;
  const neutralCount = activeSignals.filter(s => s.bias === 'NEUTRAL').length;
  const noDataCount = signals.filter(s => s.bias === 'NO_DATA').length;

  // ── Confidence Timeline: SERVER-SIDE persistence ──
  const [timelineHistory, setTimelineHistory] = useState<TimelinePoint[]>([]);
  
  // Load full day's history from server on mount / ticker change
  useEffect(() => {
    let cancelled = false;
    fetchTimelineHistory(ticker).then(points => {
      if (!cancelled) setTimelineHistory(points);
    });
    return () => { cancelled = true; };
  }, [ticker]);

  // The direction shown on timeline uses weighted score when ML unavailable
  const effectiveDirection = isMLBacked ? mlDirection : biasDirection;

  // Ref to always have latest values for the interval recorder
  const latestValuesRef = useRef({
    moveProbability, bias: effectiveDirection, bullCount, bearCount, neutralCount,
    bullPressure, bearPressure,
  });
  useEffect(() => {
    latestValuesRef.current = {
      moveProbability, bias: effectiveDirection, bullCount, bearCount, neutralCount,
      bullPressure, bearPressure,
    };
  }, [moveProbability, effectiveDirection, bullCount, bearCount, neutralCount, bullPressure, bearPressure]);

  // Last recorded timestamp to avoid duplicates
  const lastRecordedRef = useRef(0);

  // Record on signal change + POST to server
  useEffect(() => {
    if (marketSession !== 'open' || moveProbability === 0) return;
    const now = Date.now();
    if (now - lastRecordedRef.current < 5000) return; // 5s min gap
    lastRecordedRef.current = now;

    const point: TimelinePoint = {
      time: now,
      confidence: moveProbability,
      direction: effectiveDirection,
      bullCount, bearCount, neutralCount,
      bullPressure, bearPressure,
    };
    setTimelineHistory(prev => [...prev, point]);
    postTimelinePoint(ticker, point);
  }, [moveProbability, effectiveDirection, marketSession, ticker, bullCount, bearCount, neutralCount, bullPressure, bearPressure]);

  // Periodic recording every 30s (even when signals are stable)
  useEffect(() => {
    if (marketSession !== 'open') return;
    const interval = setInterval(() => {
      const v = latestValuesRef.current;
      if (v.moveProbability === 0) return;
      const now = Date.now();
      if (now - lastRecordedRef.current < 10000) return; // 10s min for interval
      lastRecordedRef.current = now;

      const point: TimelinePoint = {
        time: now,
        confidence: v.moveProbability,
        direction: v.bias,
        bullCount: v.bullCount,
        bearCount: v.bearCount,
        neutralCount: v.neutralCount,
        bullPressure: v.bullPressure,
        bearPressure: v.bearPressure,
      };
      setTimelineHistory(prev => [...prev, point]);
      postTimelinePoint(ticker, point);
    }, 30000);
    return () => clearInterval(interval);
  }, [marketSession, ticker]);

  // Use weighted direction for display when ML unavailable
  const displayDirection = isMLBacked ? mlDirection : biasDirection;
  const biasColor = displayDirection === 'BULLISH' ? COLORS.green
    : displayDirection === 'BEARISH' ? COLORS.red
    : '#ffc107';

  return (
    <div
      className="rounded-xl overflow-hidden relative"
      style={{
        background: `linear-gradient(180deg, rgba(0,229,255,0.03) 0%, ${COLORS.cardBg} 30%)`,
        border: `1px solid ${COLORS.cardBorder}`,
      }}
    >
      {/* ── HEADER ───────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center relative"
            style={{
              background: `linear-gradient(135deg, ${COLORS.cyan}20, ${COLORS.purple}15)`,
              border: `1px solid ${COLORS.cyan}30`,
              boxShadow: `0 0 12px ${COLORS.cyan}15`,
            }}
          >
            <Shield className="w-4 h-4" style={{ color: COLORS.cyan }} />
          </div>
          <div>
            <span className="text-sm font-black text-white uppercase tracking-wider" style={{ fontFamily: "'Oxanium', monospace" }}>
              Yodha
            </span>
            <span className="text-xs text-gray-300 ml-2">{ticker}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {mlLoading && (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: COLORS.cyan }} />
              <span className="text-[11px] text-gray-400">Analyzing</span>
            </div>
          )}
          {mlRefresh && !mlLoading && (
            <button
              onClick={mlRefresh}
              className="p-1.5 rounded-lg hover:bg-white/5 text-gray-500 hover:text-gray-300 transition-colors"
              title="Refresh analysis"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── COMPACT HEADER: GAUGE + BIAS + SIGNAL DOTS ─── */}
      <div className="px-5 pb-2">
        <div className="flex items-center gap-4">
          {/* Radial Gauge (compact) */}
          <div className="flex-shrink-0 flex flex-col items-center">
            {marketSession === 'pre-market' ? (
              <div
                className="w-[80px] h-[80px] rounded-full flex flex-col items-center justify-center"
                style={{
                  background: `linear-gradient(135deg, ${biasColor}10, ${biasColor}05)`,
                  border: `2px solid ${biasColor}30`,
                }}
              >
                <span className="text-[9px] font-bold uppercase tracking-wider" style={{ color: biasColor }}>Pre-Mkt</span>
                <span className="text-base font-black font-mono leading-tight" style={{ color: biasColor, fontFamily: "'Oxanium', monospace" }}>
                  {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(1)}%
                </span>
              </div>
            ) : (
              <ConfidenceGauge value={moveProbability} color={biasColor} direction={displayDirection} hasSignal={isMLBacked ? hasMLSignal : moveProbability >= 50} />
            )}
            <span className="text-[8px] font-bold uppercase tracking-widest mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
              {marketSession === 'pre-market' ? 'Gap' : isMLBacked ? 'ML' : 'Signals'}
            </span>
          </div>
          {/* Middle: One-liner + levels */}
          <div className="flex-1 min-w-0">
            <p className="text-xs text-gray-200 leading-relaxed">{thesis.oneLiner}</p>
            {mlError && !mlPrediction && marketSession === 'open' && (
              <p className="text-[9px] mt-0.5" style={{ color: 'rgba(255,255,255,0.2)' }}>ML offline — signal-based</p>
            )}
            {(levels.callWall || levels.gexFlip || levels.vwap) && (
              <div className="flex items-center gap-2 flex-wrap mt-1">
                {levels.callWall && <span className="text-[9px] font-mono" style={{ color: COLORS.green + '80' }}>CW ${levels.callWall.toFixed(0)}</span>}
                {levels.putWall && <span className="text-[9px] font-mono" style={{ color: COLORS.red + '80' }}>PW ${levels.putWall.toFixed(0)}</span>}
                {levels.gexFlip && <span className="text-[9px] font-mono" style={{ color: '#a855f780' }}>GEX ${levels.gexFlip.toFixed(0)}</span>}
                {levels.vwap && <span className="text-[9px] font-mono" style={{ color: COLORS.cyan + '80' }}>VWAP ${levels.vwap.toFixed(0)}</span>}
              </div>
            )}
          </div>
          {/* Right: Signal dots + bias badge */}
          <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-md" style={{ background: `${biasColor}15`, color: biasColor, border: `1px solid ${biasColor}25` }}>
              {displayDirection === 'BULLISH' ? '▲ BULLISH' : displayDirection === 'BEARISH' ? '▼ BEARISH' : '◆ NEUTRAL'}
            </span>
            <div className="flex gap-1">
              {signals.map((sig, i) => {
                const dc = sig.bias === 'BULLISH' ? COLORS.green : sig.bias === 'BEARISH' ? COLORS.red : sig.bias === 'NEUTRAL' ? '#ffc107' : '#333';
                return <div key={i} className="w-3 h-3 rounded-full" style={{ background: dc, opacity: sig.bias === 'NO_DATA' ? 0.3 : 1 }} title={`${sig.label}: ${sig.bias}`} />;
              })}
            </div>
            <span className="text-[8px]" style={{ color: 'rgba(255,255,255,0.3)' }}>{bullCount} bull · {bearCount} bear</span>
          </div>
        </div>
      </div>

      {/* ── THESIS ────────────────────────────────────────── */}
      <div
        className="mx-4 mb-3 rounded-lg px-4 py-3.5 relative overflow-hidden"
        style={{
          background: `linear-gradient(135deg, ${biasColor}08, ${biasColor}04)`,
          border: `1px solid ${biasColor}18`,
        }}
      >
        {/* Subtle gradient accent on left edge */}
        <div
          className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-lg"
          style={{ background: `linear-gradient(180deg, ${biasColor}80, ${biasColor}20)` }}
        />
        <p className="text-sm text-white leading-relaxed pl-2">{thesis.body}</p>
      </div>

      {/* ── SETUP (entry/targets/stop) ────────────────────── */}
      {thesis.bearSetup ? (
        /* Mixed signals: show BOTH setups */
        <div className="px-5 pb-3 space-y-2">
          {/* Bull setup */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS.green }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.green }}>Bull Setup</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {thesis.setup.entry && <SetupLevel label="Entry" value={thesis.setup.entry} color={COLORS.green} />}
              {thesis.setup.targets.map((t, i) => <SetupLevel key={i} label={`Target ${i + 1}`} value={t} color={COLORS.green} />)}
              {thesis.setup.stop && <SetupLevel label="Stop" value={thesis.setup.stop} color={COLORS.red} />}
            </div>
          </div>
          {/* Bear setup */}
          <div>
            <div className="flex items-center gap-1.5 mb-1.5">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: COLORS.red }} />
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: COLORS.red }}>Bear Setup</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {thesis.bearSetup.entry && <SetupLevel label="Entry" value={thesis.bearSetup.entry} color={COLORS.red} />}
              {thesis.bearSetup.targets.map((t, i) => <SetupLevel key={i} label={`Target ${i + 1}`} value={t} color={COLORS.red} />)}
              {thesis.bearSetup.stop && <SetupLevel label="Stop" value={thesis.bearSetup.stop} color={COLORS.green} />}
            </div>
          </div>
        </div>
      ) : thesis.setup && (thesis.setup.entry || thesis.setup.targets.length > 0 || thesis.setup.stop) ? (
        <div className="px-5 pb-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
      ) : null}

      {/* ── RISK ──────────────────────────────────────────── */}
      {thesis.risk && (
        <div className="mx-4 mb-3 px-3 py-2 rounded-lg flex items-start gap-2" style={{ background: 'rgba(255,82,82,0.05)', border: '1px solid rgba(255,82,82,0.1)' }}>
          <AlertTriangle className="w-3 h-3 text-amber-500 mt-0.5 flex-shrink-0" />
          <p className="text-[11px] text-gray-200 leading-relaxed">{thesis.risk}</p>
        </div>
      )}

      {/* Supporting signal cards removed — data shown in collapsible panels below */}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   CONFIDENCE RADIAL GAUGE
   ────────────────────────────────────────────────────────── */

function ConfidenceGauge({
  value,
  color,
  direction,
  hasSignal,
}: {
  value: number;
  color: string;
  direction: string;
  hasSignal: boolean;
}) {
  const size = 100;
  const strokeWidth = 6;
  const radius = (size - strokeWidth * 2) / 2;
  const circumference = radius * Math.PI * 1.5; // 270° arc
  const cappedValue = Math.min(Math.max(value, 0), 100);
  const offset = circumference - (cappedValue / 100) * circumference;

  // Start at 135° (bottom-left), sweep 270° clockwise
  const startAngle = 135;
  const arcPath = describeArc(size / 2, size / 2, radius, startAngle, startAngle + 270);
  const filledPath = describeArc(size / 2, size / 2, radius, startAngle, startAngle + (270 * cappedValue / 100));

  // 80% threshold tick
  const threshAngle = startAngle + (270 * 0.8);
  const threshRad = (threshAngle * Math.PI) / 180;
  const tx1 = size / 2 + (radius - 8) * Math.cos(threshRad);
  const ty1 = size / 2 + (radius - 8) * Math.sin(threshRad);
  const tx2 = size / 2 + (radius + 2) * Math.cos(threshRad);
  const ty2 = size / 2 + (radius + 2) * Math.sin(threshRad);

  return (
    <div className="relative" style={{ width: size, height: size - 12 }}>
      <svg width={size} height={size - 12} viewBox={`0 6 ${size} ${size - 12}`}>
        {/* Glow filter */}
        <defs>
          <filter id="gaugeGlow">
            <feGaussianBlur stdDeviation="3" result="glow" />
            <feMerge>
              <feMergeNode in="glow" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background arc */}
        <path
          d={arcPath}
          fill="none"
          stroke="rgba(255,255,255,0.06)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Filled arc */}
        {cappedValue > 0 && (
          <path
            d={filledPath}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            style={{ filter: cappedValue >= 60 ? 'url(#gaugeGlow)' : undefined }}
            opacity={cappedValue >= 80 ? 1 : cappedValue >= 40 ? 0.7 : 0.4}
          />
        )}

        {/* 80% threshold tick */}
        <line
          x1={tx1} y1={ty1} x2={tx2} y2={ty2}
          stroke="rgba(255,255,255,0.2)"
          strokeWidth={1.5}
        />
      </svg>

      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingTop: 4 }}>
        <span
          className="text-xl font-black font-mono leading-none"
          style={{ color, fontFamily: "'Oxanium', monospace" }}
        >
          {cappedValue.toFixed(0)}%
        </span>
        {hasSignal && (
          <span className="text-[9px] font-bold mt-0.5" style={{ color }}>
            {direction}
          </span>
        )}
      </div>
    </div>
  );
}

/** SVG arc path helper */
function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number): string {
  const startRad = (startAngle * Math.PI) / 180;
  const endRad = (endAngle * Math.PI) / 180;
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
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
  sidebarMode?: boolean;
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
    if (flowStats.callRatio !== undefined) flowParts.push(`Call ratio: ${flowStats.callRatio.toFixed(0)}%`);
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
    const change = changePercent ?? 0;
    const isGapUp = change > 0.5;
    const isGapDown = change < -0.5;
    const isBigGap = Math.abs(change) > 2;

    if (isBigGap && isGapUp) {
      return [
        `Game plan for ${t}'s ${change.toFixed(1)}% gap up at open`,
        `Should I buy the first pullback or wait on ${t}?`,
        `Where does ${t} stall? Key resistance levels`,
        `How does broad market weakness affect ${t}'s gap?`,
      ];
    } else if (isBigGap && isGapDown) {
      return [
        `Is ${t}'s gap down a buy-the-dip or more downside?`,
        `Where is support for ${t} after this gap down?`,
        `Game plan for first 5 min on ${t} at open`,
        `Should I short ${t} here or wait for a bounce to fade?`,
      ];
    } else if (isGapUp) {
      return [
        `How should I trade ${t}'s pre-market strength?`,
        `Key entry levels for ${t} at open`,
        `Is ${t} showing relative strength vs the market?`,
        `Fade or follow the ${t} gap today?`,
      ];
    } else if (isGapDown) {
      return [
        `Is ${t}'s dip a buying opportunity at open?`,
        `Key support levels for ${t} today`,
        `How weak is ${t} vs SPY pre-market?`,
        `Risk/reward on shorting ${t} at open`,
      ];
    }
    return [
      `What's the game plan for ${t} at open?`,
      `Key levels to watch for ${t} today`,
      `How is ${t} positioned vs the broader market?`,
      `Should I wait for direction or have a plan ready?`,
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
  const { ticker, price, levels, marketSession, changePercent, sidebarMode } = props;
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; text: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const suggestions = useMemo(
    () => getContextSuggestions(ticker, marketSession, levels, changePercent),
    [ticker, marketSession, levels, changePercent]
  );

  // Reset messages when ticker changes
  useEffect(() => { setMessages([]); }, [ticker]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleAsk = useCallback(async (q?: string) => {
    const question = q || query.trim();
    if (!question) return;
    setLoading(true);
    setMessages(prev => [...prev, { role: 'user', text: question }]);
    setQuery('');
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
      const answer = (!res.ok || !data.success)
        ? `Error: ${data.error || `HTTP ${res.status}`}`
        : (data.data?.message || data.answer || data.data?.answer || data.fullResponse || 'No response received.');
      setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
    } catch (err: any) {
      setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [query, props]);

  const borderColor = focused || loading ? COLORS.cyan : 'rgba(0,229,255,0.15)';

  // ── SIDEBAR MODE — full-height chat panel ──
  if (sidebarMode) {
    return (
      <div className="flex flex-col h-full" style={{ background: 'transparent' }}>
        {/* Header */}
        <div className="px-4 py-3 flex items-center gap-2.5 border-b flex-shrink-0" style={{ borderColor: COLORS.cardBorder }}>
          <YodhaGlowIcon size={22} pulse={messages.length === 0 && !loading} />
          <div className="flex-1">
            <span className="text-xs font-bold tracking-wide" style={{ color: COLORS.cyan, fontFamily: "'Oxanium', monospace" }}>
              ASK YODHA
            </span>
            <span className="text-[11px] ml-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
              AI Analysis
            </span>
          </div>
          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="text-xs text-gray-400 hover:text-white transition-colors px-2 py-0.5 rounded"
              style={{ background: 'rgba(255,255,255,0.04)' }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Scrollable message area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar px-3 py-3 space-y-3">
          {/* Welcome + suggestions when no messages */}
          {messages.length === 0 && !loading && (
            <div className="space-y-3">
              <div className="text-center py-6">
                <div className="text-sm text-gray-400 mb-4">
                  Ask anything about <span className="font-bold text-white">{ticker}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onClick={() => handleAsk(s)}
                    className="text-left px-3 py-2.5 rounded-lg text-sm transition-all duration-200"
                    style={{
                      color: 'rgba(255,255,255,0.75)',
                      background: 'rgba(0,229,255,0.05)',
                      border: `1px solid ${COLORS.cyan}20`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = `${COLORS.cyan}60`;
                      e.currentTarget.style.background = `${COLORS.cyan}12`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = `${COLORS.cyan}20`;
                      e.currentTarget.style.background = 'rgba(0,229,255,0.05)';
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message history */}
          {messages.map((msg, i) => (
            <div key={i} className={msg.role === 'user' ? 'flex justify-end' : ''}>
              {msg.role === 'user' ? (
                <div
                  className="max-w-[85%] px-3 py-2 rounded-lg text-sm text-white font-medium"
                  style={{ background: `${COLORS.cyan}18`, border: `1px solid ${COLORS.cyan}25` }}
                >
                  {msg.text}
                </div>
              ) : (
                <div
                  className="px-3 py-2.5 rounded-lg text-sm text-gray-200 leading-relaxed whitespace-pre-wrap"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                >
                  {msg.text}
                </div>
              )}
            </div>
          ))}

          {/* Loading indicator */}
          {loading && (
            <div className="flex items-center gap-2 px-1">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '300ms' }} />
              </div>
              <span className="text-xs text-gray-400">Analyzing {ticker}...</span>
            </div>
          )}
        </div>

        {/* Pinned input at bottom */}
        <div className="px-3 py-3 border-t flex-shrink-0" style={{ borderColor: COLORS.cardBorder }}>
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg transition-all"
            style={{
              background: 'rgba(0,229,255,0.04)',
              border: `1px solid ${focused ? COLORS.cyan : `${COLORS.cyan}20`}`,
            }}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={`Ask about ${ticker}...`}
              className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 focus:outline-none"
              style={{ fontFamily: "'Oxanium', monospace" }}
              disabled={loading}
            />
            <button
              onClick={() => handleAsk()}
              disabled={loading || !query.trim()}
              className="p-1.5 rounded-md transition-all duration-200 disabled:opacity-20"
              style={{ color: COLORS.cyan }}
            >
              {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── INLINE MODE — original compact card (fallback) ──
  const latestAnswer = messages.length > 0 ? messages[messages.length - 1] : null;
  const answer = latestAnswer?.role === 'assistant' ? latestAnswer.text : '';

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
      <div className="px-4 pt-3.5 pb-1 flex items-center gap-2.5">
        <YodhaGlowIcon size={24} pulse={!answer && !loading} />
        <div className="flex-1">
          <span className="text-xs font-bold tracking-wide" style={{ color: COLORS.cyan, fontFamily: "'Oxanium', monospace" }}>
            ASK YODHA
          </span>
          <span className="text-[11px] ml-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
            AI Trading Analysis
          </span>
        </div>
        {answer && (
          <button
            onClick={() => setMessages([])}
            className="text-[11px] text-gray-300 hover:text-white transition-colors px-2 py-0.5 rounded"
            style={{ background: 'rgba(255,255,255,0.04)' }}
          >
            Clear
          </button>
        )}
      </div>

      {answer && (
        <div className="px-4 pt-2 pb-3">
          <div
            className="rounded-lg px-4 py-3"
            style={{ background: `linear-gradient(135deg, ${COLORS.cyan}08, ${COLORS.purple}05)`, border: `1px solid ${COLORS.cyan}15` }}
          >
            <p className="text-sm text-gray-100 leading-relaxed whitespace-pre-wrap">{answer}</p>
          </div>
        </div>
      )}

      {!answer && !loading && (
        <div className="px-4 pt-1 pb-1 flex flex-wrap gap-1.5">
          {suggestions.map((s, i) => (
            <button key={i} onClick={() => handleAsk(s)}
              className="group px-3 py-1.5 rounded-full text-[11px] transition-all duration-200"
              style={{ color: 'rgba(255,255,255,0.85)', background: 'rgba(0,229,255,0.08)', border: `1px solid ${COLORS.cyan}30` }}
              onMouseEnter={(e) => { e.currentTarget.style.borderColor = COLORS.cyan; e.currentTarget.style.background = `${COLORS.cyan}20`; }}
              onMouseLeave={(e) => { e.currentTarget.style.borderColor = `${COLORS.cyan}30`; e.currentTarget.style.background = 'rgba(0,229,255,0.08)'; }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {loading && !answer && (
        <div className="px-4 pt-2 pb-1 flex items-center gap-2">
          <div className="flex gap-1">
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '0ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '150ms' }} />
            <div className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: COLORS.cyan, animationDelay: '300ms' }} />
          </div>
          <span className="text-xs text-gray-300">Yodha is analyzing {ticker}...</span>
        </div>
      )}

      <div className="px-4 py-3 flex items-center gap-2">
        <input ref={inputRef} type="text" value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
          onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
          placeholder={`Ask about ${ticker}...`}
          className="flex-1 bg-transparent text-sm text-white placeholder-gray-400 focus:outline-none"
          style={{ fontFamily: "'Oxanium', monospace" }}
          disabled={loading}
        />
        <button onClick={() => handleAsk()} disabled={loading || !query.trim()}
          className="p-2 rounded-lg transition-all duration-200 disabled:opacity-20"
          style={{ background: query.trim() ? `${COLORS.cyan}20` : 'transparent', color: COLORS.cyan }}>
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
      <div className="text-[10px] font-bold text-gray-300 uppercase tracking-wider">{label}</div>
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
    const tLower = ticker.toLowerCase();
    // Check headline text
    if (title.includes(tLower)) return true;
    // Check tickers array from Polygon API
    if (n.tickers && Array.isArray(n.tickers) && n.tickers.includes(ticker.toUpperCase())) return true;
    return false;
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
  bearSetup?: {
    entry: string | null;
    targets: string[];
    stop: string | null;
  } | null;
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
    // ── PRE-MARKET THESIS: Synthesize available signals ──
    const activeSignals = signals.filter(s => s.bias !== 'NO_DATA');
    const bullish = activeSignals.filter(s => s.bias === 'BULLISH').length;
    const bearish = activeSignals.filter(s => s.bias === 'BEARISH').length;

    // Determine gap direction and magnitude
    const isGapUp = changePercent > 0.5;
    const isGapDown = changePercent < -0.5;
    const isBigGap = Math.abs(changePercent) > 2;
    const gapDesc = isGapUp
      ? `gapping up ${changePercent.toFixed(2)}%`
      : isGapDown
        ? `gapping down ${Math.abs(changePercent).toFixed(2)}%`
        : `flat in pre-market (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`;

    // Determine bias from available signals
    let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (bullish >= 2 || (isGapUp && bullish >= 1)) bias = 'BULLISH';
    else if (bearish >= 2 || (isGapDown && bearish >= 1)) bias = 'BEARISH';
    else if (isGapUp) bias = 'BULLISH';
    else if (isGapDown) bias = 'BEARISH';

    // One-liner
    const oneLiner = isGapUp
      ? `Pre-market gap up · ${ticker} +${changePercent.toFixed(2)}% · Plan your entry`
      : isGapDown
        ? `Pre-market gap down · ${ticker} ${changePercent.toFixed(2)}% · Watch for levels`
        : `Pre-market · ${ticker} near flat · Wait for open direction`;

    // Build body
    const bodyParts: string[] = [];

    // Gap context
    bodyParts.push(`${ticker} is ${gapDesc} in pre-market at $${price.toFixed(2)}.`);

    // News catalyst
    const newsSignal = signals.find(s => s.label === 'News Sentiment');
    if (newsSignal && newsSignal.bias !== 'NO_DATA' && newsSignal.summary) {
      bodyParts.push(newsSignal.summary);
    }

    // Relative strength context
    const rsSignal = signals.find(s => s.label === 'Relative Strength');
    if (rsSignal && rsSignal.bias !== 'NO_DATA' && rsSignal.bias !== 'NEUTRAL') {
      bodyParts.push(rsSignal.summary);
    }

    // Key levels context — this is the planning value
    if (levels.gexFlip && levels.callWall && levels.putWall) {
      const aboveFlip = price > levels.gexFlip;
      if (isGapUp) {
        bodyParts.push(
          `Key levels: GEX flip at $${levels.gexFlip.toFixed(0)}${aboveFlip ? ' (above — mean-reversion zone, moves may get capped)' : ' (below — trend zone, breakout could extend)'}. ` +
          `Call wall resistance at $${levels.callWall.toFixed(0)}${levels.callWall - price < price * 0.02 ? ' — close to price, may cap upside' : ''}. ` +
          `Put wall support at $${levels.putWall.toFixed(0)}.`
        );
      } else if (isGapDown) {
        bodyParts.push(
          `Key levels: GEX flip at $${levels.gexFlip.toFixed(0)}${!aboveFlip ? ' (below — trend zone, selling can accelerate)' : ' (above — may find support)'}. ` +
          `Put wall support at $${levels.putWall.toFixed(0)}${price - levels.putWall < price * 0.02 ? ' — close to price, watch for bounce' : ''}. ` +
          `Call wall overhead at $${levels.callWall.toFixed(0)}.`
        );
      } else {
        bodyParts.push(
          `Key levels: GEX flip $${levels.gexFlip.toFixed(0)}, call wall $${levels.callWall.toFixed(0)}, put wall $${levels.putWall.toFixed(0)}. Wait for open to establish direction.`
        );
      }
    }

    // Trading approaches
    if (isBigGap && isGapUp) {
      bodyParts.push(
        `Approaches: (1) Wait for first pullback to VWAP${levels.vwap ? ` ($${levels.vwap.toFixed(0)})` : ''} or pre-market high retest. ` +
        `(2) Fade the gap if price rejects at call wall${levels.callWall ? ` ($${levels.callWall.toFixed(0)})` : ''}. ` +
        `(3) Wait 5-10 min for price to settle — let the first candle tell the story. Options flow and dark pool data activate at open.`
      );
    } else if (isBigGap && isGapDown) {
      bodyParts.push(
        `Approaches: (1) Watch for bounce at put wall${levels.putWall ? ` ($${levels.putWall.toFixed(0)})` : ''} or GEX flip. ` +
        `(2) Short continuation if price breaks below pre-market low. ` +
        `(3) Wait for first 5-10 min to assess selling pressure and volume. Flow and dark pool signals activate at open.`
      );
    } else if (isGapUp || isGapDown) {
      bodyParts.push(
        `Watch the first 5-10 min at open. Let volume and flow confirm direction before committing. Options flow and dark pool activate at 9:30.`
      );
    } else {
      bodyParts.push(
        `No significant gap — direction unclear. Wait for open to establish bias with options flow and dark pool confirmation.`
      );
    }

    // Build setup
    const setup: UnifiedThesis['setup'] = { entry: null, targets: [], stop: null };
    if (bias === 'BULLISH') {
      if (levels.vwap) setup.entry = `$${levels.vwap.toFixed(2)} (VWAP pullback)`;
      else setup.entry = `$${(price * 0.995).toFixed(2)} (first pullback)`;
      if (levels.callWall && levels.callWall > price) setup.targets.push(`$${levels.callWall.toFixed(2)} (call wall)`);
      if (levels.gexFlip && levels.gexFlip > price) setup.targets.push(`$${levels.gexFlip.toFixed(2)} (GEX flip)`);
      if (levels.putWall) setup.stop = `$${levels.putWall.toFixed(2)} (put wall)`;
      else if (levels.gexFlip) setup.stop = `$${levels.gexFlip.toFixed(2)} (GEX flip)`;
    } else if (bias === 'BEARISH') {
      if (levels.vwap) setup.entry = `$${levels.vwap.toFixed(2)} (VWAP rejection)`;
      else setup.entry = `$${(price * 1.005).toFixed(2)} (bounce to short)`;
      if (levels.putWall && levels.putWall < price) setup.targets.push(`$${levels.putWall.toFixed(2)} (put wall)`);
      if (levels.gexFlip && levels.gexFlip < price) setup.targets.push(`$${levels.gexFlip.toFixed(2)} (GEX flip)`);
      if (levels.callWall) setup.stop = `$${levels.callWall.toFixed(2)} (call wall)`;
    }

    // Build risk
    let risk: string | null = null;
    if (isBigGap) {
      risk = `Large gaps are volatile — first 5-10 min often fake out. Wait for flow/dark pool confirmation at open before sizing up. ` +
        (bias === 'BULLISH' && levels.putWall
          ? `Invalidated below $${levels.putWall.toFixed(2)} (put wall).`
          : bias === 'BEARISH' && levels.callWall
            ? `Invalidated above $${levels.callWall.toFixed(2)} (call wall).`
            : `Watch for volume confirmation at open.`);
    } else {
      risk = `Pre-market data is thin — thesis refines at open with options flow and dark pool data. Avoid over-committing before 9:30.`;
    }

    return { bias, oneLiner, body: bodyParts.join(' '), setup, risk };
  }

  // Count signals
  const activeSignals = signals.filter(t => t.bias !== 'NO_DATA');
  const bullish = activeSignals.filter(t => t.bias === 'BULLISH').length;
  const bearish = activeSignals.filter(t => t.bias === 'BEARISH').length;
  const total = activeSignals.length;

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

  const isMixed = bullish > 0 && bearish > 0;

  // Build one-liner
  const movePct = ml ? (ml.move_probability * 100).toFixed(0) : '—';
  let oneLiner: string;
  if (isMixed) {
    oneLiner = `Mixed signals · ${bullish} bull / ${bearish} bear · Both setups below`;
  } else if (bias === 'BULLISH') {
    oneLiner = `Bullish bias · ${bullish}/${total} signals aligned`;
  } else if (bias === 'BEARISH') {
    oneLiner = `Bearish bias · ${bearish}/${total} signals aligned`;
  } else {
    oneLiner = `Neutral · Waiting for signal alignment`;
  }
  if (ml?.has_signal) {
    oneLiner += ` · ML ${movePct}% move prob`;
  }

  // Build thesis body
  const bodyParts: string[] = [];

  // ML context
  if (ml?.has_signal) {
    bodyParts.push(`ML model: ${movePct}% move probability, ${ml.direction.toLowerCase()} bias.`);
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

  // For mixed signals: add explicit bull/bear case summary
  if (isMixed) {
    const bullSignals = activeSignals.filter(s => s.bias === 'BULLISH').map(s => s.label).join(', ');
    const bearSignals = activeSignals.filter(s => s.bias === 'BEARISH').map(s => s.label).join(', ');
    bodyParts.push(`Bull case (${bullSignals}) vs Bear case (${bearSignals}). VWAP${levels.vwap ? ` ($${levels.vwap.toFixed(0)})` : ''} is the pivot — bulls need to hold it, bears need to break it.`);
  }

  if (bodyParts.length === 0) {
    bodyParts.push(`${ticker} at $${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%). Limited data — wait for more signals.`);
  }

  // Build setups — ALWAYS show both when mixed
  const setup: UnifiedThesis['setup'] = { entry: null, targets: [], stop: null };
  let bearSetup: UnifiedThesis['bearSetup'] = null;

  if (isMixed) {
    // Bull setup
    if (levels.vwap) setup.entry = `$${levels.vwap.toFixed(2)} (VWAP hold)`;
    else setup.entry = `$${price.toFixed(2)} (current)`;
    if (levels.callWall && levels.callWall > price) setup.targets.push(`$${levels.callWall.toFixed(2)} (call wall)`);
    if (levels.gexFlip && levels.gexFlip > price) setup.targets.push(`$${levels.gexFlip.toFixed(2)} (GEX flip)`);
    setup.stop = levels.gexFlip ? `$${levels.gexFlip.toFixed(2)} (GEX flip)` : levels.putWall ? `$${levels.putWall.toFixed(2)} (put wall)` : null;

    // Bear setup
    bearSetup = { entry: null, targets: [], stop: null };
    if (levels.vwap) bearSetup.entry = `$${levels.vwap.toFixed(2)} (VWAP break)`;
    else bearSetup.entry = `$${price.toFixed(2)} (current)`;
    if (levels.gexFlip && levels.gexFlip < price) bearSetup.targets.push(`$${levels.gexFlip.toFixed(2)} (GEX flip)`);
    if (levels.putWall && levels.putWall < price) bearSetup.targets.push(`$${levels.putWall.toFixed(2)} (put wall)`);
    bearSetup.stop = levels.callWall ? `$${levels.callWall.toFixed(2)} (call wall)` : null;
  } else if (bias === 'BULLISH') {
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
  if (isMixed) {
    risk = `Signals conflicting — VWAP${levels.vwap ? ` ($${levels.vwap.toFixed(0)})` : ''} is the decision level. Above it favors bulls, below it favors bears. Wait for flow/dark pool to align before sizing up.`;
  } else if (bias === 'BULLISH' && levels.putWall) {
    risk = `Thesis invalidated below $${levels.putWall.toFixed(2)} (put wall). Watch for reversal in options flow direction.`;
  } else if (bias === 'BEARISH' && levels.callWall) {
    risk = `Thesis invalidated above $${levels.callWall.toFixed(2)} (call wall). Watch for sudden call sweep activity.`;
  } else if (bias === 'NEUTRAL') {
    risk = `No strong directional signal. Key levels: call wall $${levels.callWall?.toFixed(0) || '—'}, put wall $${levels.putWall?.toFixed(0) || '—'}. Wait for alignment.`;
  }

  return {
    bias,
    oneLiner,
    body: bodyParts.join(' '),
    setup,
    bearSetup,
    risk,
  };
}
