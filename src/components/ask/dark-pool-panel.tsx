'use client';

import { useEffect, useState } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import ReactECharts from 'echarts-for-react';

interface DarkPoolPanelProps {
  ticker: string;
}

type Timeframe = '1D' | '1W' | '1M' | '3M';

interface DarkPoolPrint {
  timestamp?: string | number;
  price: number;
  size: number;
  value: number;
  sentiment?: 'bullish' | 'bearish' | 'neutral';
  side?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
}

const TIMEFRAMES: { key: Timeframe; label: string; days: number }[] = [
  { key: '1D', label: 'Today', days: 1 },
  { key: '1W', label: '1W', days: 7 },
  { key: '1M', label: '1M', days: 30 },
  { key: '3M', label: '3M', days: 90 },
];

export function DarkPoolPanel({ ticker }: DarkPoolPanelProps) {
  const [prints, setPrints] = useState<DarkPoolPrint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>('1W');
  const [summary, setSummary] = useState<{
    totalValue: number;
    bullishPercent: number;
    avgPrice: number;
    regime: string;
  } | null>(null);

  useEffect(() => {
    const fetchDarkPool = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const tf = TIMEFRAMES.find(t => t.key === timeframe);
        const days = tf?.days || 7;
        
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        const from = startDate.toISOString().split('T')[0];
        const to = endDate.toISOString().split('T')[0];
        
        const res = await fetch(
          `/api/darkpool?tickers=${ticker}&from=${from}&to=${to}&limit=100`
        );
        const json = await res.json();
        
        if (json.success) {
          const dpPrints = json.data?.prints || json.data || [];
          setPrints(Array.isArray(dpPrints) ? dpPrints : []);
          
          // Debug logging
          if (dpPrints.length === 0) {
            console.log('[Dark Pool Panel] No prints returned. Response:', {
              success: json.success,
              hasData: !!json.data,
              printsLength: json.data?.prints?.length,
              stats: json.data?.stats,
            });
          }
          
          // Calculate summary
          if (dpPrints.length > 0) {
            let totalValue = 0;
            let bullishValue = 0;
            let priceSum = 0;
            
            dpPrints.forEach((p: DarkPoolPrint) => {
              const val = p.value || (p.price * p.size);
              totalValue += val;
              priceSum += p.price;
              
              const side = p.side || (p.sentiment === 'bullish' ? 'BULLISH' : p.sentiment === 'bearish' ? 'BEARISH' : 'NEUTRAL');
              if (side === 'BULLISH') {
                bullishValue += val;
              }
            });
            
            const bullishPercent = totalValue > 0 ? (bullishValue / totalValue) * 100 : 50;
            const avgPrice = priceSum / dpPrints.length;
            
            setSummary({
              totalValue,
              bullishPercent,
              avgPrice,
              regime: bullishPercent >= 55 ? 'ACCUMULATION' : 
                      bullishPercent <= 45 ? 'DISTRIBUTION' : 'NEUTRAL',
            });
          } else {
            setSummary(null);
          }
        } else {
          setError(json.error || 'Failed to fetch');
        }
      } catch (err) {
        console.error('Failed to fetch dark pool:', err);
        setError('Failed to fetch dark pool data');
      } finally {
        setLoading(false);
      }
    };

    fetchDarkPool();

    const handleRefresh = () => fetchDarkPool();
    window.addEventListener('refresh-ask-data', handleRefresh);
    return () => window.removeEventListener('refresh-ask-data', handleRefresh);
  }, [ticker, timeframe]);

  const getRegimeColor = () => {
    if (!summary) return COLORS.yellow;
    if (summary.regime === 'ACCUMULATION') return COLORS.green;
    if (summary.regime === 'DISTRIBUTION') return COLORS.red;
    return COLORS.yellow;
  };

  return (
    <div 
      className="rounded-xl p-4 flex flex-col overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header with Timeframe Selector */}
      <div className="flex items-center justify-between mb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
            Dark Pool Activity
          </h3>
          <span 
            className="px-2 py-0.5 rounded text-[10px] font-bold"
            style={{ background: `${getRegimeColor()}20`, color: getRegimeColor() }}
          >
            {summary?.regime || 'NEUTRAL'}
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
      {summary && (
        <div className="flex items-center gap-4 text-[10px] mb-2 flex-shrink-0">
          <span>
            <span className="text-gray-500">Volume:</span>{' '}
            <span className="text-white">${formatValue(summary.totalValue)}</span>
          </span>
          <span>
            <span className="text-gray-500">Bullish:</span>{' '}
            <span style={{ color: summary.bullishPercent >= 50 ? COLORS.green : COLORS.red }}>
              {summary.bullishPercent.toFixed(0)}%
            </span>
          </span>
          <span>
            <span className="text-gray-500">Prints:</span>{' '}
            <span className="text-white">{prints.length}</span>
          </span>
        </div>
      )}

      {/* Chart or List */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            Loading {timeframe} data...
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs">
            {error}
          </div>
        ) : prints.length > 0 ? (
          <div className="h-full flex flex-col">
            {/* Mini Chart */}
            <div className="h-1/2 mb-2">
              <DarkPoolChart prints={prints} />
            </div>
            
            {/* Top Prints */}
            <div className="flex-1 overflow-y-auto space-y-1">
              {prints.slice(0, 5).map((print, i) => (
                <div 
                  key={i}
                  className="flex items-center justify-between p-1.5 rounded-lg"
                  style={{ background: 'rgba(255,255,255,0.03)' }}
                >
                  <div className="flex items-center gap-2">
                    <span 
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ 
                        background: (print.side === 'BULLISH' || print.sentiment === 'bullish') ? COLORS.green : 
                                   (print.side === 'BEARISH' || print.sentiment === 'bearish') ? COLORS.red : COLORS.yellow 
                      }}
                    />
                    <span className="text-[11px] text-white font-mono">
                      ${print.price?.toFixed(2)}
                    </span>
                  </div>
                  <span className="text-[11px] text-gray-400">
                    ${formatValue(print.value || print.price * print.size)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-gray-500 text-xs text-center">
            No dark pool prints for {ticker}<br />
            in the last {TIMEFRAMES.find(t => t.key === timeframe)?.label || timeframe}
          </div>
        )}
      </div>
    </div>
  );
}

