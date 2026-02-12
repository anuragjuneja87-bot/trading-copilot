'use client';

import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ComposedChart,
} from 'recharts';
import { 
  TrendingUp, 
  TrendingDown, 
  Flame, 
  Target, 
  Activity, 
  Brain,
  Zap,
  AlertTriangle,
  RefreshCw,
  MessageSquare,
  ArrowUp,
  ArrowDown,
  Minus,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import type { EnhancedOptionTrade, EnhancedFlowStats } from '@/types/flow';

interface FlowAnalyticsV2Props {
  data: EnhancedOptionTrade[];
  stats: EnhancedFlowStats;
  selectedTicker?: string;
}

// AI Insight Hook - ONLY fetches on mount or manual refresh
function useAIInsight(
  stats: EnhancedFlowStats, 
  topTrades: EnhancedOptionTrade[], 
  ticker: string
) {
  const [insight, setInsight] = useState<string>('Analyzing flow patterns...');
  const [isLoading, setIsLoading] = useState(false);
  const hasFetchedRef = useRef(false); // Track if initial fetch happened

  const fetchInsight = useCallback(async () => {
    // Skip if no meaningful data
    if (!stats || stats.tradeCount === 0) {
      setInsight('Waiting for flow data...');
      return;
    }
    
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/flow-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            ticker: ticker || 'Market',
            netDeltaFlow: stats.netDeltaAdjustedFlow,
            callPutRatio: `${stats.callRatio}% / ${stats.putRatio}%`,
            totalPremium: stats.totalPremium,
            momentum: stats.momentumDirection,
            sweepRatio: stats.sweepRatio,
            unusualCount: stats.unusualCount,
            tradeCount: stats.tradeCount,
            regime: stats.regime,
            topTrades: topTrades.slice(0, 3).map(t => ({
              ticker: t.ticker,
              strike: t.strike,
              callPut: t.callPut,
              premium: t.premium,
              tradeType: t.tradeType,
              size: t.size,
            })),
            keyStrikes: stats.gexByStrike.slice(0, 5).map(s => ({
              strike: s.strike,
              callPremium: s.callPremium,
              putPremium: s.putPremium,
            })),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setInsight(data.insight || 'Unable to generate insight.');
        console.log(`AI insight generated in ${data.latencyMs}ms, tokens: ${data.usage?.total_tokens}`);
      } else {
        throw new Error('API error');
      }
    } catch (error) {
      console.error('AI insight error:', error);
      setInsight(generateRuleBasedInsight(stats, topTrades));
    } finally {
      setIsLoading(false);
    }
  }, [stats, topTrades, ticker]);

  // ONLY fetch on initial mount when we have data
  useEffect(() => {
    if (!hasFetchedRef.current && stats.tradeCount > 0) {
      hasFetchedRef.current = true;
      fetchInsight();
    }
  }, [stats.tradeCount, fetchInsight]); // Only depends on having data, not on stats changes

  // Manual refresh function - this is the ONLY way to re-fetch after initial load
  const refreshInsight = () => {
    fetchInsight();
  };

  return { insight, isLoading, refreshInsight };
}

// Rule-based fallback insight generator
function generateRuleBasedInsight(stats: EnhancedFlowStats, topTrades: EnhancedOptionTrade[]): string {
  const direction = stats.netDeltaAdjustedFlow > 0 ? 'bullish' : stats.netDeltaAdjustedFlow < 0 ? 'bearish' : 'neutral';
  const momentum = stats.momentumDirection;
  const topTrade = topTrades[0];
  
  let insight = '';
  
  if (Math.abs(stats.netDeltaAdjustedFlow) > 1000000) {
    insight = `Strong ${direction} flow detected (${formatPremium(Math.abs(stats.netDeltaAdjustedFlow))} delta-adjusted). `;
  } else if (Math.abs(stats.netDeltaAdjustedFlow) > 100000) {
    insight = `Moderate ${direction} positioning building. `;
  } else {
    insight = `Flow is relatively balanced with slight ${direction} lean. `;
  }
  
  if (momentum === 'accelerating' && direction !== 'neutral') {
    insight += `Momentum ${direction === 'bullish' ? '↑' : '↓'} accelerating. `;
  } else if (momentum === 'decelerating') {
    insight += 'Momentum fading. ';
  }
  
  if (topTrade && topTrade.smartMoneyScore >= 7) {
    insight += `Notable: ${topTrade.ticker} $${topTrade.strike}${topTrade.callPut} ${topTrade.tradeType} (${formatPremium(topTrade.premium)}).`;
  }
  
  if (stats.gexByStrike.length > 0) {
    const topGex = stats.gexByStrike.reduce((max, s) => 
      Math.abs(s.netGex) > Math.abs(max.netGex) ? s : max
    );
    if (Math.abs(topGex.netGex) > 0) {
      insight += ` Key level: $${topGex.strike}.`;
    }
  }
  
  return insight;
}

