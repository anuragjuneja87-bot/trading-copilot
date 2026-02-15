'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { useOptionsFlow, useRegime } from '@/hooks';
import { useUserStore } from '@/stores';
import { formatCompactNumber, formatPercent, getRelativeTime, cn } from '@/lib/utils';
import { FlowDashboard } from '@/components/flow/flow-dashboard';
import { generateMockFlow } from '@/lib/mock-data';
import { COLORS } from '@/lib/echarts-theme';
import type { EnhancedFlowStats } from '@/types/flow';
import { 
  BarChart3, 
  RefreshCw,
  Lock,
  TrendingUp,
  TrendingDown,
  Flame,
  Zap,
  Clock
} from 'lucide-react';

// Filter presets
const PRESETS = [
  { id: 'all', label: 'All Flow', icon: BarChart3 },
  { id: 'unusual', label: 'Unusual', icon: Zap },
  { id: 'sweeps', label: 'Sweeps', icon: Flame },
  { id: 'calls', label: 'Calls Only', icon: TrendingUp },
  { id: 'puts', label: 'Puts Only', icon: TrendingDown },
];

const POPULAR_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'AMZN', 'GOOGL', 'MSFT'];

export default function FlowPage() {
  const [activePreset, setActivePreset] = useState('all');
  const [minPremium, setMinPremium] = useState(10000);
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA']);
  const [tickerInput, setTickerInput] = useState('');
  const [demoMode, setDemoMode] = useState(false);
  
  const tier = useUserStore((s) => s.tier);
  const isDelayed = tier === 'free';

  // Build filters based on preset
  const filters = useMemo(() => {
    const f: any = { 
      tickers: selectedTickers.join(','),
      minPremium, 
      limit: 100 
    };
    switch (activePreset) {
      case 'unusual': f.unusual = true; break;
      case 'sweeps': f.sweeps = true; break;
      case 'calls': f.callPut = 'C'; break;
      case 'puts': f.callPut = 'P'; break;
    }
    return f;
  }, [activePreset, minPremium, selectedTickers]);

  const { data: flowData, isLoading, refetch, dataUpdatedAt } = useOptionsFlow(filters);
  const { data: regime } = useRegime();

  // Extract flow and stats
  const flow = useMemo(() => {
    if (!flowData) return [];
    if (flowData.data?.flow && Array.isArray(flowData.data.flow)) return flowData.data.flow;
    if (Array.isArray(flowData)) return flowData;
    if (flowData.flow && Array.isArray(flowData.flow)) return flowData.flow;
    return [];
  }, [flowData]);

  const flowStats = useMemo(() => {
    if (!flowData?.data?.stats) return null;
    return flowData.data.stats as EnhancedFlowStats;
  }, [flowData]);

  // Auto-detect empty data
  const isDataEmpty = !isLoading && (!flow || flow.length === 0) && !flowStats;

  useEffect(() => {
    if (isDataEmpty && !demoMode) {
      const timer = setTimeout(() => setDemoMode(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isDataEmpty, demoMode]);

  // Mock data for demo mode
  const mockData = useMemo(() => {
    if (!demoMode) return null;
    return generateMockFlow(selectedTickers[0] || 'SPY');
  }, [demoMode, selectedTickers]);

  // Use mock data when in demo mode
  const displayFlow = demoMode ? (mockData?.flow || []) : flow;
  const displayStats = demoMode ? (mockData?.stats || null) : flowStats;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#060810' }}>
      <Navbar />
      
      <main className="flex-1 pt-20" style={{ background: '#060810', minHeight: '100vh' }}>
        <div className="mx-auto max-w-7xl px-4 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-white"
                  style={{ fontFamily: "'Oxanium', monospace" }}>
                  Options Flow
                </h1>
                {isDelayed && (
                  <span className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: 'rgba(255,193,7,0.1)', color: '#ffc107', fontFamily: "'Oxanium', monospace" }}>
                    <Clock className="h-3 w-3 inline mr-1" />
                    30 min delay
                  </span>
                )}
                {demoMode && (
                  <span className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107', fontFamily: "'Oxanium', monospace" }}>
                    DEMO
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[#8b99b0]">
                Real-time options order flow with smart filtering
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Regime indicator */}
              {regime && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                  style={{
                    background: regime.status === 'crisis' ? COLORS.glowRed
                      : regime.status === 'elevated' ? 'rgba(255,193,7,0.1)'
                      : COLORS.glowGreen,
                    border: `1px solid ${regime.status === 'crisis' ? 'rgba(255,82,82,0.3)'
                      : regime.status === 'elevated' ? 'rgba(255,193,7,0.3)'
                      : 'rgba(0,230,118,0.3)'}`,
                  }}>
                  <div className="w-2 h-2 rounded-full animate-pulse"
                    style={{
                      backgroundColor: regime.status === 'crisis' ? COLORS.red
                        : regime.status === 'elevated' ? COLORS.yellow
                        : COLORS.green,
                    }} />
                  <span className="text-[10px] font-bold uppercase tracking-wider"
                    style={{
                      color: regime.status === 'crisis' ? COLORS.red
                        : regime.status === 'elevated' ? COLORS.yellow
                        : COLORS.green,
                      fontFamily: "'Oxanium', monospace",
                    }}>
                    {regime.status}
                  </span>
                  <span className="text-[10px] text-[#4a6070]"
                    style={{ fontFamily: "'Oxanium', monospace" }}>
                    VIX {regime.vixLevel?.toFixed(1) || '—'}
                  </span>
                </div>
              )}
              
              {/* Demo toggle */}
              <button
                onClick={() => setDemoMode(!demoMode)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all"
                style={{
                  background: demoMode ? 'rgba(255,193,7,0.1)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${demoMode ? 'rgba(255,193,7,0.3)' : 'rgba(255,255,255,0.08)'}`,
                  color: demoMode ? '#ffc107' : '#8b99b0',
                }}
              >
                {demoMode ? '◉ Demo' : '○ Demo'}
              </button>
              
              {/* Refresh button */}
              <button
                onClick={() => refetch()}
                disabled={isLoading}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:brightness-110 disabled:opacity-50"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8b99b0' }}
              >
                <RefreshCw className={cn('h-3 w-3 inline mr-1', isLoading && 'animate-spin')} />
                Refresh
              </button>
              
              {/* Upgrade CTA for free users */}
              {isDelayed && (
                <Link
                  href="/pricing"
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:brightness-110 inline-flex items-center gap-1.5"
                  style={{ background: '#00e5ff', color: '#0a0f1a' }}
                >
                  <Lock className="h-3 w-3" />
                  Get Real-Time
                </Link>
              )}
            </div>
          </div>

          {/* Demo Mode Banner */}
          {demoMode && (
            <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-lg"
              style={{
                background: 'rgba(255,193,7,0.08)',
                border: '1px solid rgba(255,193,7,0.2)',
              }}>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold px-2 py-0.5 rounded"
                  style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107', fontFamily: "'Oxanium', monospace" }}>
                  DEMO
                </span>
                <span className="text-[11px] text-[#8b99b0]">
                  Showing simulated data — live data available during market hours (Mon-Fri 9:30AM-4PM ET)
                </span>
              </div>
              <button
                onClick={() => setDemoMode(false)}
                className="text-[10px] text-[#4a6070] hover:text-white transition-colors"
              >
                Try live data →
              </button>
            </div>
          )}

          {/* Empty state with demo mode prompt */}
          {isDataEmpty && !demoMode && !isLoading && (
            <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-lg"
              style={{
                background: 'rgba(0,229,255,0.05)',
                border: '1px solid rgba(0,229,255,0.1)',
              }}>
              <span className="text-[11px] text-[#8b99b0]">
                Market is currently closed. Want to explore with demo data?
              </span>
              <button
                onClick={() => setDemoMode(true)}
                className="text-[10px] font-semibold px-3 py-1.5 rounded-lg transition-all hover:brightness-110"
                style={{ background: 'rgba(0,229,255,0.15)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }}
              >
                Enable Demo Mode
              </button>
            </div>
          )}

          {/* Ticker chips */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <span className="text-[10px] uppercase tracking-wider mr-2"
              style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
              TICKERS
            </span>
            {POPULAR_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => {
                  setSelectedTickers(prev =>
                    prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
                  );
                }}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: selectedTickers.includes(t) ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedTickers.includes(t) ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: selectedTickers.includes(t) ? '#00e5ff' : '#8b99b0',
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                {t}
              </button>
            ))}
            {/* Custom ticker input */}
            <input
              type="text"
              value={tickerInput}
              onChange={(e) => setTickerInput(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tickerInput.length >= 1) {
                  if (!selectedTickers.includes(tickerInput)) {
                    setSelectedTickers(prev => [...prev, tickerInput]);
                  }
                  setTickerInput('');
                }
              }}
              placeholder="+ Add"
              maxLength={5}
              className="w-16 px-2 py-1 rounded-lg text-[11px] bg-transparent text-white placeholder:text-[#2a4a5a] focus:outline-none focus:ring-1 focus:ring-[rgba(0,229,255,0.3)]"
              style={{ border: '1px solid rgba(255,255,255,0.06)', fontFamily: "'Oxanium', monospace" }}
            />
          </div>

          {/* Filter presets */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setActivePreset(preset.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  activePreset === preset.id
                    ? 'text-white'
                    : 'text-[#8b99b0] hover:text-white'
                )}
                style={{
                  background: activePreset === preset.id ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${activePreset === preset.id ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                <preset.icon className="h-4 w-4" />
                {preset.label}
              </button>
            ))}
            
            {/* Premium filter */}
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-[#4a6070]">Min Premium:</span>
              <select
                value={minPremium}
                onChange={(e) => setMinPremium(parseInt(e.target.value))}
                className="bg-transparent border border-[rgba(255,255,255,0.06)] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[rgba(0,229,255,0.3)]"
                style={{ fontFamily: "'Oxanium', monospace" }}
              >
                <option value={10000}>$10K+</option>
                <option value={50000}>$50K+</option>
                <option value={100000}>$100K+</option>
                <option value={500000}>$500K+</option>
                <option value={1000000}>$1M+</option>
              </select>
            </div>
          </div>

          {/* Stats + Chart Section */}
          {displayStats && (
            <div className="mb-6">
              <FlowDashboard stats={displayStats} isDemoMode={demoMode} />
            </div>
          )}

          {/* Flow table */}
          <div className="rounded-xl border border-[rgba(255,255,255,0.05)] overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.02)' }}>
            {/* Table header */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.05)]"
                    style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Strike / Expiry
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Size
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Premium
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      OTM %
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Heat
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-[#4a6070] uppercase tracking-wider"
                      style={{ fontFamily: "'Oxanium', monospace" }}>
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    // Loading skeleton
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b border-[rgba(255,255,255,0.03)]">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 rounded animate-pulse"
                              style={{ background: 'rgba(255,255,255,0.05)' }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : !Array.isArray(displayFlow) || displayFlow.length === 0 ? (
                    // Empty state
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <BarChart3 className="h-12 w-12 text-[#4a6070] mx-auto mb-4" />
                        <p className="text-[#8b99b0]">No flow data matching your filters</p>
                        <p className="text-sm text-[#4a6070] mt-1">Try adjusting your filters or wait for new activity</p>
                      </td>
                    </tr>
                  ) : (
                    // Flow rows
                    Array.isArray(displayFlow) && displayFlow.map((item: any) => (
                      <tr
                        key={item.id}
                        className={cn(
                          'border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(0,229,255,0.03)] transition-colors',
                          item.isGolden && 'bg-[rgba(255,193,7,0.05)] border-l-2',
                          item.isSweep && !item.isGolden && 'border-l-2',
                          item.isUnusual && !item.isSweep && 'border-l-2',
                        )}
                        style={{
                          borderLeftColor: item.isGolden ? '#ffc107'
                            : item.isSweep ? '#ffc107'
                            : item.isUnusual ? '#00e5ff' : undefined,
                        }}
                      >
                        {/* Ticker */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white"
                              style={{ fontFamily: "'Oxanium', monospace" }}>
                              {item.ticker}
                            </span>
                            {item.isGolden && (
                              <span className="text-yellow-500" title="Golden Sweep">✨</span>
                            )}
                          </div>
                          {item.spotPrice && (
                            <div className="text-xs text-[#4a6070]">
                              ${item.spotPrice?.toFixed(2)}
                            </div>
                          )}
                        </td>
                        
                        {/* Strike / Expiry */}
                        <td className="px-4 py-3">
                          <div className="text-white"
                            style={{ fontFamily: "'Oxanium', monospace" }}>
                            ${item.strike}
                          </div>
                          <div className="text-xs text-[#4a6070]">
                            {item.expiry}
                          </div>
                        </td>
                        
                        {/* Type (Call/Put + Side) */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold"
                              style={{
                                background: item.callPut === 'C' ? COLORS.glowGreen : COLORS.glowRed,
                                color: item.callPut === 'C' ? COLORS.green : COLORS.red,
                                fontFamily: "'Oxanium', monospace",
                              }}
                            >
                              {item.callPut === 'C' ? 'CALL' : 'PUT'}
                            </span>
                            {item.isSweep && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                                style={{ background: COLORS.glowCyan, color: COLORS.cyan }}>
                                SWEEP
                              </span>
                            )}
                            {item.tradeType === 'BLOCK' && (
                              <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase"
                                style={{ background: 'rgba(255,193,7,0.1)', color: COLORS.yellow }}>
                                BLOCK
                              </span>
                            )}
                          </div>
                        </td>
                        
                        {/* Size */}
                        <td className="px-4 py-3 text-right">
                          <span className="text-white"
                            style={{ fontFamily: "'Oxanium', monospace" }}>
                            {formatCompactNumber(item.size)}
                          </span>
                          {item.openInterest > 0 && (
                            <div className="text-xs text-[#4a6070]">
                              OI: {formatCompactNumber(item.openInterest)}
                            </div>
                          )}
                        </td>
                        
                        {/* Premium */}
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'font-bold',
                            item.premium >= 1000000 && 'text-yellow-500',
                            item.premium >= 500000 && item.premium < 1000000 && 'text-[#00e5ff]',
                            item.premium < 500000 && 'text-white',
                          )}
                          style={{ fontFamily: "'Oxanium', monospace" }}>
                            ${formatCompactNumber(item.premium)}
                          </span>
                        </td>
                        
                        {/* OTM % */}
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'text-sm',
                            item.otmPercent > 10 && 'text-[#ffc107]',
                            item.otmPercent <= 10 && 'text-[#8b99b0]',
                          )}
                          style={{ fontFamily: "'Oxanium', monospace" }}>
                            {formatPercent(item.otmPercent || 0, 1)}
                          </span>
                        </td>
                        
                        {/* Heat Score */}
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <HeatScore score={item.heatScore || item.smartMoneyScore || 0} />
                          </div>
                        </td>
                        
                        {/* Time */}
                        <td className="px-4 py-3 text-right text-sm text-[#4a6070]">
                          {getRelativeTime(new Date(item.timestamp))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Footer */}
            {dataUpdatedAt && (
              <div className="px-4 py-3 border-t border-[rgba(255,255,255,0.05)] flex items-center justify-between"
                style={{ background: 'rgba(255,255,255,0.02)' }}>
                <span className="text-xs text-[#4a6070]">
                  {Array.isArray(displayFlow) ? displayFlow.length : 0} trades shown • Last updated {getRelativeTime(new Date(dataUpdatedAt))}
                </span>
                {isDelayed && (
                  <Link href="/pricing" className="text-xs text-[#00e5ff] hover:underline">
                    Upgrade for real-time data →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* War Room CTA */}
          <div className="mt-8 rounded-xl p-6 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(0,230,118,0.05) 100%)',
              border: '1px solid rgba(0,229,255,0.15)',
            }}>
            <h3 className="text-lg font-bold text-white mb-2">
              See the full picture in the War Room
            </h3>
            <p className="text-sm text-[#8b99b0] mb-4 max-w-lg mx-auto">
              Combine options flow with dark pool data, gamma levels, and AI analysis for any symbol — all in one view.
            </p>
            <a
              href="/ask"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-sm font-bold transition-all hover:brightness-110"
              style={{ background: '#00e5ff', color: '#0a0f1a' }}
            >
              Open War Room →
            </a>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

// Heat score visualization
function HeatScore({ score }: { score: number }) {
  const flames = Math.ceil(score / 2); // 1-5 flames for 1-10 score
  const color = score >= 8 ? COLORS.red : score >= 6 ? COLORS.yellow : '#4a6070';
  
  return (
    <div className="flex items-center gap-0.5" style={{ color }} title={`Heat Score: ${score}/10`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Flame
          key={i}
          className={cn(
            'h-3 w-3',
            i < flames ? 'opacity-100' : 'opacity-20'
          )}
          fill={i < flames ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}
