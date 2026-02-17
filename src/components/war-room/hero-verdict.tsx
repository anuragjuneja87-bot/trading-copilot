'use client';

import { COLORS } from '@/lib/echarts-theme';
import { TrendingUp, TrendingDown, Minus, Zap, Activity, Building2 } from 'lucide-react';
import { formatCurrency } from '@/lib/format';

interface HeroVerdictProps {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  verdict: {
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CONFLICTING';
    confidence: number;
    summary: string;
    reliability?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    signals?: {
      flow: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      darkpool: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
      newsAlignment: boolean;
    };
  };
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
  };
  flowStats: {
    netDeltaAdjustedFlow: number;
    sweepRatio: number;
  } | null;
  lastUpdate?: Date | null;
  dataAgeSeconds?: number;
  expectedMove?: {
    value: number;
    percent: number;
    upper: number;
    lower: number;
  } | null;
  ivRank?: number | null;
  rvol?: number | null;
}

export function HeroVerdict({
  ticker,
  price,
  change,
  changePercent,
  verdict,
  levels,
  flowStats,
  lastUpdate,
  dataAgeSeconds = 0,
  expectedMove,
  ivRank,
  rvol,
}: HeroVerdictProps) {
  // Safety check for COLORS
  if (!COLORS) {
    console.error('[HeroVerdict] COLORS is undefined!');
    return <div className="p-4 text-red-400">Error: COLORS not loaded</div>;
  }

  // Safety check for verdict
  if (!verdict) {
    return <div className="p-4 text-gray-400">Loading verdict...</div>;
  }

  // Format data age
  const formatAge = (seconds: number) => {
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };
  
  const ageColor = dataAgeSeconds < 30 ? '#00e676' : 
                   dataAgeSeconds < 120 ? '#ffc107' : '#ff5252';

  const biasColor = verdict.bias === 'BULLISH' ? (COLORS.green || '#00e676') : 
                    verdict.bias === 'BEARISH' ? (COLORS.red || '#ff5252') : 
                    verdict.bias === 'CONFLICTING' ? (COLORS.yellow || '#ffc107') : (COLORS.yellow || '#ffc107');
  
  const BiasIcon = verdict.bias === 'BULLISH' ? TrendingUp : 
                   verdict.bias === 'BEARISH' ? TrendingDown : Minus;

  // Get confidence label
  function getConfidenceLabel(confidence: number): { label: string; color: string } {
    if (confidence >= 70) return { label: 'High Confidence', color: '#00e676' };
    if (confidence >= 40) return { label: 'Medium Confidence', color: '#ffc107' };
    if (confidence >= 20) return { label: 'Low Confidence', color: '#ff9800' };
    return { label: 'Weak Signal', color: '#ff5252' };
  }

  // Get data quality
  interface DataQuality {
    level: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    issues: string[];
  }

  function getDataQuality(stats: typeof flowStats): DataQuality {
    const issues: string[] = [];
    
    if (!stats) {
      return { level: 'INSUFFICIENT', issues: ['no flow data'] };
    }
    
    // Check flow volume
    const absFlow = Math.abs(stats.netDeltaAdjustedFlow || 0);
    if (absFlow < 50000) {
      issues.push('low flow volume');
    }
    
    // Check sweep activity
    const sweepPct = (stats.sweepRatio || 0) * 100;
    if (sweepPct < 5) {
      issues.push('no institutional urgency');
    }
    
    // Determine level
    let level: DataQuality['level'];
    if (issues.length === 0) level = 'HIGH';
    else if (issues.length === 1) level = 'MEDIUM';
    else if (issues.length === 2) level = 'LOW';
    else level = 'INSUFFICIENT';
    
    return { level, issues };
  }

  const conf = getConfidenceLabel(verdict.confidence);
  const quality = getDataQuality(flowStats);

  return (
    <div 
      className="rounded-xl p-4 relative overflow-hidden"
      style={{ 
        background: `linear-gradient(135deg, ${biasColor}15 0%, ${COLORS.cardBg} 50%)`,
        border: `2px solid ${biasColor}40`,
      }}
    >
      {/* Glow effect */}
      <div 
        className="absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-20"
        style={{ background: biasColor }}
      />
      
      {/* Data freshness indicator */}
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <div 
          className="flex items-center gap-1 px-2 py-1 rounded text-[10px]"
          style={{ background: `${ageColor}20`, color: ageColor }}
        >
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ageColor }} />
          Data: {formatAge(dataAgeSeconds)}
        </div>
      </div>
      
      {/* Stale data warning */}
      {dataAgeSeconds > 120 && (
        <div className="absolute top-2 left-2 px-2 py-1 rounded text-[10px] bg-red-500/20 text-red-400">
          ⚠️ STALE DATA - Refresh recommended
        </div>
      )}
      
      <div className="relative flex items-center justify-between">
        {/* Left: Ticker + Price */}
        <div className="flex items-center gap-4">
          {/* Bias Badge */}
          <div 
            className="w-14 h-14 rounded-xl flex items-center justify-center"
            style={{ background: `${biasColor}20`, border: `1px solid ${biasColor}40` }}
          >
            <BiasIcon className="w-7 h-7" style={{ color: biasColor }} />
          </div>
          
          <div>
            <div className="flex items-center gap-3">
              <span 
                className="text-2xl font-bold"
                style={{ color: biasColor, fontFamily: "'Oxanium', monospace" }}
              >
                {verdict.bias === 'CONFLICTING' ? '⚠️ CONFLICTING' : verdict.bias}
              </span>
              <span className="text-gray-500">•</span>
              <span className={`text-sm`} style={{ color: conf.color }}>
                {conf.label}
              </span>
            </div>
            <p className="text-sm text-gray-300 mt-0.5">{verdict.summary}</p>
            
            {/* Consolidated data quality badge */}
            <div className="flex items-center gap-3 mt-3">
              <div className={`
                flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
                ${quality.level === 'HIGH' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : ''}
                ${quality.level === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' : ''}
                ${quality.level === 'LOW' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' : ''}
                ${quality.level === 'INSUFFICIENT' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : ''}
              `}>
                <span className="font-bold">📊 {quality.level}</span>
                {quality.issues.length > 0 && (
                  <span className="text-gray-400">
                    — {quality.issues.join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Center: Key Metrics */}
        <div className="flex items-center gap-6">
          {/* Net Delta Flow */}
          <div className="text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Net Δ Flow</div>
            <div 
              className="text-lg font-bold font-mono"
              style={{ color: (flowStats?.netDeltaAdjustedFlow || 0) >= 0 ? COLORS.green : COLORS.red }}
            >
              {formatCurrency(flowStats?.netDeltaAdjustedFlow || 0, { compact: true, showSign: true })}
            </div>
          </div>
          
          {/* Sweep % */}
          <div className="text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">Sweeps</div>
            <div 
              className="text-lg font-bold font-mono"
              style={{ color: (flowStats?.sweepRatio || 0) > 0.3 ? COLORS.cyan : '#888' }}
            >
              {((flowStats?.sweepRatio || 0) * 100).toFixed(0)}%
            </div>
          </div>
          
          {/* GEX Flip */}
          <div className="text-center">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider">GEX Flip</div>
            <div className="text-lg font-bold font-mono text-purple-400">
              ${levels.gexFlip?.toFixed(0) || '—'}
            </div>
          </div>
          
          {/* Expected Move */}
          {expectedMove && (
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">EM</div>
              <div className="text-lg font-bold font-mono text-cyan-400">
                ±${expectedMove.value.toFixed(2)}
              </div>
              <div className="text-[9px] text-gray-500">
                ${expectedMove.lower.toFixed(2)}-${expectedMove.upper.toFixed(2)}
              </div>
            </div>
          )}
          
          {/* IV Rank */}
          {ivRank !== null && ivRank !== undefined && (
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">IV Rank</div>
              <div 
                className="text-lg font-bold font-mono"
                style={{ color: ivRank > 70 ? COLORS.red : ivRank < 30 ? COLORS.green : COLORS.yellow }}
              >
                {ivRank}%
              </div>
            </div>
          )}
          
          {/* RVOL */}
          {rvol !== null && rvol !== undefined && (
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider">RVOL</div>
              <div 
                className="text-lg font-bold font-mono"
                style={{ color: rvol > 1.5 ? COLORS.green : rvol < 0.5 ? COLORS.red : '#888' }}
              >
                {rvol.toFixed(1)}x
              </div>
            </div>
          )}
        </div>

        {/* Right: Price + Signal Dots */}
        <div className="text-right">
          <div className="text-2xl font-bold text-white font-mono">
            ${price.toFixed(2)}
          </div>
          <div 
            className="text-sm font-mono"
            style={{ color: change >= 0 ? COLORS.green : COLORS.red }}
          >
            {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
          </div>
          
          {/* Signal Alignment Dots */}
          {verdict.signals && (
            <div className="flex items-center justify-end gap-2 mt-2">
              <SignalDot 
                label="Flow" 
                status={verdict.signals.flow} 
                icon={<Zap className="w-3 h-3" />}
              />
              <SignalDot 
                label="DP" 
                status={verdict.signals.darkpool === 'ACCUMULATION' ? 'BULLISH' : 
                        verdict.signals.darkpool === 'DISTRIBUTION' ? 'BEARISH' : 'NEUTRAL'} 
                icon={<Building2 className="w-3 h-3" />}
              />
              <SignalDot 
                label="News" 
                status={verdict.signals.newsAlignment ? (verdict.bias === 'CONFLICTING' ? 'NEUTRAL' : verdict.bias) : 'NEUTRAL'} 
                icon={<Activity className="w-3 h-3" />}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalDot({ 
  label, 
  status, 
  icon 
}: { 
  label: string; 
  status: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; 
  icon: React.ReactNode;
}) {
  const color = status === 'BULLISH' ? COLORS.green : 
                status === 'BEARISH' ? COLORS.red : '#666';
  
  return (
    <div 
      className="flex items-center gap-1 px-2 py-1 rounded-full"
      style={{ background: `${color}20` }}
      title={`${label}: ${status}`}
    >
      <span style={{ color }}>{icon}</span>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
    </div>
  );
}