export function FlowAnalyticsV2({ data, stats, selectedTicker }: FlowAnalyticsV2Props) {
  const [timeRange, setTimeRange] = useState<'today' | 'hour' | 'custom'>('today');
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);

  // Ensure data is always an array
  const safeData = Array.isArray(data) ? data : [];

  // Get top trades by smart money score
  const topTrades = useMemo(() => {
    if (!Array.isArray(safeData) || safeData.length === 0) return [];
    return [...safeData]
      .sort((a, b) => (b.smartMoneyScore || 0) - (a.smartMoneyScore || 0))
      .slice(0, 5);
  }, [safeData]);

  // AI Insight
  const { insight, isLoading: insightLoading, refreshInsight } = useAIInsight(
    stats, 
    topTrades, 
    selectedTicker || 'Market'
  );

  // Fetch current price for annotation
  useEffect(() => {
    if (selectedTicker) {
      fetch(`/api/market/prices?tickers=${selectedTicker}`)
        .then(res => res.json())
        .then(data => {
          const price = data.data?.prices?.[0]?.price;
          if (price) setCurrentPrice(price);
        })
        .catch(() => {});
    }
  }, [selectedTicker]);

  // Prepare GEX chart data
  const gexChartData = useMemo(() => {
    return stats.gexByStrike
      .sort((a, b) => b.strike - a.strike)
      .slice(0, 12)
      .map(s => ({
        strike: `$${s.strike}`,
        strikeNum: s.strike,
        calls: s.callPremium,
        puts: -s.putPremium,
        netGex: s.netGex,
      }));
  }, [stats.gexByStrike]);

  // Prepare flow momentum chart based on time range
  const momentumChartData = useMemo(() => {
    if (timeRange === 'hour') {
      return stats.flowTimeSeries.slice(-12); // Last hour
    } else if (timeRange === 'today') {
      return stats.flowTimeSeries; // All today
    }
    return stats.flowTimeSeries; // Custom (same as today for now)
  }, [stats.flowTimeSeries, timeRange]);

  return (
    <div className="space-y-4 p-6">
      {/* AI Insight Banner */}
      <div className={cn(
        "rounded-xl p-6 border-l-4 relative overflow-hidden",
        stats.regime === 'RISK_ON' && "bg-bull/10 border-l-bull",
        stats.regime === 'RISK_OFF' && "bg-bear/10 border-l-bear",
        stats.regime === 'NEUTRAL' && "bg-[rgba(255,255,255,0.02)] border-l-[#00e5ff]"
      )}
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        borderLeft: stats.regime === 'RISK_ON' ? '4px solid #00e676' : 
                   stats.regime === 'RISK_OFF' ? '4px solid #ff5252' : 
                   '4px solid #00e5ff',
      }}>
        {/* Subtle gradient overlay */}
        <div 
          className="absolute inset-0 opacity-5 pointer-events-none"
          style={{
            background: stats.regime === 'RISK_ON' 
              ? 'linear-gradient(135deg, rgba(0,230,118,0.2) 0%, transparent 100%)'
              : stats.regime === 'RISK_OFF'
              ? 'linear-gradient(135deg, rgba(255,82,82,0.2) 0%, transparent 100%)'
              : 'linear-gradient(135deg, rgba(0,229,255,0.2) 0%, transparent 100%)'
          }}
        />
        
        <div className="flex items-start gap-4 relative z-10">
          <div className={cn(
            "w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0",
            stats.regime === 'RISK_ON' && "bg-bull/20",
            stats.regime === 'RISK_OFF' && "bg-bear/20",
            stats.regime === 'NEUTRAL' && "bg-accent/20"
          )}>
            <Brain className={cn(
              "w-6 h-6",
              stats.regime === 'RISK_ON' && "text-bull",
              stats.regime === 'RISK_OFF' && "text-bear",
              stats.regime === 'NEUTRAL' && "text-accent"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#00e5ff]">AI INSIGHT</span>
              {insightLoading && (
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              )}
              {/* Refresh Button */}
              <button
                onClick={refreshInsight}
                disabled={insightLoading}
                className="ml-auto p-1.5 rounded-lg hover:bg-[rgba(255,255,255,0.05)] transition-colors disabled:opacity-50"
                title="Refresh AI insight"
              >
                <RefreshCw className={cn(
                  "w-4 h-4 text-text-muted",
                  insightLoading && "animate-spin"
                )} />
              </button>
            </div>
            <p className="text-sm text-text-primary leading-relaxed mb-3">
              {insight}
            </p>
            {/* Ask AI Button */}
            <button
              onClick={() => {
                const prompt = `Analyze the current options flow: ${insight}`;
                if (typeof window !== 'undefined') {
                  sessionStorage.setItem('chat_prompt', prompt);
                  window.location.href = '/app';
                }
              }}
              className="inline-flex items-center gap-1.5 text-xs text-[#00e5ff] hover:text-[#00b8d4] transition-colors font-medium"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Ask AI about this flow →
            </button>
          </div>
          {/* Regime Badge */}
          <div className={cn(
            "px-3 py-1.5 rounded-lg text-xs font-bold uppercase flex-shrink-0",
            stats.regime === 'RISK_ON' && "bg-bull/20 text-bull border border-bull/30",
            stats.regime === 'RISK_OFF' && "bg-bear/20 text-bear border border-bear/30",
            stats.regime === 'NEUTRAL' && "bg-background-elevated text-text-secondary border border-[rgba(255,255,255,0.1)]"
          )}>
            {stats.regime === 'RISK_ON' && '🟢 RISK ON'}
            {stats.regime === 'RISK_OFF' && '🔴 RISK OFF'}
            {stats.regime === 'NEUTRAL' && '⚪ NEUTRAL'}
          </div>
        </div>
      </div>

      {/* Key Metrics Bar */}
      <div className="flex lg:grid lg:grid-cols-2 md:lg:grid-cols-3 xl:grid-cols-6 gap-3 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide">
        <MetricCard
          label="Net Delta Flow"
          value={formatPremium(stats.netDeltaAdjustedFlow)}
          subValue={stats.netDeltaAdjustedFlow >= 0 ? 'BULLISH' : 'BEARISH'}
          trend={stats.netDeltaAdjustedFlow >= 0 ? 'up' : 'down'}
          icon={stats.netDeltaAdjustedFlow >= 0 ? TrendingUp : TrendingDown}
          highlight={Math.abs(stats.netDeltaAdjustedFlow) > 1000000}
        />
        
        <MetricCard
          label="Momentum"
          value={stats.momentumDirection === 'accelerating' ? '↑ Accel' : 
                 stats.momentumDirection === 'decelerating' ? '↓ Decel' : '→ Flat'}
          subValue={`${stats.flowMomentum > 0 ? '+' : ''}${formatPremium(stats.flowMomentum)}/5m`}
          trend={stats.momentumDirection === 'accelerating' ? 'up' : 
                 stats.momentumDirection === 'decelerating' ? 'down' : 'neutral'}
          icon={Activity}
        />

        <MetricCard
          label="Call/Put"
          value={`${stats.callRatio}% / ${stats.putRatio}%`}
          subValue={formatPremium(stats.totalPremium) + ' total'}
          trend={stats.callRatio > 60 ? 'up' : stats.putRatio > 60 ? 'down' : 'neutral'}
          icon={Target}
        />

        <MetricCard
          label="Sweep Urgency"
          value={`${Math.round(stats.sweepRatio * 100)}%`}
          subValue="of premium"
          trend={stats.sweepRatio > 0.5 ? 'up' : 'neutral'}
          icon={Zap}
        />

        <MetricCard
          label="Unusual"
          value={stats.unusualCount.toString()}
          subValue="trades flagged"
          trend={stats.unusualCount > 5 ? 'up' : 'neutral'}
          icon={AlertTriangle}
        />

        <MetricCard
          label="Conviction"
          value={stats.avgSmartMoneyScore.toFixed(1)}
          subValue="avg score"
          trend={stats.avgSmartMoneyScore > 5 ? 'up' : 'neutral'}
          icon={Flame}
          highlight={stats.avgSmartMoneyScore > 4.0}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Cumulative Delta-Adjusted Flow Chart */}
        <div className="bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.06)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <h3 className="text-base font-semibold text-text-primary">
                Cumulative Delta Flow (CDAF)
              </h3>
            </div>
            {/* Time Range Selector */}
            <div className="flex items-center gap-1 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-0.5">
              <button
                onClick={() => setTimeRange('today')}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  timeRange === 'today'
                    ? 'bg-accent text-background'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                Today
              </button>
              <button
                onClick={() => setTimeRange('hour')}
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors',
                  timeRange === 'hour'
                    ? 'bg-accent text-background'
                    : 'text-text-muted hover:text-text-primary'
                )}
              >
                Last Hour
              </button>
            </div>
          </div>
          <div className="h-[200px]">
            {momentumChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={momentumChartData} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#6b7280" 
                    fontSize={10}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    fontSize={10}
                    tickLine={false}
                    tickFormatter={(v) => formatPremiumShort(Math.abs(v))}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a2332', 
                      border: '1px solid #2a3441',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      formatPremium(value),
                      name === 'cumulativeCDAF' ? 'Cumulative CDAF' : 
                      name === 'netFlow' ? 'Net Flow' : name
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="3 3" />
                  <Area
                    type="monotone"
                    dataKey="cumulativeCDAF"
                    stroke="#6366f1"
                    fill="url(#cdafGradient)"
                    strokeWidth={2}
                  />
                  <defs>
                    <linearGradient id="cdafGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState message="Building flow data..." />
            )}
          </div>
        </div>

        {/* Premium by Strike (GEX Proxy) */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <h3 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
            <Target className="w-4 h-4 text-accent" />
            Premium by Strike
            <span className="text-xs font-normal text-text-muted ml-auto">
              Key levels from positioning
            </span>
          </h3>
          <div className="h-[200px]">
            {gexChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={gexChartData} 
                  layout="vertical"
                  margin={{ top: 5, right: 5, left: 45, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" horizontal={false} />
                  <XAxis 
                    type="number" 
                    stroke="#6b7280" 
                    fontSize={10}
                    tickFormatter={(v) => formatPremiumShort(Math.abs(v))}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="strike" 
                    stroke="#6b7280" 
                    fontSize={11}
                    width={45}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a2332', 
                      border: '1px solid #2a3441',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number, name: string) => [
                      formatPremium(Math.abs(value)),
                      name === 'calls' ? 'Call Premium' : 'Put Premium'
                    ]}
                  />
                  <ReferenceLine x={0} stroke="#4b5563" />
                  <Bar dataKey="calls" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="puts" fill="#ef4444" radius={[4, 0, 0, 4]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="space-y-2 w-full">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-32 w-full" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Smart Money Trades */}
      <div className="bg-background-card border border-background-elevated rounded-xl p-4">
        <h3 className="text-base font-semibold text-text-primary mb-3 flex items-center gap-2">
          <Flame className="w-4 h-4 text-warning" />
          Top Smart Money Trades
          <span className="text-xs font-normal text-text-muted ml-auto">
            Ranked by conviction score
          </span>
        </h3>
        
        {topTrades.length > 0 ? (
          <div className="space-y-2">
            {topTrades.map((trade, idx) => (
              <SmartMoneyTradeRow key={trade.id} trade={trade} rank={idx + 1} />
            ))}
          </div>
        ) : (
          <EmptyState message="No significant trades detected" />
        )}
      </div>
    </div>
  );
}

// Sub-components

// Mock sparkline data - TODO: Replace with real time series
function generateMiniSparkline(trend: 'up' | 'down' | 'neutral'): number[] {
  const data = [];
  const base = 50;
  for (let i = 0; i < 10; i++) {
    if (trend === 'up') {
      data.push(base + Math.random() * 20 + i * 2);
    } else if (trend === 'down') {
      data.push(base + Math.random() * 20 - i * 2);
    } else {
      data.push(base + (Math.random() - 0.5) * 10);
    }
  }
  return data;
}

function MiniSparkline({ data, trend }: { data: number[]; trend: 'up' | 'down' | 'neutral' }) {
  const width = 40;
  const height = 16;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  const color = trend === 'up' ? '#00e676' : trend === 'down' ? '#ff5252' : '#6b7a99';

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MetricCard({ 
  label, 
  value, 
  subValue, 
  trend, 
  icon: Icon,
  highlight = false,
}: { 
  label: string;
  value: string;
  subValue: string;
  trend: 'up' | 'down' | 'neutral';
  icon: React.ComponentType<{ className?: string }>;
  highlight?: boolean;
}) {
  const sparklineData = generateMiniSparkline(trend);
  const isBullish = trend === 'up';
  const isBearish = trend === 'down';

  return (
    <div className={cn(
      "rounded-lg p-3 border transition-all",
      highlight && "ring-2 ring-[#00e5ff]/50",
      isBullish && "bg-bull/5 border-bull/20",
      isBearish && "bg-bear/5 border-bear/20",
      !isBullish && !isBearish && "bg-[rgba(255,255,255,0.02)] border-[rgba(255,255,255,0.06)]"
    )}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <Icon className={cn(
            "w-4 h-4",
            trend === 'up' && "text-bull",
            trend === 'down' && "text-bear",
            trend === 'neutral' && "text-text-muted"
          )} />
          <span className="text-sm font-medium text-text-muted">{label}</span>
        </div>
        <div className="flex items-center gap-1">
          {trend === 'up' && <ArrowUp className="w-3 h-3 text-bull" />}
          {trend === 'down' && <ArrowDown className="w-3 h-3 text-bear" />}
          {trend === 'neutral' && <Minus className="w-3 h-3 text-text-muted" />}
          <MiniSparkline data={sparklineData} trend={trend} />
        </div>
      </div>
      <div className={cn(
        "text-xl font-bold mb-1",
        trend === 'up' && "text-bull",
        trend === 'down' && "text-bear",
        trend === 'neutral' && "text-text-primary"
      )}>
        {value}
      </div>
      <div className="text-xs text-text-muted">{subValue}</div>
    </div>
  );
}

function SmartMoneyTradeRow({ trade, rank }: { trade: EnhancedOptionTrade; rank: number }) {
  const fireIcons = Math.min(Math.ceil(trade.smartMoneyScore / 2), 5);
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-lg border transition-colors",
      trade.smartMoneyScore >= 8 && "bg-warning/10 border-warning/30",
      trade.smartMoneyScore >= 6 && trade.smartMoneyScore < 8 && "bg-accent/10 border-accent/30",
      trade.smartMoneyScore < 6 && "bg-background-elevated/50 border-background-elevated"
    )}>
      {/* Rank */}
      <div className="w-6 h-6 rounded-full bg-background-elevated flex items-center justify-center text-xs font-bold text-text-muted">
        {rank}
      </div>
      
      {/* Fire Rating */}
      <div className="flex-shrink-0 w-20">
        {Array.from({ length: fireIcons }).map((_, i) => (
          <Flame key={i} className="w-4 h-4 inline text-warning" />
        ))}
      </div>
      
      {/* Trade Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-bold text-text-primary">{trade.ticker}</span>
          <span className="font-mono text-sm">${trade.strike}</span>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium",
            trade.callPut === 'C' ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
          )}>
            {trade.callPut === 'C' ? 'CALL' : 'PUT'}
          </span>
          <span className={cn(
            "px-1.5 py-0.5 rounded text-xs font-medium",
            trade.tradeType.includes('SWEEP') && "bg-warning/20 text-warning",
            trade.tradeType === 'BLOCK' && "bg-accent/20 text-accent",
            !trade.tradeType.includes('SWEEP') && trade.tradeType !== 'BLOCK' && "bg-background-elevated text-text-muted"
          )}>
            {trade.tradeType}
          </span>
          {trade.isUnusual && (
            <span className="px-1.5 py-0.5 rounded text-xs font-medium bg-purple-500/20 text-purple-400">
              UNUSUAL
            </span>
          )}
        </div>
        <div className="text-xs text-text-muted mt-0.5">
          {trade.size} contracts • Exp {new Date(trade.expiry).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} • {trade.moneyness}
        </div>
      </div>
      
      {/* Premium */}
      <div className="text-right flex-shrink-0">
        <div className="text-lg font-bold text-accent">
          {formatPremium(trade.premium)}
        </div>
        <div className="text-xs text-text-muted">
          δ {(trade.delta * 100).toFixed(0)}
        </div>
      </div>
      
      {/* Time */}
      <div className="text-xs text-text-muted flex-shrink-0 w-16 text-right">
        {new Date(trade.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center text-text-muted text-sm">
      {message}
    </div>
  );
}

// Helpers
function formatPremium(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

function formatPremiumShort(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${(abs / 1000).toFixed(0)}K`;
  return abs.toFixed(0);
}
