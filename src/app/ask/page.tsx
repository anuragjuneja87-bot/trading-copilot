'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWatchlistStore } from '@/stores';
import { useWarRoomData } from '@/hooks/use-war-room-data';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { COLORS } from '@/lib/echarts-theme';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { YodhaLogo, YodhaWordmark } from '@/components/brand/yodha-logo';

// Components
import { LiveTickerBar } from '@/components/layout/live-ticker-bar';
import { HeroVerdict } from '@/components/war-room/hero-verdict';
import { SignalConflicts } from '@/components/war-room/signal-conflicts';
import { OptionsFlowPanel } from '@/components/ask/options-flow-panel';
import { DarkPoolPanel } from '@/components/ask/dark-pool-panel';
import { GammaLevelsPanel } from '@/components/ask/gamma-levels-panel';
import { NewsSentimentPanel } from '@/components/ask/news-sentiment-panel';
import { TradingViewPanel } from '@/components/ask/tradingview-panel';
import { VolumePressurePanel } from '@/components/ask/volume-pressure-panel';
import { RelativeStrengthPanel } from '@/components/ask/relative-strength-panel';
import { AIThesisPanel } from '@/components/ask/ai-thesis-panel';
import { FearGreedGauge } from '@/components/pulse/fear-greed-gauge';
import { 
  TimeframeSelector, 
  Timeframe, 
  DEFAULT_TIMEFRAME,
  getAdjustedTimeframeRange 
} from '@/components/war-room/timeframe-selector';
import { DataSourceBadge } from '@/components/war-room/data-source-badge';
import { MarketClock } from '@/components/war-room/market-clock';
import { ConfluenceIndicator } from '@/components/war-room/confluence-indicator';

function AskPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTicker = searchParams.get('symbol');
  const watchlist = useWatchlistStore((state) => state.watchlist);

  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  
  const timeframeRange = useMemo(
    () => getAdjustedTimeframeRange(timeframe), 
    [timeframe]
  );
  
  const timeframeParams = useMemo(() => ({
    timestampGte: timeframeRange.from,
    timestampLte: timeframeRange.to,
    timeFilter: (timeframe === '5m' || timeframe === '15m' || timeframe === '30m' || timeframe === '1h') ? 'hour' : timeframe === '4h' ? 'day' : timeframe === '1d' ? 'day' : 'week',
  }), [timeframeRange, timeframe]);
  
  useEffect(() => {
    setTimeframe(DEFAULT_TIMEFRAME);
  }, [selectedTicker]);

  // Unified data hook (includes marketSession, preMarketData, relativeStrength)
  const data = useWarRoomData(selectedTicker || '', timeframeParams);
  
  // Volume pressure (separate fetch)
  const [volumePressure, setVolumePressure] = useState<number | undefined>(undefined);
  
  useEffect(() => {
    if (!selectedTicker) return;
    const fetchVolumePressure = async () => {
      try {
        const res = await fetch(`/api/market/volume-pressure?ticker=${selectedTicker}`);
        const json = await res.json();
        if (json.success && json.data?.buckets?.length > 0) {
          const recentBuckets = json.data.buckets.slice(-5);
          const avgPressure = recentBuckets.reduce((sum: number, b: any) => sum + (b.pressure || 0), 0) / recentBuckets.length;
          setVolumePressure(Math.round(avgPressure));
        }
      } catch (err) {
        console.error('[AskPage] Volume pressure error:', err);
      }
    };
    fetchVolumePressure();
    const interval = setInterval(fetchVolumePressure, 60000);
    return () => clearInterval(interval);
  }, [selectedTicker]);

  // Confidence (only during market hours)
  const confidenceResult = useMemo(() => {
    if (data.marketSession !== 'open') return null;
    if (!data.flow?.stats) return null;
    
    return calculateConfidence({
      netDeltaFlow: data.flow.stats.netDeltaAdjustedFlow || 0,
      avgDailyFlow: 2000000,
      sweepRatio: data.flow.stats.sweepRatio || 0,
      callPutRatio: data.flow.stats.callRatio || 50,
      putRatio: 100 - (data.flow.stats.callRatio || 50),
      dpBullishPct: data.darkpool?.stats?.bullishPct || 50,
      dpVolume: data.darkpool?.stats?.totalValue || 0,
      avgDpVolume: 50000000,
      priceChange: data.changePercent,
      vix: 20,
      fearGreedIndex: 50,
      volumePressure,
      flowTradeCount: data.flow.stats.tradeCount || 0,
      dataAgeSeconds: data.lastUpdate ? Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000) : 999,
    });
  }, [data, volumePressure]);

  const dataAgeSeconds = data.lastUpdate ? Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000) : 0;

  const handleSelectTicker = (ticker: string) => {
    setTimeframe(DEFAULT_TIMEFRAME);
    router.push(`/ask?symbol=${ticker}`);
  };

  if (!selectedTicker) {
    return <AskLandingView onSelectTicker={handleSelectTicker} watchlist={watchlist} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      {/* Force desktop viewport on mobile */}
      <DesktopViewport />
      
      <LiveTickerBar />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar */}
        <aside 
          className="w-[260px] flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.2)' }}
        >
          <div className="p-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <FearGreedGauge size="small" hideDetails />
          </div>

          <div className="p-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <div className="text-xs font-bold text-gray-400 uppercase mb-2">Key Levels</div>
            <div className="space-y-1">
              <LevelRow label="Call Wall" value={data.levels?.callWall || null} color={COLORS.green} currentPrice={data.price} />
              <LevelRow label="Put Wall" value={data.levels?.putWall || null} color={COLORS.red} currentPrice={data.price} />
              <LevelRow label="GEX Flip" value={data.levels?.gexFlip || null} color="#a855f7" currentPrice={data.price} />
              {data.levels?.maxPain && <LevelRow label="Max Pain" value={data.levels.maxPain} color="#ff9800" currentPrice={data.price} />}
              {data.levels?.vwap && <LevelRow label="VWAP" value={data.levels.vwap} color={COLORS.cyan} currentPrice={data.price} />}
            </div>
            <GexContext price={data.price} gexFlip={data.levels?.gexFlip || null} />
          </div>
          
          <div className="flex-1 overflow-y-auto p-3">
            <ConfluenceIndicator
              flowStats={data.flow?.stats}
              darkPoolStats={data.darkpool?.stats}
              volumePressure={volumePressure || 0}
              priceVsGexFlip={data.price > (data.levels?.gexFlip || 0) ? 'above' : 'below'}
              priceChange={data.changePercent}
            />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* TOP BAR */}
          <div className="border-b flex-shrink-0" style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.3)' }}>
            {/* Row 1: Symbol + Price + Watchlist + Search */}
            <div className="px-4 pt-2 pb-1 flex items-center gap-2">
              {/* Logo / Home */}
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors mr-1 p-1.5 rounded hover:bg-white/5"
                title="Back to TradeYodha"
              >
                <YodhaLogo size={20} />
              </button>
              
              {/* Current Symbol - BIG */}
              <div className="flex items-center gap-3 mr-3">
                <span 
                  className="text-xl font-black text-white tracking-wide"
                  style={{ fontFamily: "'Oxanium', monospace" }}
                >
                  {selectedTicker}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-white font-mono">
                    ${data.price?.toFixed(2) || '—'}
                  </span>
                  <span 
                    className="text-xs font-bold font-mono"
                    style={{ color: data.changePercent >= 0 ? '#00e676' : '#ff5252' }}
                  >
                    {data.changePercent >= 0 ? '+' : ''}{data.changePercent?.toFixed(2) || '0.00'}%
                  </span>
                </div>
              </div>
              
              {/* Separator */}
              <div className="h-5 w-px bg-white/10 mr-1" />
              
              {/* Watchlist tabs */}
              {watchlist.slice(0, 5).map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => handleSelectTicker(ticker)}
                  className="relative px-2.5 py-1 rounded text-xs font-bold transition-all"
                  style={{
                    background: ticker === selectedTicker ? 'rgba(0,229,255,0.15)' : 'transparent',
                    border: ticker === selectedTicker ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
                    color: ticker === selectedTicker ? '#00e5ff' : '#666',
                  }}
                >
                  {ticker}
                </button>
              ))}
              {watchlist.length > 5 && <span className="text-[10px] text-gray-600">+{watchlist.length - 5}</span>}
              
              {/* Symbol Search */}
              <SymbolSearch onSelect={handleSelectTicker} />
              
              <div className="flex-1" />
              
              <DataSourceBadge lastUpdate={data.lastUpdate} />
              
              <div 
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
                style={{ 
                  background: dataAgeSeconds < 30 ? 'rgba(0,230,118,0.1)' : dataAgeSeconds < 120 ? 'rgba(255,193,7,0.1)' : 'rgba(255,82,82,0.1)',
                  color: dataAgeSeconds < 30 ? '#00e676' : dataAgeSeconds < 120 ? '#ffc107' : '#ff5252',
                }}
              >
                <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: dataAgeSeconds < 30 ? '#00e676' : dataAgeSeconds < 120 ? '#ffc107' : '#ff5252' }} />
                {dataAgeSeconds < 60 ? `${dataAgeSeconds}s` : `${Math.floor(dataAgeSeconds / 60)}m`} ago
              </div>
              
              <button
                onClick={data.refresh}
                disabled={data.isLoading}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/10"
                style={{ background: 'rgba(255,255,255,0.05)' }}
              >
                <RefreshCw className={`w-3 h-3 ${data.isLoading ? 'animate-spin' : ''}`} />
                <span className="text-gray-400">Refresh (R)</span>
              </button>
            </div>
            
            {/* Row 2: Timeframe + Clock */}
            <div className="px-4 pb-2 flex items-center justify-between">
              <TimeframeSelector value={timeframe} onChange={setTimeframe} />
              <div className="flex items-center gap-4">
                <MarketClock />
                <span className="text-xs text-gray-500">{timeframeRange.label}</span>
              </div>
            </div>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-3 space-y-3">
              {/* Hero Verdict */}
              <HeroVerdict
                ticker={selectedTicker}
                price={data.price}
                change={data.change}
                changePercent={data.changePercent}
                verdict={confidenceResult ? {
                  bias: confidenceResult.bias === 'CONFLICTING' ? 'NEUTRAL' : confidenceResult.bias,
                  confidence: confidenceResult.confidence,
                  summary: confidenceResult.recommendation,
                  reliability: confidenceResult.reliability,
                } : data.verdict}
                levels={data.levels}
                flowStats={data.flow?.stats || null}
                lastUpdate={data.lastUpdate}
                dataAgeSeconds={dataAgeSeconds}
                marketSession={data.marketSession}
                preMarketData={data.preMarketData}
              />
              
              {/* Signal Conflicts (market hours only) */}
              {confidenceResult && data.marketSession === 'open' && (
                <SignalConflicts conflicts={confidenceResult.conflicts} supports={confidenceResult.supports} />
              )}

              {/* AI THESIS - Multi-line sub-theses */}
              <AIThesisPanel
                ticker={selectedTicker}
                price={data.price}
                changePercent={data.changePercent}
                flowStats={data.flow?.stats || null}
                darkPoolStats={data.darkpool?.stats || null}
                newsItems={data.news.items}
                relativeStrength={data.relativeStrength}
                levels={data.levels}
                marketSession={data.marketSession}
              />

              {/* Row 1: Chart full width */}
              <div className="h-[400px]">
                <TradingViewPanel ticker={selectedTicker} timeframe={timeframe} />
              </div>
              
              {/* Row 2: Flow + Gamma */}
              <div className="grid grid-cols-2 gap-3 h-[450px]">
                <div className="h-full overflow-hidden">
                  <OptionsFlowPanel
                    stats={data.flow?.stats || null}
                    trades={data.flow?.trades || []}
                    loading={data.flow?.loading || false}
                    error={data.flow?.error || null}
                    timeframe={timeframe}
                    timeframeRange={timeframeRange}
                    currentPrice={data.price}
                    vwap={data.levels?.vwap || null}
                  />
                </div>
                <div className="h-full overflow-hidden">
                  <GammaLevelsPanel 
                    ticker={selectedTicker}
                    gexByStrike={data.flow?.stats?.gexByStrike || []}
                    currentPrice={data.price}
                  />
                </div>
              </div>
              
              {/* Row 3: Volume + Dark Pool */}
              <div className="grid grid-cols-2 gap-3 h-[400px]">
                <div className="h-full overflow-hidden">
                  <VolumePressurePanel ticker={selectedTicker} timeframeRange={timeframeRange} />
                </div>
                <div className="h-full overflow-hidden">
                  <DarkPoolPanel
                    prints={data.darkpool?.prints || []}
                    stats={data.darkpool?.stats || null}
                    loading={data.darkpool?.loading || false}
                    error={data.darkpool?.error || null}
                    currentPrice={data.price}
                    vwap={data.levels?.vwap || null}
                    timeframeRange={timeframeRange}
                    meta={data.darkpool?.meta}
                  />
                </div>
              </div>
              
              {/* Row 4: Relative Strength + News */}
              <div className="grid grid-cols-2 gap-3 h-[400px]">
                <div className="h-full overflow-hidden">
                  <RelativeStrengthPanel ticker={selectedTicker} />
                </div>
                <div className="h-full overflow-hidden">
                  <NewsSentimentPanel
                    ticker={selectedTicker}
                    items={data.news.items}
                    loading={data.news.loading}
                  />
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function DesktopViewport() {
  useEffect(() => {
    // Force desktop-width viewport on mobile so the full layout renders zoomed out
    const viewport = document.querySelector('meta[name="viewport"]');
    const original = viewport?.getAttribute('content') || '';
    
    if (viewport && window.innerWidth < 1024) {
      viewport.setAttribute('content', 'width=1400, initial-scale=0.25, user-scalable=yes');
    }
    
    return () => {
      // Restore original viewport when leaving the page
      if (viewport) {
        viewport.setAttribute('content', original);
      }
    };
  }, []);
  
  return null;
}

