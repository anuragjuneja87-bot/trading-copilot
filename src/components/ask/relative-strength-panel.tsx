'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { COLORS } from '@/lib/echarts-theme';
import { TrendingUp, TrendingDown, Minus, Activity } from 'lucide-react';

interface RelativeStrengthPanelProps {
  ticker: string;
  timeframeRange?: {
    from: number;
    to: number;
    label: string;
    isMarketClosed?: boolean;
    tradingDay?: string;
  };
}

interface RSSummary {
  tickerChange: number;
  spyChange: number;
  qqqChange: number;
  rsVsSpy: number;
  rsVsQqq: number;
  corrSpy: number;
  corrQqq: number;
  regime: string;
  session?: string;
}

interface RSDataPoint {
  time: string;
  timeMs: number;
  tickerPct: number;
  spyPct: number;
  qqqPct: number;
  rsVsSpy: number;
  rsVsQqq: number;
}

export function RelativeStrengthPanel({ ticker, timeframeRange }: RelativeStrengthPanelProps) {
  const [data, setData] = useState<RSDataPoint[]>([]);
  const [summary, setSummary] = useState<RSSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!ticker) return;
    
    const fetchRS = async () => {
      setLoading(true);
      setError(null);
      try {
        const cacheBust = Date.now();
        const res = await fetch(`/api/market/relative-strength?ticker=${ticker}&_t=${cacheBust}`, {
          cache: 'no-store',
        });
        const json = await res.json();
        
        if (json.success && json.data) {
          setData(json.data.rsTimeSeries || []);
          setSummary(json.data.summary || null);
        } else {
          setError(json.error || 'Failed to fetch');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    
    fetchRS();
    const interval = setInterval(fetchRS, 60000);
    return () => clearInterval(interval);
  }, [ticker]);

  // Filter data to timeframe window (always fetch full day, filter client-side)
  const filteredData = useMemo(() => {
    if (!data.length || !timeframeRange) return data;
    return data.filter(d => d.timeMs >= timeframeRange.from && d.timeMs <= timeframeRange.to);
  }, [data, timeframeRange]);

  // Recompute summary for the filtered window
  const filteredSummary = useMemo((): RSSummary | null => {
    if (!filteredData.length || !summary) return summary;
    // If no timeframe filter or showing all data, use original summary
    if (!timeframeRange || filteredData.length === data.length) return summary;

    const last = filteredData[filteredData.length - 1];
    const first = filteredData[0];
    // Compute change within the window (not from open)
    const tickerChange = last.tickerPct - first.tickerPct;
    const spyChange = last.spyPct - first.spyPct;
    const qqqChange = last.qqqPct - first.qqqPct;
    const rsVsSpy = Math.round((tickerChange - spyChange) * 100) / 100;
    const rsVsQqq = Math.round((tickerChange - qqqChange) * 100) / 100;
    const avgRS = (rsVsSpy + rsVsQqq) / 2;

    let regime: string;
    if (avgRS > 1.5) regime = 'STRONG_OUTPERFORM';
    else if (avgRS > 0.5) regime = 'OUTPERFORM';
    else if (avgRS > -0.5) regime = 'INLINE';
    else if (avgRS > -1.5) regime = 'UNDERPERFORM';
    else regime = 'STRONG_UNDERPERFORM';

    return {
      tickerChange: Math.round(tickerChange * 100) / 100,
      spyChange: Math.round(spyChange * 100) / 100,
      qqqChange: Math.round(qqqChange * 100) / 100,
      rsVsSpy,
      rsVsQqq,
      corrSpy: summary.corrSpy, // keep full-day correlation
      corrQqq: summary.corrQqq,
      regime,
      session: summary.session, // pass through session context
    };
  }, [filteredData, data, summary, timeframeRange]);

  const chartOption = useMemo(() => {
    if (!filteredData.length) return {};
    
    const times = filteredData.map(d => d.time);
    
    return {
      backgroundColor: 'transparent',
      grid: {
        top: 40,
        right: 60,
        bottom: 45, // room for dataZoom slider
        left: 50,
      },
      legend: {
        top: 5,
        right: 10,
        textStyle: { color: '#888', fontSize: 10 },
        data: [
          { name: ticker, icon: 'roundRect' },
          { name: 'SPY', icon: 'roundRect' },
          { name: 'QQQ', icon: 'roundRect' },
        ],
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#1a1a2e',
        borderColor: '#333',
        textStyle: { color: '#fff', fontSize: 11 },
        formatter: (params: any) => {
          const time = params[0]?.axisValue || '';
          let html = `<div style="font-weight:bold;margin-bottom:4px">${time}</div>`;
          params.forEach((p: any) => {
            const val = p.value;
            const color = val >= 0 ? COLORS.green : COLORS.red;
            html += `<div style="display:flex;justify-content:space-between;gap:12px">
              <span>${p.marker} ${p.seriesName}</span>
              <span style="color:${color};font-weight:bold">${val >= 0 ? '+' : ''}${val.toFixed(2)}%</span>
            </div>`;
          });
          return html;
        },
      },
      // SCROLLABLE: Mouse wheel zoom + drag to pan
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          zoomOnMouseWheel: true,
          moveOnMouseMove: true,
          moveOnMouseWheel: false,
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          height: 18,
          bottom: 5,
          borderColor: 'transparent',
          backgroundColor: 'rgba(255,255,255,0.03)',
          fillerColor: 'rgba(0,229,255,0.1)',
          handleStyle: { color: COLORS.cyan, borderColor: COLORS.cyan },
          textStyle: { color: '#666', fontSize: 9 },
          dataBackground: {
            lineStyle: { color: 'rgba(0,229,255,0.3)' },
            areaStyle: { color: 'rgba(0,229,255,0.05)' },
          },
        },
      ],
      xAxis: {
        type: 'category',
        data: times,
        axisLine: { lineStyle: { color: '#333' } },
        axisLabel: { color: '#666', fontSize: 9 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisLabel: { 
          color: '#666', 
          fontSize: 9,
          formatter: (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`,
        },
        splitLine: { lineStyle: { color: '#1a1a2e' } },
      },
      series: [
        {
          name: ticker,
          type: 'line',
          data: filteredData.map(d => Math.round(d.tickerPct * 100) / 100),
          smooth: true,
          lineStyle: { width: 2.5, color: COLORS.cyan },
          itemStyle: { color: COLORS.cyan },
          symbol: 'none',
          z: 3,
        },
        {
          name: 'SPY',
          type: 'line',
          data: filteredData.map(d => Math.round(d.spyPct * 100) / 100),
          smooth: true,
          lineStyle: { width: 1.5, color: COLORS.green, type: 'dashed' },
          itemStyle: { color: COLORS.green },
          symbol: 'none',
          z: 2,
        },
        {
          name: 'QQQ',
          type: 'line',
          data: filteredData.map(d => Math.round(d.qqqPct * 100) / 100),
          smooth: true,
          lineStyle: { width: 1.5, color: '#a855f7', type: 'dashed' },
          itemStyle: { color: '#a855f7' },
          symbol: 'none',
          z: 1,
        },
      ],
    };
  }, [filteredData, ticker]);

  // Regime display
  const regimeConfig = useMemo(() => {
    if (!filteredSummary) return { label: '—', color: '#888', bg: 'rgba(255,255,255,0.05)', icon: Minus };
    switch (filteredSummary.regime) {
      case 'STRONG_OUTPERFORM': return { label: 'STRONG LEADER', color: COLORS.green, bg: 'rgba(0,230,118,0.12)', icon: TrendingUp };
      case 'OUTPERFORM': return { label: 'OUTPERFORMING', color: COLORS.green, bg: 'rgba(0,230,118,0.08)', icon: TrendingUp };
      case 'INLINE': return { label: 'IN LINE', color: '#ffc107', bg: 'rgba(255,193,7,0.08)', icon: Minus };
      case 'UNDERPERFORM': return { label: 'UNDERPERFORMING', color: COLORS.red, bg: 'rgba(255,82,82,0.08)', icon: TrendingDown };
      case 'STRONG_UNDERPERFORM': return { label: 'STRONG LAGGARD', color: COLORS.red, bg: 'rgba(255,82,82,0.12)', icon: TrendingDown };
      default: return { label: '—', color: '#888', bg: 'rgba(255,255,255,0.05)', icon: Minus };
    }
  }, [filteredSummary]);

  const RegimeIcon = regimeConfig.icon;

  return (
    <div className="rounded-xl overflow-hidden h-full flex flex-col" style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: COLORS.cardBorder }}>
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4" style={{ color: COLORS.cyan }} />
          <span className="text-sm font-bold text-white">RELATIVE STRENGTH</span>
          <span className="text-xs text-gray-500">vs SPY & QQQ</span>
          {filteredSummary?.session && filteredSummary.session !== 'open' && (
            <span className="text-[9px] px-1.5 py-0.5 rounded font-bold uppercase" style={{
              background: filteredSummary.session === 'pre-market' ? 'rgba(255,193,7,0.15)' : 'rgba(255,255,255,0.05)',
              color: filteredSummary.session === 'pre-market' ? '#ffc107' : '#888',
            }}>
              {filteredSummary.session === 'pre-market' ? '⏰ Pre-Market' : filteredSummary.session === 'after-hours' ? 'After Hours' : 'Closed'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{ background: regimeConfig.bg, color: regimeConfig.color }}>
          <RegimeIcon className="w-3 h-3" />
          {regimeConfig.label}
        </div>
      </div>
      
      {/* Stats row */}
      {filteredSummary && (
        <div className="grid grid-cols-5 gap-2 px-4 py-2 border-b" style={{ borderColor: COLORS.cardBorder }}>
          <StatBox label={ticker} value={`${filteredSummary.tickerChange >= 0 ? '+' : ''}${filteredSummary.tickerChange.toFixed(2)}%`} color={filteredSummary.tickerChange >= 0 ? COLORS.green : COLORS.red} />
          <StatBox label="SPY" value={`${filteredSummary.spyChange >= 0 ? '+' : ''}${filteredSummary.spyChange.toFixed(2)}%`} color={filteredSummary.spyChange >= 0 ? COLORS.green : COLORS.red} />
          <StatBox label="RS vs SPY" value={`${filteredSummary.rsVsSpy >= 0 ? '+' : ''}${filteredSummary.rsVsSpy.toFixed(2)}%`} color={filteredSummary.rsVsSpy >= 0 ? COLORS.green : COLORS.red} highlight />
          <StatBox label="RS vs QQQ" value={`${filteredSummary.rsVsQqq >= 0 ? '+' : ''}${filteredSummary.rsVsQqq.toFixed(2)}%`} color={filteredSummary.rsVsQqq >= 0 ? COLORS.green : COLORS.red} highlight />
          <StatBox label="Corr SPY" value={filteredSummary.corrSpy.toFixed(2)} color={Math.abs(filteredSummary.corrSpy) > 0.7 ? COLORS.cyan : '#888'} />
        </div>
      )}
      
      {/* Chart */}
      <div className="flex-1 min-h-0">
        {loading ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">Loading relative strength data...</div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-400 text-sm">{error}</div>
        ) : filteredData.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">No data for this timeframe</div>
        ) : (
          <ReactECharts option={chartOption} style={{ height: '100%', width: '100%' }} opts={{ renderer: 'canvas' }} />
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, color, highlight = false }: { label: string; value: string; color: string; highlight?: boolean }) {
  return (
    <div className="text-center py-1 rounded" style={highlight ? { background: `${color}10` } : {}}>
      <div className="text-[9px] text-gray-500 uppercase tracking-wider">{label}</div>
      <div className="text-sm font-bold font-mono" style={{ color }}>{value}</div>
    </div>
  );
}
