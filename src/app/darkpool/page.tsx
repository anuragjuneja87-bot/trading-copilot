'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { useDarkPoolData } from '@/hooks/use-darkpool-data';
import { useRegime } from '@/hooks';
import { generateMockDarkPool } from '@/lib/mock-data';
import { DPBubbleChart } from '@/components/darkpool/dp-bubble-chart';
import { DPAccumulationHeatmap } from '@/components/darkpool/dp-accumulation-heatmap';
import { DPSizeDistribution } from '@/components/darkpool/dp-size-distribution';
import { DPPrintsTable } from '@/components/darkpool/dp-prints-table';
import { COLORS } from '@/lib/echarts-theme';
import { RefreshCw } from 'lucide-react';

const POPULAR_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'AMZN'];

const PRESETS = [
  { id: 'all', label: 'All Prints' },
  { id: 'large', label: 'Large ($1M+)' },
  { id: 'mega', label: 'Mega ($10M+)' },
  { id: 'bullish', label: 'Bullish Only' },
  { id: 'bearish', label: 'Bearish Only' },
];

const TIME_OPTIONS = [
  { value: 'hour', label: 'Last Hour' },
  { value: '4hour', label: 'Last 4 Hours' },
  { value: 'day', label: 'Today' },
];

export default function DarkPoolPage() {
  const [selectedTickers, setSelectedTickers] = useState<string[]>(['SPY', 'NVDA']);
  const [tickerInput, setTickerInput] = useState('');
  const [activePreset, setActivePreset] = useState('all');
  const [timeWindow, setTimeWindow] = useState('day');
  const [minValue, setMinValue] = useState(100000);
  const [demoMode, setDemoMode] = useState(false);

  const { data: regime } = useRegime();

  // Compute minSize based on preset
  const effectiveMinSize = activePreset === 'mega' ? 10_000_000
    : activePreset === 'large' ? 1_000_000
    : minValue;

  const { data: dpData, isLoading, refetch } = useDarkPoolData({
    tickers: selectedTickers,
    minSize: effectiveMinSize,
    time: timeWindow,
    enabled: !demoMode,
  });

  // Demo mode
  const mockData = useMemo(() => {
    if (!demoMode) return null;
    // Combine mock data from all selected tickers
    const combined = { prints: [] as any[], stats: null as any };
    selectedTickers.forEach(t => {
      const mock = generateMockDarkPool(t);
      combined.prints.push(...mock.prints);
      combined.stats = mock.stats; // Use last ticker's stats (good enough for demo)
    });
    combined.prints.sort((a: any, b: any) => b.timestampMs - a.timestampMs);
    return combined;
  }, [demoMode, selectedTickers]);

  const isDataEmpty = !isLoading && (!dpData?.prints?.length);

  useEffect(() => {
    if (isDataEmpty && !demoMode) {
      const timer = setTimeout(() => setDemoMode(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isDataEmpty, demoMode]);

  const prints = demoMode ? (mockData?.prints || []) : (dpData?.prints || []);
  const stats = demoMode ? mockData?.stats : dpData?.stats;

  // Apply client-side filters
  const filteredPrints = useMemo(() => {
    let filtered = prints;
    if (activePreset === 'bullish') filtered = filtered.filter((p: any) => p.side === 'BULLISH');
    if (activePreset === 'bearish') filtered = filtered.filter((p: any) => p.side === 'BEARISH');
    return filtered;
  }, [prints, activePreset]);

  // Get current price from first print (for heatmap highlighting)
  const currentPrice = useMemo(() => {
    if (filteredPrints.length === 0) return undefined;
    return filteredPrints[0]?.price;
  }, [filteredPrints]);

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
                  Dark Pool Activity
                </h1>
                {demoMode && (
                  <span className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107', fontFamily: "'Oxanium', monospace" }}>
                    DEMO
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[#8b99b0]">
                Track institutional block trades & accumulation
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
                <RefreshCw className={`h-3 w-3 inline mr-1 ${isLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
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
                className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: activePreset === preset.id ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${activePreset === preset.id ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: activePreset === preset.id ? '#00e5ff' : '#8b99b0',
                }}
              >
                {preset.label}
              </button>
            ))}
            
            {/* Time window */}
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-[#4a6070]">Time:</span>
              <select
                value={timeWindow}
                onChange={(e) => setTimeWindow(e.target.value)}
                className="bg-transparent border border-[rgba(255,255,255,0.06)] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[rgba(0,229,255,0.3)]"
                style={{ fontFamily: "'Oxanium', monospace" }}
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Min value (only show if not mega/large preset) */}
            {activePreset === 'all' && (
              <div className="flex items-center gap-2 ml-4">
                <span className="text-sm text-[#4a6070]">Min Value:</span>
                <select
                  value={minValue}
                  onChange={(e) => setMinValue(parseInt(e.target.value))}
                  className="bg-transparent border border-[rgba(255,255,255,0.06)] rounded-md px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-[rgba(0,229,255,0.3)]"
                  style={{ fontFamily: "'Oxanium', monospace" }}
                >
                  <option value={100000}>$100K+</option>
                  <option value={500000}>$500K+</option>
                  <option value={1000000}>$1M+</option>
                  <option value={5000000}>$5M+</option>
                </select>
              </div>
            )}
          </div>

          {/* Stats Bar */}
          {stats && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
              {/* Total Value */}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1.5"
                  style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                  TOTAL VALUE
                </div>
                <div className="text-lg font-bold"
                  style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
                  ${(stats.totalValue / 1e6).toFixed(1)}M
                </div>
              </div>

              {/* Print Count */}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1.5"
                  style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                  PRINTS
                </div>
                <div className="text-lg font-bold"
                  style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
                  {stats.printCount}
                </div>
              </div>

              {/* Bull/Bear Split */}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1.5"
                  style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                  BULL/BEAR
                </div>
                <div className="text-sm font-bold mb-1"
                  style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
                  {stats.bullishPct}% / {stats.bearishPct}%
                </div>
                <div className="flex h-1.5 w-full rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <div style={{ width: `${stats.bullishPct}%`, background: COLORS.green }} className="rounded-l-full" />
                  <div style={{ width: `${stats.bearishPct}%`, background: COLORS.red }} className="rounded-r-full" />
                </div>
              </div>

              {/* Largest Print */}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1.5"
                  style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                  LARGEST
                </div>
                {stats.largestPrint ? (
                  <>
                    <div className="text-sm font-bold"
                      style={{ fontFamily: "'Oxanium', monospace", color: '#e0e6f0' }}>
                      ${(stats.largestPrint.value / 1e6).toFixed(1)}M
                    </div>
                    <div className="text-[10px] text-[#4a6070]">
                      @ ${stats.largestPrint.price.toFixed(2)}
                    </div>
                    <span className="text-[8px] font-bold px-1.5 py-0.5 rounded mt-1 inline-block"
                      style={{
                        background: stats.largestPrint.side === 'BULLISH' ? COLORS.glowGreen
                          : stats.largestPrint.side === 'BEARISH' ? COLORS.glowRed
                          : 'rgba(255,255,255,0.05)',
                        color: stats.largestPrint.side === 'BULLISH' ? COLORS.green
                          : stats.largestPrint.side === 'BEARISH' ? COLORS.red
                          : COLORS.muted,
                      }}>
                      {stats.largestPrint.side}
                    </span>
                  </>
                ) : (
                  <div className="text-sm text-[#4a6070]">—</div>
                )}
              </div>

              {/* Size Distribution */}
              <div className="rounded-lg p-3 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                {stats.sizeDistribution && (
                  <DPSizeDistribution distribution={stats.sizeDistribution} />
                )}
              </div>

              {/* Regime */}
              <div className="rounded-lg p-3"
                style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <div className="text-[9px] uppercase tracking-wider mb-1.5"
                  style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                  REGIME
                </div>
                <span className="text-xs font-bold px-2 py-0.5 rounded"
                  style={{
                    background: stats.regime === 'ACCUMULATION' ? COLORS.glowGreen
                      : stats.regime === 'DISTRIBUTION' ? COLORS.glowRed
                      : 'rgba(255,255,255,0.05)',
                    color: stats.regime === 'ACCUMULATION' ? COLORS.green
                      : stats.regime === 'DISTRIBUTION' ? COLORS.red
                      : COLORS.muted,
                  }}>
                  {stats.regime}
                </span>
              </div>
            </div>
          )}

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 mb-6">
            {/* Bubble chart takes 3/5 */}
            <div className="lg:col-span-3 rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                PRINT TIMELINE
                {demoMode && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[8px]"
                    style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107' }}>
                    DEMO
                  </span>
                )}
              </div>
              {filteredPrints.length > 0 ? (
                <DPBubbleChart prints={filteredPrints} />
              ) : (
                <div className="flex items-center justify-center h-[450px] text-[11px] text-[#4a6070]">
                  No prints detected for selected filters
                </div>
              )}
            </div>

            {/* Accumulation heatmap takes 2/5 */}
            <div className="lg:col-span-2 rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                ACCUMULATION ZONES
                <span className="ml-2 text-[8px] text-[#4a6070] normal-case tracking-normal">
                  Hidden support &amp; resistance
                </span>
              </div>
              {stats?.priceLevels?.length > 0 ? (
                <DPAccumulationHeatmap priceLevels={stats.priceLevels} currentPrice={currentPrice} />
              ) : (
                <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
                  No accumulation zones detected
                </div>
              )}
            </div>
          </div>

          {/* Prints Table */}
          {filteredPrints.length > 0 && (
            <div className="mb-6">
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                ALL PRINTS ({filteredPrints.length})
              </div>
              <DPPrintsTable prints={filteredPrints} />
            </div>
          )}

          {/* War Room CTA */}
          <div className="mt-8 rounded-xl p-6 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(0,230,118,0.05) 100%)',
              border: '1px solid rgba(0,229,255,0.15)',
            }}>
            <h3 className="text-lg font-bold text-white mb-2">
              Go deeper in the War Room
            </h3>
            <p className="text-sm text-[#8b99b0] mb-4 max-w-lg mx-auto">
              Combine dark pool data with options flow, gamma levels, and AI analysis for any symbol — all in one view.
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
