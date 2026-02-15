'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { useGexData } from '@/hooks/use-gex-data';
import { useRegime } from '@/hooks';
import { generateMockFlow, generateMockLevels } from '@/lib/mock-data';
import { GexStrikeChart } from '@/components/levels/gex-strike-chart';
import { NetGexChart } from '@/components/levels/net-gex-chart';
import { OIDistributionChart } from '@/components/levels/oi-distribution-chart';
import { KeyLevelsDisplay } from '@/components/levels/key-levels-display';
import { COLORS } from '@/lib/echarts-theme';
import { RefreshCw } from 'lucide-react';

const QUICK_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'AMZN'];

export default function LevelsPage() {
  const [selectedTicker, setSelectedTicker] = useState('SPY');
  const [demoMode, setDemoMode] = useState(false);

  const { data: regime } = useRegime();
  const { gexByStrike, currentPrice, callWall, putWall, maxGamma, source, isLoading, refetch } = useGexData({
    ticker: selectedTicker,
    enabled: !demoMode,
  });

  // Demo mode
  const mockData = useMemo(() => {
    if (!demoMode) return null;
    const mockLevels = generateMockLevels(selectedTicker);
    const mockFlow = generateMockFlow(selectedTicker);
    return {
      gexByStrike: mockFlow.stats.gexByStrike || [],
      currentPrice: mockLevels.currentPrice || 0,
      callWall: mockLevels.callWall || 0,
      putWall: mockLevels.putWall || 0,
      maxGamma: mockLevels.maxGamma || 0,
      source: 'demo',
    };
  }, [demoMode, selectedTicker]);

  // Auto-detect empty data
  const isDataEmpty = !isLoading && gexByStrike.length === 0 && currentPrice === 0;

  useEffect(() => {
    if (isDataEmpty && !demoMode) {
      const timer = setTimeout(() => setDemoMode(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [isDataEmpty, demoMode]);

  // Use mock or real data
  const displayGex = demoMode ? (mockData?.gexByStrike || []) : gexByStrike;
  const displayPrice = demoMode ? (mockData?.currentPrice || 0) : currentPrice;
  const displayCallWall = demoMode ? (mockData?.callWall || 0) : callWall;
  const displayPutWall = demoMode ? (mockData?.putWall || 0) : putWall;
  const displayMaxGamma = demoMode ? (mockData?.maxGamma || 0) : maxGamma;
  const displaySource = demoMode ? 'demo' : source;

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
                  Gamma Levels & GEX
                </h1>
                {demoMode && (
                  <span className="px-2 py-1 rounded text-[10px] font-bold"
                    style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107', fontFamily: "'Oxanium', monospace" }}>
                    DEMO
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-[#8b99b0]">
                See where market makers are hedging — call walls, put walls, and gamma pin levels
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

          {/* Ticker selector - single select */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <span className="text-[10px] uppercase tracking-wider mr-2"
              style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
              TICKER
            </span>
            {QUICK_TICKERS.map((t) => (
              <button
                key={t}
                onClick={() => setSelectedTicker(t)}
                className="px-3 py-1 rounded-lg text-[11px] font-semibold transition-all"
                style={{
                  background: selectedTicker === t ? 'rgba(0,229,255,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${selectedTicker === t ? 'rgba(0,229,255,0.3)' : 'rgba(255,255,255,0.06)'}`,
                  color: selectedTicker === t ? '#00e5ff' : '#8b99b0',
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Key Levels Display */}
          {displayPrice > 0 && (
            <div className="mb-6">
              <KeyLevelsDisplay
                currentPrice={displayPrice}
                callWall={displayCallWall}
                putWall={displayPutWall}
                maxGamma={displayMaxGamma}
                source={displaySource}
              />
            </div>
          )}

          {/* GEX Strike Chart */}
          <div className="mb-6 rounded-xl p-4"
            style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
            <div className="text-[9px] uppercase tracking-wider mb-3"
              style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
              GEX STRIKE MAP
              {demoMode && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[8px]"
                  style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107' }}>
                  DEMO
                </span>
              )}
            </div>
            {displayGex.length > 0 ? (
              <GexStrikeChart
                gexByStrike={displayGex}
                currentPrice={displayPrice}
                callWall={displayCallWall}
                putWall={displayPutWall}
                maxGamma={displayMaxGamma}
              />
            ) : (
              <div className="flex items-center justify-center h-[500px] text-[11px] text-[#4a6070]">
                No GEX data available for {selectedTicker}
              </div>
            )}
          </div>

          {/* Net GEX and OI Distribution Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {/* Net GEX Profile */}
            <div className="rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                NET GEX PROFILE
              </div>
              {displayGex.length > 0 ? (
                <NetGexChart gexByStrike={displayGex} currentPrice={displayPrice} />
              ) : (
                <div className="flex items-center justify-center h-[280px] text-[11px] text-[#4a6070]">
                  No net GEX data
                </div>
              )}
            </div>

            {/* OI Distribution */}
            <div className="rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                OPEN INTEREST BY STRIKE
              </div>
              {displayGex.length > 0 ? (
                <OIDistributionChart gexByStrike={displayGex} currentPrice={displayPrice} />
              ) : (
                <div className="flex items-center justify-center h-[300px] text-[11px] text-[#4a6070]">
                  No OI data
                </div>
              )}
            </div>
          </div>

          {/* Educational Content */}
          <div className="rounded-xl p-6 mt-6"
            style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
            <div className="text-[9px] uppercase tracking-wider mb-4"
              style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
              UNDERSTANDING GAMMA LEVELS
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-[12px] text-[#8b99b0] leading-relaxed">
              <div>
                <div className="font-bold mb-2" style={{ color: COLORS.green }}>Call Wall (Resistance)</div>
                <p>The strike with the highest call open interest and gamma exposure above the current price.
                Market makers who sold these calls will sell shares as price rises toward this level, creating resistance.
                Price tends to stall or reverse at the call wall.</p>
              </div>
              <div>
                <div className="font-bold mb-2" style={{ color: COLORS.red }}>Put Wall (Support)</div>
                <p>The strike with the highest put open interest and gamma exposure below the current price.
                Market makers who sold these puts will buy shares as price drops toward this level, creating support.
                Price tends to bounce at the put wall.</p>
              </div>
              <div>
                <div className="font-bold mb-2" style={{ color: COLORS.cyan }}>Max Gamma (Pin)</div>
                <p>The strike with the highest total gamma exposure. Price is magnetically attracted to this level
                because market maker hedging creates mean-reversion. When net GEX is positive, expect choppy,
                range-bound action. When negative, expect trending moves with momentum.</p>
              </div>
            </div>
          </div>

          {/* War Room CTA */}
          <div className="mt-8 rounded-xl p-6 text-center"
            style={{
              background: 'linear-gradient(135deg, rgba(0,229,255,0.08) 0%, rgba(0,230,118,0.05) 100%)',
              border: '1px solid rgba(0,229,255,0.15)',
            }}>
            <h3 className="text-lg font-bold text-white mb-2">
              Combine gamma levels with options flow & dark pool
            </h3>
            <p className="text-sm text-[#8b99b0] mb-4 max-w-lg mx-auto">
              See the complete picture for any symbol — gamma levels, institutional flow, dark pool accumulation, and AI analysis in one view.
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
