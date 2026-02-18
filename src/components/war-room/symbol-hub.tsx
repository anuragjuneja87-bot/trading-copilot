'use client';

import { useState, useEffect } from 'react';
import { useSymbolHubData } from '@/hooks/use-symbol-hub-data';
import { SpokeFlow } from './hub/spoke-flow';
import { SpokeGamma } from './hub/spoke-gamma';
import { SpokeDarkPool } from './hub/spoke-darkpool';
import { SpokeNews } from './hub/spoke-news';
import { SpokeSummary } from './hub/spoke-summary';
import { COLORS } from '@/lib/echarts-theme';

interface SymbolHubProps {
  symbol: string;
  onBack: () => void;
  onAskAI?: (query: string) => void;
}

export function SymbolHub({ symbol, onBack, onAskAI }: SymbolHubProps) {
  const [demoMode, setDemoMode] = useState(false);
  const { flow, prices, levels, regime, news, darkpool, isLoading, isDemoMode, refetch } = useSymbolHubData({
    symbol,
    demoMode,
  });

  // Auto-detect empty data state (market closed) and suggest demo mode
  const allEmpty = !isLoading && !flow?.flow?.length && !darkpool?.prints?.length && !(levels as any)?.currentPrice;

  useEffect(() => {
    // If after 5 seconds everything is still empty, auto-enable demo mode
    if (allEmpty && !demoMode) {
      const timer = setTimeout(() => setDemoMode(true), 5000);
      return () => clearTimeout(timer);
    }
  }, [allEmpty, demoMode]);

  // Extract price for the selected symbol
  const symbolPrice = prices?.find((p: any) => p.ticker === symbol);
  const currentPrice = (levels as any)?.currentPrice || symbolPrice?.price || 0;
  const changePercent = symbolPrice?.changePercent || 0;

  return (
    <div className="max-w-7xl mx-auto">
      {/* ═══ HEADER BAR ═══ */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-[11px] text-[#4a6070] hover:text-[#00e5ff] transition-colors"
          >
            ← Symbols
          </button>
          <div className="flex items-center gap-3">
            <span className="text-3xl font-black text-white"
              style={{ fontFamily: "'Oxanium', monospace" }}>
              {symbol}
            </span>
            {demoMode && (
              <span className="text-[9px] font-bold px-2 py-0.5 rounded"
                style={{ background: 'rgba(255,193,7,0.2)', color: '#ffc107', fontFamily: "'Oxanium', monospace" }}>
                DEMO
              </span>
            )}
            {currentPrice > 0 && (
              <>
                <span className="text-xl font-bold text-white"
                  style={{ fontFamily: "'Oxanium', monospace" }}>
                  ${currentPrice.toFixed(2)}
                </span>
                <span
                  className="text-sm font-bold"
                  style={{
                    color: changePercent >= 0 ? COLORS.green : COLORS.red,
                    fontFamily: "'Oxanium', monospace",
                  }}
                >
                  {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
                </span>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
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
          {/* Regime badge */}
          {regime && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg"
              style={{
                background: regime.status === 'crisis' ? COLORS.glowRed
                  : regime.status === 'elevated' ? 'rgba(255,193,7,0.1)'
                  : COLORS.glowGreen,
                border: `1px solid ${regime.status === 'crisis' ? 'rgba(255,82,82,0.3)'
                  : regime.status === 'elevated' ? 'rgba(255,193,7,0.3)'
                  : 'rgba(0,230,118,0.3)'}`,
              }}
            >
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
                VIX {regime.vixLevel?.toFixed(1) || (regime as any)?.vix?.toFixed(1) || '—'}
              </span>
            </div>
          )}
          {/* Refresh all button */}
          <button
            onClick={refetch}
            className="px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all hover:brightness-110"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: '#8b99b0' }}
          >
            ↻ Refresh All
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

      {/* Empty state with demo mode prompt (shows before auto-enable) */}
      {allEmpty && !demoMode && !isLoading && (
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

      {/* ═══ LOADING STATE ═══ */}
      {isLoading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-xl animate-pulse"
              style={{ height: i < 2 ? 350 : 300, background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }} />
          ))}
        </div>
      )}

      {/* ═══ DATA GRID ═══ */}
      {!isLoading && (
        <div className="space-y-4">
          {/* Top row: Flow + Gamma — these are the most important */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* OPTIONS FLOW SPOKE */}
            <div className="rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                OPTIONS FLOW
                {flow?.stats?.regime && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[8px]"
                    style={{
                      background: flow.stats.regime === 'RISK_ON' ? COLORS.glowGreen
                        : flow.stats.regime === 'RISK_OFF' ? COLORS.glowRed
                        : 'rgba(255,193,7,0.1)',
                      color: flow.stats.regime === 'RISK_ON' ? COLORS.green
                        : flow.stats.regime === 'RISK_OFF' ? COLORS.red
                        : COLORS.yellow,
                    }}>
                    {flow.stats.regime}
                  </span>
                )}
              </div>
              {flow?.flow && flow?.stats ? (
                <SpokeFlow trades={flow.flow} stats={flow.stats} />
              ) : (
                <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
                  No options flow data available
                </div>
              )}
            </div>

            {/* GAMMA LEVELS SPOKE */}
            <div className="rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                GAMMA EXPOSURE / KEY LEVELS
              </div>
              {flow?.stats?.gexByStrike?.length > 0 && levels ? (
                <SpokeGamma
                  gexByStrike={flow.stats.gexByStrike}
                  currentPrice={(levels as any)?.currentPrice || currentPrice}
                  callWall={(levels as any)?.callWall}
                  putWall={(levels as any)?.putWall}
                  maxGamma={(levels as any)?.maxGamma}
                />
              ) : levels ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  {/* Show key levels as badges even without GEX chart */}
                  <div className="text-[11px] text-[#4a6070]">GEX strike data unavailable — showing estimated levels</div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <span className="px-3 py-1.5 rounded text-[10px] font-bold" style={{ background: COLORS.glowGreen, color: COLORS.green }}>
                      CALL WALL ${(levels as any)?.callWall || '—'}
                    </span>
                    <span className="px-3 py-1.5 rounded text-[10px] font-bold" style={{ background: COLORS.glowCyan, color: COLORS.cyan }}>
                      MAX γ ${(levels as any)?.maxGamma || '—'}
                    </span>
                    <span className="px-3 py-1.5 rounded text-[10px] font-bold" style={{ background: COLORS.glowRed, color: COLORS.red }}>
                      PUT WALL ${(levels as any)?.putWall || '—'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
                  No gamma level data available
                </div>
              )}
            </div>
          </div>

          {/* Bottom row: Dark Pool + News */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* DARK POOL SPOKE */}
            <div className="rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <div className="text-[9px] uppercase tracking-wider mb-3"
                style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}>
                DARK POOL ACTIVITY
                {darkpool?.stats?.regime && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[8px]"
                    style={{
                      background: darkpool.stats.regime === 'ACCUMULATION' ? COLORS.glowGreen
                        : darkpool.stats.regime === 'DISTRIBUTION' ? COLORS.glowRed
                        : 'rgba(255,193,7,0.1)',
                      color: darkpool.stats.regime === 'ACCUMULATION' ? COLORS.green
                        : darkpool.stats.regime === 'DISTRIBUTION' ? COLORS.red
                        : COLORS.yellow,
                    }}>
                    {darkpool.stats.regime}
                  </span>
                )}
              </div>
              {darkpool?.prints?.length > 0 ? (
                <SpokeDarkPool prints={darkpool.prints} stats={darkpool.stats} />
              ) : (
                <div className="flex items-center justify-center h-64 text-[11px] text-[#4a6070]">
                  No dark pool prints detected for {symbol}
                </div>
              )}
            </div>

            {/* NEWS SPOKE */}
            <div className="rounded-xl p-4"
              style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
              <SpokeNews
                articles={Array.isArray(news) ? news : ((news as any)?.articles || news || [])}
                sentiment={undefined}
              />
            </div>
          </div>

          {/* Full-width: AI Thesis */}
          <div className="rounded-xl p-4"
            style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
            <SpokeSummary
              symbol={symbol}
              flowRegime={flow?.stats?.regime}
              darkPoolRegime={darkpool?.stats?.regime}
              levels={levels ? (levels as any) : undefined}
              stats={flow?.stats}
              onAskAI={onAskAI}
            />
          </div>
        </div>
      )}
    </div>
  );
}
