'use client';

import { COLORS } from '@/lib/echarts-theme';
import { TrendingUp, TrendingDown, Minus, Zap, Activity, Building2, Moon, Sunrise, Clock } from 'lucide-react';
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
    marketState?: 'pre-market' | 'open' | 'after-hours' | 'closed';
    reliability?: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
    premarket?: {
      gap: number;
      gapPercent: number;
      spyGap: number;
      spyGapPercent: number;
      relativeGap: number;
      premktVolume: number;
      volumeLabel: string;
      catalyst: string | null;
    };
    signals?: {
      flow: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
      darkpool: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
      newsAlignment: boolean;
    };
  };
  levels: { callWall: number | null; putWall: number | null; gexFlip: number | null; };
  flowStats: { netDeltaAdjustedFlow: number; sweepRatio: number; } | null;
  lastUpdate?: Date | null;
  dataAgeSeconds?: number;
  expectedMove?: { value: number; percent: number; upper: number; lower: number; } | null;
  ivRank?: number | null;
  rvol?: number | null;
}

export function HeroVerdict({ ticker, price, change, changePercent, verdict, levels, flowStats, lastUpdate, dataAgeSeconds = 0, expectedMove, ivRank, rvol }: HeroVerdictProps) {
  if (!COLORS) return <div className="p-4 text-red-400">Error: COLORS not loaded</div>;
  if (!verdict) return <div className="p-4 text-gray-400">Loading verdict...</div>;
  const marketState = verdict.marketState || 'open';
  if (marketState === 'closed' || marketState === 'after-hours') return <ClosedVerdict ticker={ticker} price={price} change={change} changePercent={changePercent} verdict={verdict} marketState={marketState} />;
  if (marketState === 'pre-market') return <PreMarketVerdict ticker={ticker} price={price} change={change} changePercent={changePercent} verdict={verdict} />;
  return <OpenVerdict ticker={ticker} price={price} change={change} changePercent={changePercent} verdict={verdict} levels={levels} flowStats={flowStats} dataAgeSeconds={dataAgeSeconds} expectedMove={expectedMove} ivRank={ivRank} rvol={rvol} />;
}