function SymbolSearch({ onSelect }: { onSelect: (ticker: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus();
    }
  }, [open]);
  
  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      // Ctrl/Cmd + K to open search
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  
  const handleSubmit = () => {
    const ticker = query.trim().toUpperCase();
    if (ticker) {
      onSelect(ticker);
      setQuery('');
      setOpen(false);
    }
  };
  
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-all ml-1"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <Search className="w-3 h-3" />
        <span>Search</span>
        <kbd className="hidden sm:inline text-[9px] text-gray-600 ml-1 px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>⌘K</kbd>
      </button>
    );
  }
  
  return (
    <div className="flex items-center gap-1 ml-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-500" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleSubmit();
            if (e.key === 'Escape') setOpen(false);
          }}
          onBlur={() => { if (!query) setOpen(false); }}
          placeholder="Ticker..."
          className="w-28 pl-7 pr-2 py-1 rounded text-xs text-white bg-black/40 border border-cyan-500/30 focus:border-cyan-500 focus:outline-none placeholder-gray-600"
          style={{ fontFamily: "'Oxanium', monospace" }}
        />
      </div>
      <button
        onClick={handleSubmit}
        className="px-2 py-1 rounded text-xs font-bold transition-all hover:scale-105"
        style={{ background: 'rgba(0,229,255,0.15)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }}
      >
        Go
      </button>
    </div>
  );
}

