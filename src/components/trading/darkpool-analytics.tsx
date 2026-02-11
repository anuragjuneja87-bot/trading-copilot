'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Brain, 
  TrendingUp, 
  TrendingDown, 
  Activity,
  BarChart3,
  Target,
  Layers,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  ReferenceLine,
} from 'recharts';
import type { DarkPoolPrint, DarkPoolStats } from '@/types/darkpool';

interface DarkPoolAnalyticsProps {
  prints: DarkPoolPrint[];
  stats: DarkPoolStats;
  selectedTicker?: string;
}

export function DarkPoolAnalytics({ prints, stats, selectedTicker }: DarkPoolAnalyticsProps) {
  const { insight, isLoading: insightLoading, refreshInsight } = useDarkPoolInsight(
    stats,
    prints,
    selectedTicker || 'All'
  );

  const formatValue = (value: number) => {
    if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value.toFixed(0)}`;
  };

  // Get regime colors and labels
  const regimeConfig = {
    ACCUMULATION: { color: 'bull', label: '🟢 ACCUMULATION', bg: 'bg-bull/10', border: 'border-bull/30' },
    DISTRIBUTION: { color: 'bear', label: '🔴 DISTRIBUTION', bg: 'bg-bear/10', border: 'border-bear/30' },
    NEUTRAL: { color: 'text-secondary', label: '⚪ NEUTRAL', bg: 'bg-background-card', border: 'border-background-elevated' },
  };

  const regime = regimeConfig[stats.regime];

  // Prepare price levels chart data
  const priceLevelsData = stats.priceLevels.slice(0, 8).map(level => ({
    price: `$${level.price.toFixed(level.price > 500 ? 0 : 2)}`,
    ticker: level.ticker,
    bullish: level.bullishValue,
    bearish: level.bearishValue,
    total: level.totalValue,
    printCount: level.printCount,
  }));

  return (
    <div className="space-y-4 p-6">
      {/* AI Insight Banner */}
      <div className={cn(
        "rounded-xl p-4 border",
        regime.bg,
        regime.border
      )}>
        <div className="flex items-start gap-3">
          <div className={cn(
            "w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0",
            stats.regime === 'ACCUMULATION' && "bg-bull/20",
            stats.regime === 'DISTRIBUTION' && "bg-bear/20",
            stats.regime === 'NEUTRAL' && "bg-accent/20"
          )}>
            <Brain className={cn(
              "w-5 h-5",
              stats.regime === 'ACCUMULATION' && "text-bull",
              stats.regime === 'DISTRIBUTION' && "text-bear",
              stats.regime === 'NEUTRAL' && "text-accent"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-text-muted">AI INSIGHT</span>
              {insightLoading && (
                <div className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
              )}
              <button
                onClick={refreshInsight}
                disabled={insightLoading}
                className="ml-2 p-1 rounded hover:bg-background-elevated transition-colors disabled:opacity-50"
                title="Refresh AI insight"
              >
                <RefreshCw className={cn(
                  "w-3.5 h-3.5 text-text-muted",
                  insightLoading && "animate-spin"
                )} />
              </button>
            </div>
            <p className="text-text-primary leading-relaxed">
              {insight}
            </p>
          </div>
          <div className={cn(
            "px-3 py-1.5 rounded-lg text-sm font-semibold flex-shrink-0",
            stats.regime === 'ACCUMULATION' && "bg-bull/20 text-bull",
            stats.regime === 'DISTRIBUTION' && "bg-bear/20 text-bear",
            stats.regime === 'NEUTRAL' && "bg-background-elevated text-text-secondary"
          )}>
            {regime.label}
          </div>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <MetricCard
          icon={<Layers className="w-4 h-4" />}
          label="Total Value"
          value={formatValue(stats.totalValue)}
          subtext={`${stats.printCount} prints`}
        />
        <MetricCard
          icon={<TrendingUp className="w-4 h-4 text-bull" />}
          label="Bullish"
          value={`${stats.bullishPct}%`}
          valueColor="text-bull"
          subtext={`${stats.bullishCount} prints`}
        />
        <MetricCard
          icon={<TrendingDown className="w-4 h-4 text-bear" />}
          label="Bearish"
          value={`${stats.bearishPct}%`}
          valueColor="text-bear"
          subtext={`${stats.bearishCount} prints`}
        />
        <MetricCard
          icon={<Target className="w-4 h-4" />}
          label="Largest Print"
          value={stats.largestPrint ? formatValue(stats.largestPrint.value) : '-'}
          subtext={stats.largestPrint ? `${stats.largestPrint.ticker} @ $${stats.largestPrint.price.toFixed(2)}` : ''}
        />
        <MetricCard
          icon={<AlertTriangle className="w-4 h-4" />}
          label="Mega Prints"
          value={stats.sizeDistribution.mega.toString()}
          subtext="$10M+ each"
        />
        <MetricCard
          icon={<Activity className="w-4 h-4" />}
          label="Most Active"
          value={stats.mostActive?.ticker || '-'}
          subtext={stats.mostActive ? `${stats.mostActive.count} prints` : ''}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Price Levels Chart */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" />
              <span className="font-medium text-text-primary">Dark Pool Levels</span>
            </div>
            <span className="text-xs text-text-muted">Key institutional price levels</span>
          </div>
          <div className="h-64">
            {priceLevelsData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={priceLevelsData}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 60, bottom: 0 }}
                >
                  <XAxis 
                    type="number" 
                    tickFormatter={(v) => formatValue(v)}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="price" 
                    tick={{ fill: '#9ca3af', fontSize: 11 }}
                    width={55}
                  />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const data = payload[0].payload;
                      return (
                        <div className="bg-background-elevated border border-background-card rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-text-primary">{data.ticker} {data.price}</p>
                          <p className="text-sm text-text-muted">{data.printCount} prints</p>
                          <p className="text-sm text-bull">Bullish: {formatValue(data.bullish)}</p>
                          <p className="text-sm text-bear">Bearish: {formatValue(data.bearish)}</p>
                        </div>
                      );
                    }}
                  />
                  <Bar dataKey="bullish" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="bearish" stackId="a" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No price level data
              </div>
            )}
          </div>
        </div>

        {/* Time Series Chart */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-accent" />
              <span className="font-medium text-text-primary">Flow Over Time</span>
            </div>
            <span className="text-xs text-text-muted">Bullish vs Bearish volume</span>
          </div>
          <div className="h-64">
            {stats.timeSeries.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={stats.timeSeries}
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="bullishGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="bearishGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis 
                    dataKey="time" 
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis 
                    tickFormatter={(v) => formatValue(v)}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div className="bg-background-elevated border border-background-card rounded-lg p-3 shadow-lg">
                          <p className="font-medium text-text-primary mb-1">{label}</p>
                          <p className="text-sm text-bull">Bullish: {formatValue(payload[0]?.value as number || 0)}</p>
                          <p className="text-sm text-bear">Bearish: {formatValue(payload[1]?.value as number || 0)}</p>
                        </div>
                      );
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="bullishValue"
                    stroke="#22c55e"
                    strokeWidth={2}
                    fill="url(#bullishGradient)"
                  />
                  <Area
                    type="monotone"
                    dataKey="bearishValue"
                    stroke="#ef4444"
                    strokeWidth={2}
                    fill="url(#bearishGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted text-sm">
                No time series data
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Top Prints Table */}
      <div className="bg-background-card border border-background-elevated rounded-xl p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-accent" />
            <span className="font-medium text-text-primary">Largest Dark Pool Prints</span>
          </div>
          <span className="text-xs text-text-muted">Sorted by value</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-text-muted border-b border-background-elevated">
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium">Ticker</th>
                <th className="pb-2 font-medium">Price</th>
                <th className="pb-2 font-medium text-right">Size</th>
                <th className="pb-2 font-medium text-right">Value</th>
                <th className="pb-2 font-medium text-center">Side</th>
                <th className="pb-2 font-medium text-center">Significance</th>
              </tr>
            </thead>
            <tbody>
              {prints
                .sort((a, b) => b.value - a.value)
                .slice(0, 10)
                .map((print) => (
                  <tr key={print.id} className="border-b border-background-elevated/50 hover:bg-background-elevated/30">
                    <td className="py-3 text-sm text-text-muted">
                      {new Date(print.timestamp).toLocaleTimeString('en-US', { 
                        hour: '2-digit', 
                        minute: '2-digit', 
                        second: '2-digit',
                        hour12: false 
                      })}
                    </td>
                    <td className="py-3 font-medium text-text-primary">{print.ticker}</td>
                    <td className="py-3 text-text-primary">${print.price.toFixed(2)}</td>
                    <td className="py-3 text-right text-text-secondary">
                      {print.size >= 1000000 
                        ? `${(print.size / 1000000).toFixed(1)}M` 
                        : print.size >= 1000 
                          ? `${(print.size / 1000).toFixed(0)}K`
                          : print.size.toLocaleString()}
                    </td>
                    <td className="py-3 text-right font-medium text-text-primary">
                      {formatValue(print.value)}
                    </td>
                    <td className="py-3 text-center">
                      <span className={cn(
                        "px-2 py-1 rounded text-xs font-medium",
                        print.side === 'BULLISH' && "bg-bull/20 text-bull",
                        print.side === 'BEARISH' && "bg-bear/20 text-bear",
                        print.side === 'NEUTRAL' && "bg-background-elevated text-text-secondary"
                      )}>
                        {print.side}
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      {Array(print.significance).fill('🔥').join('')}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// Metric Card Component
function MetricCard({ 
  icon, 
  label, 
  value, 
  subtext, 
  valueColor = 'text-text-primary' 
}: { 
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  valueColor?: string;
}) {
  return (
    <div className="bg-background-card border border-background-elevated rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-text-muted">{icon}</span>
        <span className="text-xs text-text-muted">{label}</span>
      </div>
      <div className={cn("text-xl font-bold", valueColor)}>{value}</div>
      {subtext && <div className="text-xs text-text-muted mt-1">{subtext}</div>}
    </div>
  );
}

// AI Insight Hook - ONLY fetches on mount or manual refresh
function useDarkPoolInsight(
  stats: DarkPoolStats,
  prints: DarkPoolPrint[],
  ticker: string
) {
  const [insight, setInsight] = useState<string>('Analyzing dark pool activity...');
  const [isLoading, setIsLoading] = useState(false);
  const hasFetchedRef = useRef(false); // Track if initial fetch happened

  const fetchInsight = useCallback(async () => {
    // Skip if no data
    if (!stats || stats.printCount === 0) {
      setInsight('Waiting for dark pool data...');
      return;
    }
    
    setIsLoading(true);

    try {
      const response = await fetch('/api/ai/darkpool-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: {
            ticker: ticker,
            totalValue: stats.totalValue,
            printCount: stats.printCount,
            bullishPct: stats.bullishPct,
            bearishPct: stats.bearishPct,
            regime: stats.regime,
            largestPrint: stats.largestPrint,
            priceLevels: stats.priceLevels.slice(0, 5),
            sizeDistribution: stats.sizeDistribution,
            topPrints: prints.sort((a, b) => b.value - a.value).slice(0, 5).map(p => ({
              ticker: p.ticker,
              price: p.price,
              value: p.value,
              side: p.side,
            })),
          },
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setInsight(data.insight);
        console.log(`Dark pool insight generated in ${data.latencyMs}ms`);
      } else {
        throw new Error('API error');
      }
    } catch (error) {
      console.error('Dark pool insight error:', error);
      setInsight(generateRuleBasedInsight(stats));
    } finally {
      setIsLoading(false);
    }
  }, [stats, prints, ticker]);

  // ONLY fetch on initial mount when we have data
  useEffect(() => {
    if (!hasFetchedRef.current && stats.printCount > 0) {
      hasFetchedRef.current = true;
      fetchInsight();
    }
  }, [stats.printCount, fetchInsight]); // Only depends on having data, not on stats changes

  // Manual refresh function - this is the ONLY way to re-fetch after initial load
  const refreshInsight = () => {
    fetchInsight();
  };

  return { insight, isLoading, refreshInsight };
}

function generateRuleBasedInsight(stats: DarkPoolStats): string {
  const { regime, bullishPct, bearishPct, largestPrint, priceLevels } = stats;
  
  let direction = 'neutral';
  if (bullishPct > 55) direction = 'bullish';
  else if (bearishPct > 55) direction = 'bearish';

  const topLevel = priceLevels[0];
  const levelText = topLevel 
    ? `Heavy activity at ${topLevel.ticker} $${topLevel.price.toFixed(2)}.` 
    : '';

  if (regime === 'ACCUMULATION') {
    return `Institutional accumulation detected with ${bullishPct}% bullish flow. ${levelText}`;
  } else if (regime === 'DISTRIBUTION') {
    return `Distribution pattern emerging with ${bearishPct}% bearish flow. ${levelText}`;
  }
  
  return `Mixed institutional flow (${bullishPct}% bullish / ${bearishPct}% bearish). ${levelText}`;
}