function ClosedVerdict({ ticker, price, change, changePercent, verdict, marketState }: { ticker: string; price: number; change: number; changePercent: number; verdict: HeroVerdictProps['verdict']; marketState: string; }) {
  const isAH = marketState === 'after-hours';
  return (
    <div className="rounded-xl p-4 relative overflow-hidden" style={{ background: `linear-gradient(135deg, rgba(100,100,120,0.15) 0%, ${COLORS.cardBg} 50%)`, border: '2px solid rgba(100,100,120,0.3)' }}>
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-10" style={{ background: '#8888aa' }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(100,100,120,0.2)', border: '1px solid rgba(100,100,120,0.3)' }}>
            <Moon className="w-7 h-7 text-gray-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-gray-400" style={{ fontFamily: "'Oxanium', monospace" }}>{isAH ? 'AFTER HOURS' : 'MARKET CLOSED'}</span>
            </div>
            <p className="text-sm text-gray-500 mt-1 max-w-[600px]">{verdict.summary}</p>
            <div className="flex items-center gap-2 mt-3">
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-gray-500/10 text-gray-500 border border-gray-500/20">
                <Clock className="w-3 h-3" />
                <span>Options flow, dark pool, and volume data unavailable outside market hours</span>
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white font-mono">${price.toFixed(2)}</div>
          <div className="text-sm font-mono" style={{ color: change >= 0 ? COLORS.green : COLORS.red }}>{change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</div>
          <div className="text-xs text-gray-600 mt-1">{isAH ? 'After-hours price' : 'Previous close'}</div>
        </div>
      </div>
    </div>
  );
}

function PreMarketVerdict({ ticker, price, change, changePercent, verdict }: { ticker: string; price: number; change: number; changePercent: number; verdict: HeroVerdictProps['verdict']; }) {
  const pm = verdict.premarket;
  const biasColor = verdict.bias === 'BULLISH' ? COLORS.green : verdict.bias === 'BEARISH' ? COLORS.red : COLORS.yellow;
  return (
    <div className="rounded-xl p-4 relative overflow-hidden" style={{ background: `linear-gradient(135deg, rgba(255,152,0,0.1) 0%, ${COLORS.cardBg} 50%)`, border: '2px solid rgba(255,152,0,0.3)' }}>
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-15" style={{ background: '#ff9800' }} />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,152,0,0.15)', border: '1px solid rgba(255,152,0,0.3)' }}>
            <Sunrise className="w-7 h-7 text-orange-400" />
          </div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-bold text-orange-400" style={{ fontFamily: "'Oxanium', monospace" }}>PRE-MARKET</span>
              <span className="text-gray-500">&middot;</span>
              <span className="text-lg" style={{ color: biasColor }}>{verdict.bias === 'NEUTRAL' ? 'Flat' : verdict.bias}</span>
            </div>
            <p className="text-sm text-gray-400 mt-1 max-w-[600px]">{verdict.summary}</p>
          </div>
        </div>
        <div className="flex items-center gap-5">
          {pm && (<div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">Gap</div><div className="text-lg font-bold font-mono" style={{ color: pm.gapPercent >= 0 ? COLORS.green : COLORS.red }}>{pm.gapPercent >= 0 ? '+' : ''}{pm.gapPercent.toFixed(2)}%</div></div>)}
          {pm && (<div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">SPY Gap</div><div className="text-lg font-bold font-mono" style={{ color: pm.spyGapPercent >= 0 ? COLORS.green : COLORS.red }}>{pm.spyGapPercent >= 0 ? '+' : ''}{pm.spyGapPercent.toFixed(2)}%</div></div>)}
          {pm && Math.abs(pm.relativeGap) > 0.1 && (<div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">vs SPY</div><div className="text-lg font-bold font-mono" style={{ color: pm.relativeGap > 0 ? COLORS.green : COLORS.red }}>{pm.relativeGap >= 0 ? '+' : ''}{pm.relativeGap.toFixed(1)}%</div></div>)}
          {pm && (<div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">PM Vol</div><div className="text-sm font-bold" style={{ color: pm.volumeLabel.includes('above') ? COLORS.green : pm.volumeLabel === 'below average' ? COLORS.red : '#888' }}>{pm.premktVolume > 1000000 ? `${(pm.premktVolume / 1000000).toFixed(1)}M` : pm.premktVolume > 1000 ? `${(pm.premktVolume / 1000).toFixed(0)}K` : pm.premktVolume.toString()}</div><div className="text-[9px] text-gray-600 capitalize">{pm.volumeLabel}</div></div>)}
          <div className="text-right pl-4 border-l border-gray-700">
            <div className="text-2xl font-bold text-white font-mono">${price.toFixed(2)}</div>
            <div className="text-sm font-mono" style={{ color: change >= 0 ? COLORS.green : COLORS.red }}>{change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</div>
          </div>
        </div>
      </div>
      {pm?.catalyst && (<div className="mt-3 px-3 py-2 rounded-lg text-xs" style={{ background: 'rgba(255,152,0,0.08)', border: '1px solid rgba(255,152,0,0.15)' }}><span className="text-orange-400 font-bold">📰 Catalyst: </span><span className="text-gray-400">{pm.catalyst}</span></div>)}
    </div>
  );
}

function OpenVerdict({ ticker, price, change, changePercent, verdict, levels, flowStats, dataAgeSeconds = 0, expectedMove, ivRank, rvol }: Omit<HeroVerdictProps, 'lastUpdate'>) {
  const formatAge = (s: number) => s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
  const ageColor = dataAgeSeconds < 30 ? '#00e676' : dataAgeSeconds < 120 ? '#ffc107' : '#ff5252';
  const biasColor = verdict.bias === 'BULLISH' ? COLORS.green : verdict.bias === 'BEARISH' ? COLORS.red : COLORS.yellow;
  const BiasIcon = verdict.bias === 'BULLISH' ? TrendingUp : verdict.bias === 'BEARISH' ? TrendingDown : Minus;
  const getConfLabel = (c: number) => c >= 70 ? { label: 'High Confidence', color: '#00e676' } : c >= 40 ? { label: 'Medium Confidence', color: '#ffc107' } : c >= 20 ? { label: 'Low Confidence', color: '#ff9800' } : { label: 'Weak Signal', color: '#ff5252' };
  const getQuality = (stats: typeof flowStats) => {
    const issues: string[] = [];
    if (!stats) return { level: 'INSUFFICIENT' as const, issues: ['no flow data'] };
    if (Math.abs(stats.netDeltaAdjustedFlow || 0) < 50000) issues.push('low flow volume');
    if ((stats.sweepRatio || 0) * 100 < 5) issues.push('no institutional urgency');
    return { level: (issues.length === 0 ? 'HIGH' : issues.length === 1 ? 'MEDIUM' : issues.length === 2 ? 'LOW' : 'INSUFFICIENT') as 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT', issues };
  };
  const conf = getConfLabel(verdict.confidence);
  const quality = getQuality(flowStats);
  return (
    <div className="rounded-xl p-4 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${biasColor}15 0%, ${COLORS.cardBg} 50%)`, border: `2px solid ${biasColor}40` }}>
      <div className="absolute top-0 left-0 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: biasColor }} />
      <div className="absolute top-2 right-2 flex items-center gap-2">
        <div className="flex items-center gap-1 px-2 py-1 rounded text-[10px]" style={{ background: `${ageColor}20`, color: ageColor }}><div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: ageColor }} />Data: {formatAge(dataAgeSeconds || 0)}</div>
      </div>
      {dataAgeSeconds > 120 && <div className="absolute top-2 left-2 px-2 py-1 rounded text-sm bg-red-500/20 text-red-400">⚠️ STALE DATA</div>}
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: `${biasColor}20`, border: `1px solid ${biasColor}40` }}><BiasIcon className="w-7 h-7" style={{ color: biasColor }} /></div>
          <div>
            <div className="flex items-center gap-3">
              <span className="text-4xl font-bold" style={{ color: biasColor, fontFamily: "'Oxanium', monospace" }}>{verdict.bias === 'CONFLICTING' ? '⚠️ CONFLICTING' : verdict.bias}</span>
              <span className="text-gray-500">&middot;</span>
              <span className="text-lg" style={{ color: conf.color }}>{conf.label}</span>
            </div>
            <p className="text-base text-gray-300 mt-0.5">{verdict.summary}</p>
            <div className="flex items-center gap-3 mt-3">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm ${quality.level === 'HIGH' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : ''} ${quality.level === 'MEDIUM' ? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30' : ''} ${quality.level === 'LOW' ? 'bg-orange-500/10 text-orange-400 border border-orange-500/30' : ''} ${quality.level === 'INSUFFICIENT' ? 'bg-red-500/10 text-red-400 border border-red-500/30' : ''}`}>
                <span className="font-bold">📊 {quality.level}</span>
                {quality.issues.length > 0 && <span className="text-gray-400">— {quality.issues.join(', ')}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">Net Δ Flow</div><div className="text-lg font-bold font-mono" style={{ color: (flowStats?.netDeltaAdjustedFlow || 0) >= 0 ? COLORS.green : COLORS.red }}>{formatCurrency(flowStats?.netDeltaAdjustedFlow || 0, { compact: true, showSign: true })}</div></div>
          <div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">Sweeps</div><div className="text-lg font-bold font-mono" style={{ color: (flowStats?.sweepRatio || 0) > 0.3 ? COLORS.cyan : '#888' }}>{((flowStats?.sweepRatio || 0) * 100).toFixed(0)}%</div></div>
          <div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">GEX Flip</div><div className="text-lg font-bold font-mono text-purple-400">${levels.gexFlip?.toFixed(0) || '—'}</div></div>
          {expectedMove && <div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">EM</div><div className="text-lg font-bold font-mono text-cyan-400">±${expectedMove.value.toFixed(2)}</div></div>}
          {ivRank !== null && ivRank !== undefined && <div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">IV Rank</div><div className="text-lg font-bold font-mono" style={{ color: ivRank > 70 ? COLORS.red : ivRank < 30 ? COLORS.green : COLORS.yellow }}>{ivRank}%</div></div>}
          {rvol !== null && rvol !== undefined && <div className="text-center"><div className="text-[10px] text-gray-500 uppercase tracking-wider">RVOL</div><div className="text-lg font-bold font-mono" style={{ color: rvol > 1.5 ? COLORS.green : rvol < 0.5 ? COLORS.red : '#888' }}>{rvol.toFixed(1)}x</div></div>}
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-white font-mono">${price.toFixed(2)}</div>
          <div className="text-sm font-mono" style={{ color: change >= 0 ? COLORS.green : COLORS.red }}>{change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)</div>
          {verdict.signals && (
            <div className="flex items-center justify-end gap-2 mt-2">
              <SignalDot label="Flow" status={verdict.signals.flow} icon={<Zap className="w-3 h-3" />} />
              <SignalDot label="DP" status={verdict.signals.darkpool === 'ACCUMULATION' ? 'BULLISH' : verdict.signals.darkpool === 'DISTRIBUTION' ? 'BEARISH' : 'NEUTRAL'} icon={<Building2 className="w-3 h-3" />} />
              <SignalDot label="News" status={verdict.signals.newsAlignment ? (verdict.bias === 'CONFLICTING' ? 'NEUTRAL' : verdict.bias) : 'NEUTRAL'} icon={<Activity className="w-3 h-3" />} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SignalDot({ label, status, icon }: { label: string; status: string; icon: React.ReactNode }) {
  const color = status === 'BULLISH' ? COLORS.green : status === 'BEARISH' ? COLORS.red : '#666';
  return (<div className="flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: `${color}20` }} title={`${label}: ${status}`}><span style={{ color }}>{icon}</span><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /></div>);
}
