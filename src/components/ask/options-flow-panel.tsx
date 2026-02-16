'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import ReactECharts from 'echarts-for-react';

interface OptionsFlowPanelProps {
  ticker: string;
}

type Timeframe = '1D' | '1W' | '1M' | '3M';

interface FlowTrade {
  timestamp?: string | number;
  sip_timestamp?: number;
  premium: number;
  contract_type: 'call' | 'put';
  strike: number;
  expiry?: string;
  expiration_date?: string;
  size: number;
  conditions?: string[];
}

const TIMEFRAMES: { key: Timeframe; label: string; days: number }[] = [
  { key: '1D', label: 'Today', days: 1 },
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
];

export function OptionsFlowPanel({ ticker }: OptionsFlowPanelProps) {
  const [trades, setTrades] = useState<FlowTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1W'); // Default to 1 week

  useEffect(() => {
    const fetchFlow = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Calculate date range based on timeframe
        const tf = TIMEFRAMES.find(t => t.key === timeframe);
        const days = tf?.days || 7;
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        // Format dates for API
        const from = startDate.toISOString().split('T')[0];
        const to = endDate.toISOString().split('T')[0];
        
        const res = await fetch(
          `/api/flow/options?tickers=${ticker}&limit=500&from=${from}&to=${to}`
        );
        const json = await res.json();
        
        if (json.success) {
          // API returns data.flow, not data.trades
          const flowTrades = json.data?.flow || json.data?.trades || json.data || [];
          setTrades(Array.isArray(flowTrades) ? flowTrades : []);
          
          // Debug logging
          if (flowTrades.length === 0) {
            console.log('[Options Flow Panel] No trades returned. Response:', {
              success: json.success,
              hasData: !!json.data,
              flowLength: json.data?.flow?.length,
              tradesLength: json.data?.trades?.length,
              meta: json.data?.meta,
            });
          }
        } else {
          setError(json.error || 'Failed to fetch');
        }
      } catch (err) {
        console.error('Failed to fetch flow:', err);
        setError('Failed to fetch options flow');
      } finally {
        setLoading(false);
      }
    };

    fetchFlow();

    const handleRefresh = () => fetchFlow();
    window.addEventListener('refresh-ask-data', handleRefresh);
    return () => window.removeEventListener('refresh-ask-data', handleRefresh);
  }, [ticker, timeframe]);

  // Calculate summary stats
  const summary = calculateSummary(trades);
  const regime = getRegime(summary.callPercent);
  const regimeColor = getRegimeColor(regime);

  // Find top trade
  const topTrade = trades.length > 0 
    ? trades.reduce((max, t) => ((t.premium || 0) > (max.premium || 0) ? t : max), trades[0])
    : null;

  return (
    <div 
      className="rounded-xl p-4 flex flex-col overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header with Timeframe Selector */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Options Flow
          </h3>
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={{ background: `${regimeColor}20`, color: regimeColor }}
          >
            {regime}
          </span>
        </div>
        
        {/* Timeframe Selector */}
        <div className="flex rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
          {TIMEFRAMES.map(tf => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className="px-2 py-1 text-[10px] font-semibold transition-all"
              style={{
                background: timeframe === tf.key ? 'rgba(0,229,255,0.2)' : 'transparent',
                color: timeframe === tf.key ? COLORS.cyan : '#666',
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Stats Bar */}
      <div className="flex items-center gap-4 text-[10px] mb-2 flex-shrink-0">
        <span>
          <span className="text-gray-500">Call/Put:</span>{' '}
          <span style={{ color: COLORS.green }}>{summary.callPercent.toFixed(0)}%</span>
          {' / '}
          <span style={{ color: COLORS.red }}>{summary.putPercent.toFixed(0)}%</span>
        </span>
        <span>
          <span className="text-gray-500">Sweep:</span>{' '}
          <span className="text-white">{summary.sweepPercent.toFixed(0)}%</span>
        </span>
        <span>
          <span className="text-gray-500">Trades:</span>{' '}
          <span className="text-white">{trades.length}</span>
        </span>
        <span>
          <span className="text-gray-500">Premium:</span>{' '}
          <span className="text-white">${formatPremium(summary.callPremium + summary.putPremium)}</span>
        </span>
      </div>

      {/* Chart */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            Loading {timeframe} data...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            {error}
          </div>
        ) : trades.length > 0 ? (
          <FlowChart trades={trades} timeframe={timeframe} />
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            No flow data for {TIMEFRAMES.find(t => t.key === timeframe)?.label || timeframe}
          </div>
        )}
      </div>

      {/* Top Trade */}
      {topTrade && topTrade.premium > 0 && (
        <div 
          className="mt-2 p-2 rounded-lg flex items-center justify-between flex-shrink-0"
          style={{ background: 'rgba(255,255,255,0.03)' }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-500">Top:</span>
            <span className="text-xs text-white font-mono">
              ${topTrade.strike} {formatExpiry(topTrade.expiry || topTrade.expiration_date)}
            </span>
            <span 
              className="px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ 
                background: topTrade.contract_type === 'call' 
                  ? 'rgba(0,230,118,0.2)' 
                  : 'rgba(255,82,82,0.2)',
                color: topTrade.contract_type === 'call' ? COLORS.green : COLORS.red,
              }}
            >
              {topTrade.contract_type === 'call' ? 'C' : 'P'}
            </span>
          </div>
          <span className="text-xs font-mono text-gray-400">
            ${formatPremium(topTrade.premium)}
          </span>
        </div>
      )}
    </div>
  );
}