function LevelRow({ label, value, color, currentPrice }: { label: string; value: number | null; color: string; currentPrice: number }) {
  const distancePct = value && currentPrice ? ((value - currentPrice) / currentPrice) * 100 : null;
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-xs text-gray-400 font-semibold">{label}</span>
      <div className="text-right">
        <span className="text-sm font-mono font-bold" style={{ color }}>
          {value ? `$${value.toFixed(2)}` : '—'}
        </span>
        {distancePct !== null && (
          <div className="text-[10px] font-semibold" style={{ color: distancePct >= 0 ? COLORS.green : COLORS.red }}>
            ({distancePct >= 0 ? '+' : ''}{distancePct.toFixed(1)}%)
          </div>
        )}
      </div>
    </div>
  );
}

function GexContext({ price, gexFlip }: { price: number; gexFlip: number | null }) {
  if (!gexFlip || !price) return null;
  const isAbove = price > gexFlip;
  return (
    <div className="mt-2 p-2 rounded text-xs" style={{ background: isAbove ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)' }}>
      <div className="font-bold text-xs" style={{ color: isAbove ? '#00e676' : '#ff5252' }}>
        {isAbove ? '↑ ABOVE FLIP' : '↓ BELOW FLIP'}
      </div>
      <div className="text-gray-400 mt-0.5 text-[10px]">
        {isAbove ? 'Mean reversion zone' : 'Trend amplification'}
      </div>
    </div>
  );
}

function AskLandingView({ onSelectTicker, watchlist }: { onSelectTicker: (ticker: string) => void; watchlist: string[] }) {
  const [search, setSearch] = useState('');
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
      <div className="text-center max-w-md">
        <YodhaLogo size={56} className="mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>Yodha Room</h1>
        <p className="text-gray-500 text-sm mb-6">Enter a symbol to begin analysis</p>
        <div className="mb-6">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && search && onSelectTicker(search)}
            placeholder="SPY, NVDA, AAPL..."
            className="w-full px-6 py-4 text-lg rounded-xl bg-black/30 border-2 border-cyan-500/30 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
            style={{ fontFamily: "'Oxanium', monospace" }} />
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {watchlist.map((ticker) => (
            <button key={ticker} onClick={() => onSelectTicker(ticker)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
              style={{ fontFamily: "'Oxanium', monospace" }}>
              {ticker}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function AskPage() {
  return (
    <Suspense fallback={<div className="h-screen flex items-center justify-center" style={{ background: COLORS.bg }}><div className="text-gray-400">Loading...</div></div>}>
      <AskPageContent />
    </Suspense>
  );
}
