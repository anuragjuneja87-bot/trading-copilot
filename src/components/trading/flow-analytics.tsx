'use client';

import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, TrendingDown, Flame, Target, Activity, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FlowTrade {
  id: string;
  ticker: string;
  strike: number;
  expiry: string;
  callPut: 'C' | 'P';
  price: number;
  size: number;
  premium: number;
  timestamp: string;
  timestampMs: number;
}

interface FlowStats {
  totalPremium: number;
  callRatio: number;
  putRatio: number;
  bullishPremium: number;
  bearishPremium: number;
  tradeCount: number;
  mostActive: { ticker: string; count: number } | null;
}

interface FlowAnalyticsProps {
  data: FlowTrade[];
  stats: FlowStats;
}

export function FlowAnalytics({ data, stats }: FlowAnalyticsProps) {
  // Aggregate data for charts
  const { timeSeriesData, strikeData, largestTrade, mostActiveStrike, recentTrend } = useMemo(() => {
    if (!data || data.length === 0) {
      return {
        timeSeriesData: [],
        strikeData: [],
        largestTrade: null,
        mostActiveStrike: null,
        recentTrend: { direction: 'neutral', amount: 0 },
      };
    }

    // --- Time Series Aggregation (5-minute buckets) ---
    const timeBuckets = new Map<number, { calls: number; puts: number; time: number }>();
    const bucketSize = 5 * 60 * 1000; // 5 minutes in ms

    data.forEach((trade) => {
      const bucket = Math.floor(trade.timestampMs / bucketSize) * bucketSize;
      const existing = timeBuckets.get(bucket) || { calls: 0, puts: 0, time: bucket };
      
      if (trade.callPut === 'C') {
        existing.calls += trade.premium;
      } else {
        existing.puts += trade.premium;
      }
      
      timeBuckets.set(bucket, existing);
    });

    const timeSeriesData = Array.from(timeBuckets.values())
      .sort((a, b) => a.time - b.time)
      .map((bucket) => ({
        time: new Date(bucket.time).toLocaleTimeString('en-US', { 
          hour: '2-digit', 
          minute: '2-digit',
          hour12: false 
        }),
        timeMs: bucket.time,
        calls: bucket.calls,
        puts: -bucket.puts, // Negative for visualization
        net: bucket.calls - bucket.puts,
      }));

    // --- Strike Aggregation ---
    const strikeMap = new Map<number, { calls: number; puts: number; count: number }>();

    data.forEach((trade) => {
      const existing = strikeMap.get(trade.strike) || { calls: 0, puts: 0, count: 0 };
      
      if (trade.callPut === 'C') {
        existing.calls += trade.premium;
      } else {
        existing.puts += trade.premium;
      }
      existing.count += 1;
      
      strikeMap.set(trade.strike, existing);
    });

    const strikeData = Array.from(strikeMap.entries())
      .map(([strike, values]) => ({
        strike: `$${strike}`,
        strikeNum: strike,
        calls: values.calls,
        puts: values.puts,
        net: values.calls - values.puts,
        count: values.count,
      }))
      .sort((a, b) => b.strikeNum - a.strikeNum) // Sort by strike descending
      .slice(0, 15); // Top 15 strikes

    // --- Largest Trade ---
    const largestTrade = data.reduce((max, trade) => 
      trade.premium > (max?.premium || 0) ? trade : max
    , data[0]);

    // --- Most Active Strike ---
    const mostActiveStrike = strikeData.reduce((max, strike) => 
      strike.count > (max?.count || 0) ? strike : max
    , strikeData[0]);

    // --- Recent Trend (last 30 minutes) ---
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;
    const recentTrades = data.filter((t) => t.timestampMs > thirtyMinAgo);
    const recentCalls = recentTrades.filter((t) => t.callPut === 'C').reduce((sum, t) => sum + t.premium, 0);
    const recentPuts = recentTrades.filter((t) => t.callPut === 'P').reduce((sum, t) => sum + t.premium, 0);
    const recentNet = recentCalls - recentPuts;
    
    const recentTrend = {
      direction: recentNet > 0 ? 'bullish' : recentNet < 0 ? 'bearish' : 'neutral',
      amount: Math.abs(recentNet),
    };

    return { timeSeriesData, strikeData, largestTrade, mostActiveStrike, recentTrend };
  }, [data]);

  const netFlow = stats.bullishPremium - stats.bearishPremium;
  const netFlowPercent = stats.totalPremium > 0 
    ? Math.round((Math.abs(netFlow) / stats.totalPremium) * 100) 
    : 0;

  return (
    <div className="space-y-6 p-6">
      {/* Summary Bar */}
      <div className="bg-background-card border border-background-elevated rounded-xl p-4">
        <div className="flex flex-wrap items-center gap-6">
          {/* Net Flow */}
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-12 h-12 rounded-lg flex items-center justify-center",
              netFlow >= 0 ? "bg-bull/20" : "bg-bear/20"
            )}>
              {netFlow >= 0 ? (
                <TrendingUp className="w-6 h-6 text-bull" />
              ) : (
                <TrendingDown className="w-6 h-6 text-bear" />
              )}
            </div>
            <div>
              <div className="text-sm text-text-muted">Net Flow</div>
              <div className={cn(
                "text-xl font-bold",
                netFlow >= 0 ? "text-bull" : "text-bear"
              )}>
                {netFlow >= 0 ? '+' : ''}{formatPremium(netFlow)} {netFlow >= 0 ? 'BULLISH' : 'BEARISH'}
              </div>
            </div>
          </div>

          {/* Flow Bar */}
          <div className="flex-1 min-w-[200px]">
            <div className="flex justify-between text-sm mb-1">
              <span className="text-bull">Calls: {formatPremium(stats.bullishPremium)}</span>
              <span className="text-bear">Puts: {formatPremium(stats.bearishPremium)}</span>
            </div>
            <div className="h-3 bg-background-elevated rounded-full overflow-hidden flex">
              <div 
                className="bg-bull h-full transition-all duration-500"
                style={{ width: `${stats.callRatio}%` }}
              />
              <div 
                className="bg-bear h-full transition-all duration-500"
                style={{ width: `${stats.putRatio}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-text-muted mt-1">
              <span>{stats.callRatio}%</span>
              <span>{stats.putRatio}%</span>
            </div>
          </div>

          {/* Trade Count */}
          <div className="text-center px-4 border-l border-background-elevated">
            <div className="text-2xl font-bold text-text-primary">{stats.tradeCount}</div>
            <div className="text-sm text-text-muted">Trades</div>
          </div>

          {/* Most Active */}
          {stats.mostActive && (
            <div className="text-center px-4 border-l border-background-elevated">
              <div className="text-2xl font-bold text-accent">{stats.mostActive.ticker}</div>
              <div className="text-sm text-text-muted">Most Active</div>
            </div>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flow Over Time Chart */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Activity className="w-5 h-5 text-accent" />
            Flow Over Time
          </h3>
          <div className="h-[250px]">
            {timeSeriesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={timeSeriesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" />
                  <XAxis 
                    dataKey="time" 
                    stroke="#6b7280" 
                    fontSize={12}
                    tickLine={false}
                  />
                  <YAxis 
                    stroke="#6b7280" 
                    fontSize={12}
                    tickLine={false}
                    tickFormatter={(value) => formatPremiumShort(Math.abs(value))}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a2332', 
                      border: '1px solid #2a3441',
                      borderRadius: '8px',
                    }}
                    labelStyle={{ color: '#9ca3af' }}
                    formatter={(value: number, name: string) => [
                      formatPremium(Math.abs(value)),
                      name === 'calls' ? 'Calls' : 'Puts'
                    ]}
                  />
                  <ReferenceLine y={0} stroke="#4b5563" />
                  <Area
                    type="monotone"
                    dataKey="calls"
                    stroke="#22c55e"
                    fill="#22c55e"
                    fillOpacity={0.3}
                    stackId="1"
                  />
                  <Area
                    type="monotone"
                    dataKey="puts"
                    stroke="#ef4444"
                    fill="#ef4444"
                    fillOpacity={0.3}
                    stackId="2"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted">
                No data available
              </div>
            )}
          </div>
        </div>

        {/* Strike Heatmap */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
            <Target className="w-5 h-5 text-accent" />
            Premium by Strike
          </h3>
          <div className="h-[250px]">
            {strikeData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={strikeData} 
                  layout="vertical"
                  margin={{ top: 5, right: 10, left: 50, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#2a3441" horizontal={false} />
                  <XAxis 
                    type="number" 
                    stroke="#6b7280" 
                    fontSize={12}
                    tickFormatter={(value) => formatPremiumShort(Math.abs(value))}
                  />
                  <YAxis 
                    type="category" 
                    dataKey="strike" 
                    stroke="#6b7280" 
                    fontSize={12}
                    width={50}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: '#1a2332', 
                      border: '1px solid #2a3441',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number, name: string) => [
                      formatPremium(value),
                      name === 'calls' ? 'Call Premium' : 'Put Premium'
                    ]}
                  />
                  <Bar dataKey="calls" fill="#22c55e" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="puts" fill="#ef4444" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-text-muted">
                No data available
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Metrics Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Largest Trade */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
            <Flame className="w-4 h-4 text-warning" />
            Largest Trade
          </div>
          {largestTrade ? (
            <>
              <div className="text-xl font-bold text-text-primary">
                {largestTrade.ticker} ${largestTrade.strike}{largestTrade.callPut}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className={cn(
                  "px-2 py-0.5 rounded text-xs font-medium",
                  largestTrade.callPut === 'C' ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
                )}>
                  {largestTrade.callPut === 'C' ? 'CALL' : 'PUT'}
                </span>
                <span className="text-lg font-semibold text-accent">
                  {formatPremium(largestTrade.premium)}
                </span>
                <span className="text-text-muted text-sm">
                  {largestTrade.size} contracts
                </span>
              </div>
            </>
          ) : (
            <div className="text-text-muted">No trades</div>
          )}
        </div>

        {/* Most Active Strike */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
            <Target className="w-4 h-4 text-accent" />
            Hottest Strike
          </div>
          {mostActiveStrike ? (
            <>
              <div className="text-xl font-bold text-text-primary">
                {mostActiveStrike.strike}
              </div>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-text-muted text-sm">
                  {mostActiveStrike.count} trades
                </span>
                <span className="text-lg font-semibold text-accent">
                  {formatPremium(mostActiveStrike.calls + mostActiveStrike.puts)}
                </span>
              </div>
              <div className="flex gap-2 mt-2 text-xs">
                <span className="text-bull">{formatPremium(mostActiveStrike.calls)} calls</span>
                <span className="text-text-muted">|</span>
                <span className="text-bear">{formatPremium(mostActiveStrike.puts)} puts</span>
              </div>
            </>
          ) : (
            <div className="text-text-muted">No data</div>
          )}
        </div>

        {/* Recent Trend */}
        <div className="bg-background-card border border-background-elevated rounded-xl p-4">
          <div className="flex items-center gap-2 text-text-muted text-sm mb-2">
            <Activity className="w-4 h-4 text-accent" />
            Last 30 Minutes
          </div>
          <div className="flex items-center gap-2">
            {recentTrend.direction === 'bullish' ? (
              <TrendingUp className="w-6 h-6 text-bull" />
            ) : recentTrend.direction === 'bearish' ? (
              <TrendingDown className="w-6 h-6 text-bear" />
            ) : (
              <Activity className="w-6 h-6 text-text-muted" />
            )}
            <span className={cn(
              "text-xl font-bold",
              recentTrend.direction === 'bullish' && "text-bull",
              recentTrend.direction === 'bearish' && "text-bear",
              recentTrend.direction === 'neutral' && "text-text-muted"
            )}>
              {recentTrend.direction === 'neutral' ? 'Neutral' : 
               recentTrend.direction === 'bullish' ? '↑ Bullish' : '↓ Bearish'}
            </span>
          </div>
          <div className="text-sm text-text-muted mt-1">
            {recentTrend.amount > 0 ? (
              <>
                {recentTrend.direction === 'bullish' ? '+' : '-'}
                {formatPremium(recentTrend.amount)} net flow
              </>
            ) : (
              'No recent activity'
            )}
          </div>
        </div>
      </div>

      {/* Top Trades Table (Compact) */}
      <div className="bg-background-card border border-background-elevated rounded-xl p-4">
        <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
          <DollarSign className="w-5 h-5 text-accent" />
          Top Trades by Premium
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-text-muted text-sm border-b border-background-elevated">
                <th className="pb-2 font-medium">Time</th>
                <th className="pb-2 font-medium">Symbol</th>
                <th className="pb-2 font-medium">Strike</th>
                <th className="pb-2 font-medium">C/P</th>
                <th className="pb-2 font-medium">Size</th>
                <th className="pb-2 font-medium text-right">Premium</th>
              </tr>
            </thead>
            <tbody>
              {data
                .sort((a, b) => b.premium - a.premium)
                .slice(0, 10)
                .map((trade) => (
                  <tr 
                    key={trade.id} 
                    className="border-b border-background-elevated/50 hover:bg-background-elevated/30"
                  >
                    <td className="py-2 text-sm text-text-muted">
                      {new Date(trade.timestamp).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                        hour12: false,
                      })}
                    </td>
                    <td className="py-2 font-semibold">{trade.ticker}</td>
                    <td className="py-2 font-mono">${trade.strike}</td>
                    <td className="py-2">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        trade.callPut === 'C' ? "bg-bull/20 text-bull" : "bg-bear/20 text-bear"
                      )}>
                        {trade.callPut === 'C' ? 'CALL' : 'PUT'}
                      </span>
                    </td>
                    <td className="py-2 font-mono">{trade.size}</td>
                    <td className="py-2 font-mono font-semibold text-right text-accent">
                      {formatPremium(trade.premium)}
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

// Helper functions
function formatPremium(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value}`;
}

function formatPremiumShort(value: number): string {
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return `${value}`;
}