function FlowChart({ trades, timeframe }: { trades: FlowTrade[]; timeframe: Timeframe }) {
  const chartData = processTradesForChart(trades, timeframe);
  
  if (chartData.labels.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500 text-xs">
        No chart data
      </div>
    );
  }

  const option = {
    grid: { top: 10, right: 10, bottom: 30, left: 55 },
    xAxis: {
      type: 'category',
      data: chartData.labels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.1)' } },
      axisTick: { show: false },
      axisLabel: { 
        fontSize: 9, 
        color: '#666',
        rotate: chartData.labels.length > 10 ? 45 : 0,
      },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.05)' } },
      axisLabel: { 
        fontSize: 9, 
        color: '#666',
        formatter: (v: number) => {
          const abs = Math.abs(v);
          if (abs >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
          if (abs >= 1000) return `$${(v / 1000).toFixed(0)}K`;
          return `$${v}`;
        }
      },
    },
    series: [
      {
        name: 'Call Premium',
        type: 'bar',
        data: chartData.callPremiums,
        itemStyle: { 
          color: '#00e676',
          borderRadius: [3, 3, 0, 0],
        },
        barGap: '10%',
        barCategoryGap: '20%',
      },
      {
        name: 'Put Premium',
        type: 'bar',
        data: chartData.putPremiums.map(v => -v),
        itemStyle: { 
          color: '#ff5252',
          borderRadius: [0, 0, 3, 3],
        },
        barGap: '10%',
        barCategoryGap: '20%',
      },
    ],
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(0,0,0,0.9)',
      borderColor: 'rgba(255,255,255,0.1)',
      textStyle: { color: '#fff', fontSize: 11 },
      formatter: (params: any) => {
        if (!params || params.length === 0) return '';
        const label = params[0]?.axisValue || '';
        let html = `<div style="font-weight:bold;margin-bottom:4px">${label}</div>`;
        params.forEach((p: any) => {
          if (!p.value || p.value === 0) return;
          const value = Math.abs(p.value);
          const isCall = p.seriesName.includes('Call');
          const color = isCall ? '#00e676' : '#ff5252';
          const formatted = formatPremiumValue(value);
          html += `<div style="color:${color}">${isCall ? 'Calls' : 'Puts'}: ${formatted}</div>`;
        });
        return html;
      },
    },
  };

  return <ReactECharts option={option} style={{ height: '100%' }} />;
}

function processTradesForChart(trades: FlowTrade[], timeframe: Timeframe) {
  // Group by different time buckets based on timeframe
  const bucketMinutes = {
    '1D': 30,      // 30-minute buckets for today
    '1W': 240,     // 4-hour buckets for week
    '1M': 1440,    // Daily buckets for month
    '3M': 1440,    // Daily buckets for 3 months
  };
  
  const minutes = bucketMinutes[timeframe];
  
  // For longer timeframes, group by date instead of time
  if (timeframe === '1M' || timeframe === '3M') {
    return groupByDate(trades);
  }
  
  return groupByTime(trades, minutes);
}