function DarkPoolChart({ prints }: { prints: DarkPoolPrint[] }) {
  // Group by date/time for visualization
  const buckets: Record<string, { bullish: number; bearish: number }> = {};
  
  prints.forEach(print => {
    const ts = print.timestamp;
    let key = 'Recent';
    
    if (ts) {
      try {
        const date = new Date(typeof ts === 'number' ? (ts > 1e12 ? ts / 1000000 : ts * 1000) : ts);
        if (!isNaN(date.getTime())) {
          key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        }
      } catch {
        // Keep default 'Recent'
      }
    }
    
    if (!buckets[key]) buckets[key] = { bullish: 0, bearish: 0 };
    
    const value = print.value || print.price * print.size;
    const side = print.side || (print.sentiment === 'bullish' ? 'BULLISH' : print.sentiment === 'bearish' ? 'BEARISH' : 'NEUTRAL');
    if (side === 'BULLISH') {
      buckets[key].bullish += value;
    } else if (side === 'BEARISH') {
      buckets[key].bearish += value;
    }
  });
  
  const labels = Object.keys(buckets);
  
  const option = {
    grid: { top: 5, right: 5, bottom: 20, left: 40 },
    xAxis: {
      type: 'category',
      data: labels,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { fontSize: 8, color: '#666' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.03)' } },
      axisLabel: { 
        fontSize: 8, 
        color: '#666',
        formatter: (v: number) => `$${(v/1000000).toFixed(0)}M`
      },
    },
    series: [
      {
        type: 'bar',
        stack: 'total',
        data: labels.map(l => buckets[l].bullish),
        itemStyle: { color: COLORS.green, borderRadius: [2, 2, 0, 0] },
      },
      {
        type: 'bar',
        stack: 'total',
        data: labels.map(l => buckets[l].bearish),
        itemStyle: { color: COLORS.red, borderRadius: [2, 2, 0, 0] },
      },
    ],
  };
  
  return <ReactECharts option={option} style={{ height: '100%' }} />;
}

function formatValue(value: number): string {
  if (value >= 1000000000) return `${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(0)}K`;
  return value.toFixed(0);
}