function groupByDate(trades: FlowTrade[]) {
  const buckets: Record<string, { call: number; put: number }> = {};
  
  trades.forEach(trade => {
    const ts = trade.sip_timestamp || trade.timestamp;
    if (!ts) return;
    
    const date = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts / 1000000 : ts * 1000) : ts);
    if (isNaN(date.getTime())) return;
    
    const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    
    if (!buckets[key]) buckets[key] = { call: 0, put: 0 };
    
    const premium = trade.premium || 0;
    if (trade.contract_type === 'call') {
      buckets[key].call += premium;
    } else {
      buckets[key].put += premium;
    }
  });
  
  const labels = Object.keys(buckets);
  
  return {
    labels,
    callPremiums: labels.map(l => buckets[l].call),
    putPremiums: labels.map(l => buckets[l].put),
  };
}

function groupByTime(trades: FlowTrade[], minuteBucket: number) {
  const buckets: Record<string, { call: number; put: number }> = {};
  
  trades.forEach(trade => {
    const ts = trade.sip_timestamp || trade.timestamp;
    if (!ts) return;
    
    const date = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts / 1000000 : ts * 1000) : ts);
    if (isNaN(date.getTime())) return;
    
    // Round to bucket
    date.setMinutes(Math.floor(date.getMinutes() / minuteBucket) * minuteBucket, 0, 0);
    const key = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    
    if (!buckets[key]) buckets[key] = { call: 0, put: 0 };
    
    const premium = trade.premium || 0;
    if (trade.contract_type === 'call') {
      buckets[key].call += premium;
    } else {
      buckets[key].put += premium;
    }
  });
  
  const labels = Object.keys(buckets);
  
  // If only 1 bucket or none, try grouping by strike instead
  if (labels.length <= 1) {
    return groupByStrike(trades);
  }
  
  return {
    labels,
    callPremiums: labels.map(l => buckets[l].call),
    putPremiums: labels.map(l => buckets[l].put),
  };
}

function groupByStrike(trades: FlowTrade[]) {
  const buckets: Record<string, { call: number; put: number }> = {};
  
  trades.forEach(trade => {
    const strike = trade.strike?.toString() || 'Unknown';
    
    if (!buckets[strike]) buckets[strike] = { call: 0, put: 0 };
    
    const premium = trade.premium || 0;
    if (trade.contract_type === 'call') {
      buckets[strike].call += premium;
    } else {
      buckets[strike].put += premium;
    }
  });
  
  // Sort by strike and take top 10
  const strikes = Object.keys(buckets).sort((a, b) => parseFloat(a) - parseFloat(b));
  const sortedByPremium = strikes
    .map(s => ({ strike: s, total: buckets[s].call + buckets[s].put, data: buckets[s] }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);
  
  sortedByPremium.sort((a, b) => parseFloat(a.strike) - parseFloat(b.strike));
  
  return {
    labels: sortedByPremium.map(s => `$${s.strike}`),
    callPremiums: sortedByPremium.map(s => s.data.call),
    putPremiums: sortedByPremium.map(s => s.data.put),
  };
}

function calculateSummary(trades: FlowTrade[]) {
  let callPremium = 0;
  let putPremium = 0;
  let sweepCount = 0;
  
  trades.forEach(trade => {
    const premium = trade.premium || 0;
    if (trade.contract_type === 'call') {
      callPremium += premium;
    } else {
      putPremium += premium;
    }
    const conditions = trade.conditions || [];
    if (conditions.some(c => c?.toLowerCase?.().includes('sweep'))) {
      sweepCount++;
    }
  });
  
  const total = callPremium + putPremium;
  
  return {
    callPremium,
    putPremium,
    callPercent: total > 0 ? (callPremium / total) * 100 : 50,
    putPercent: total > 0 ? (putPremium / total) * 100 : 50,
    sweepPercent: trades.length > 0 ? (sweepCount / trades.length) * 100 : 0,
  };
}

function formatExpiry(expiry?: string): string {
  if (!expiry) return '';
  try {
    const date = new Date(expiry);
    if (isNaN(date.getTime())) return expiry.slice(0, 10);
    return date.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit' });
  } catch {
    return expiry.slice(0, 10);
  }
}

function formatPremium(premium: number): string {
  if (premium >= 1000000) return `${(premium / 1000000).toFixed(1)}M`;
  if (premium >= 1000) return `${(premium / 1000).toFixed(0)}K`;
  return premium.toFixed(0);
}

function formatPremiumValue(value: number): string {
  if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

function getRegime(callPercent: number): string {
  if (callPercent >= 60) return 'BULLISH';
  if (callPercent <= 40) return 'BEARISH';
  return 'NEUTRAL';
}

function getRegimeColor(regime: string): string {
  if (regime === 'BULLISH') return COLORS.green;
  if (regime === 'BEARISH') return COLORS.red;
  return COLORS.yellow;
}
