'use client';

import { useState, useEffect, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWatchlistStore } from '@/stores';
import { useWarRoomData } from '@/hooks/use-war-room-data';
import { calculateConfidence } from '@/lib/confidence-calculator';
import { COLORS } from '@/lib/echarts-theme';
import { ArrowLeft, RefreshCw, Clock } from 'lucide-react';

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
import { WatchlistCard } from '@/components/watchlist/watchlist-card';
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

  // Global timeframe state - RESETS when symbol changes
  const [timeframe, setTimeframe] = useState<Timeframe>(DEFAULT_TIMEFRAME);
  
  // Calculate timeframe range for API calls
  const timeframeRange = useMemo(
    () => getAdjustedTimeframeRange(timeframe), 
    [timeframe]
  );
  
  // Convert timeframe range to params format for hook
  const timeframeParams = useMemo(() => ({
    timestampGte: timeframeRange.from,
    timestampLte: timeframeRange.to,
    timeFilter: (timeframe === '5m' || timeframe === '15m' || timeframe === '30m' || timeframe === '1h') ? 'hour' : timeframe === '4h' ? 'day' : timeframe === '1d' ? 'day' : 'week',
  }), [timeframeRange, timeframe]);
  
  // Reset timeframe to default when symbol changes
  useEffect(() => {
    setTimeframe(DEFAULT_TIMEFRAME);
  }, [selectedTicker]);

  // Use the new unified data hook
  const data = useWarRoomData(selectedTicker || '', timeframeParams);
  
  // Fetch volume pressure data
  const [volumePressure, setVolumePressure] = useState<number | undefined>(undefined);
  
  useEffect(() => {
    if (!selectedTicker) return;
    
    const fetchVolumePressure = async () => {
      try {
        const res = await fetch(`/api/market/volume-pressure?ticker=${selectedTicker}`);
        const json = await res.json();
        if (json.success && json.data?.buckets?.length > 0) {
          // Calculate average pressure from recent buckets
          const recentBuckets = json.data.buckets.slice(-5); // Last 5 buckets
          const avgPressure = recentBuckets.reduce((sum: number, b: any) => sum + (b.pressure || 0), 0) / recentBuckets.length;
          setVolumePressure(Math.round(avgPressure));
        }
      } catch (err) {
        console.error('[AskPage] Failed to fetch volume pressure:', err);
      }
    };
    
    fetchVolumePressure();
    const interval = setInterval(fetchVolumePressure, 60000); // Update every minute
    return () => clearInterval(interval);
  }, [selectedTicker]);

  // Calculate intelligent confidence
  const confidenceResult = useMemo(() => {
    if (!data.flow?.stats) return null;
    
    const putRatio = 100 - (data.flow.stats.callRatio || 50);
    
    return calculateConfidence({
      netDeltaFlow: data.flow.stats.netDeltaAdjustedFlow || 0,
      avgDailyFlow: 2000000, // TODO: Fetch historical average
      sweepRatio: data.flow.stats.sweepRatio || 0,
      callPutRatio: data.flow.stats.callRatio || 50,
      putRatio,
      dpBullishPct: data.darkpool?.stats?.bullishPct || 50,
      dpVolume: data.darkpool?.stats?.totalValue || 0,
      avgDpVolume: 50000000, // TODO: Fetch historical average
      priceChange: data.changePercent,
      vix: 20, // TODO: Get from market pulse
      fearGreedIndex: 50, // TODO: Get from fear greed gauge
      volumePressure,
      flowTradeCount: data.flow.stats.tradeCount || 0,
      dataAgeSeconds: data.lastUpdate 
        ? Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000)
        : 999,
    });
  }, [data, volumePressure]);

  // Calculate data age
  const dataAgeSeconds = data.lastUpdate 
    ? Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000)
    : 0;

  const handleSelectTicker = (ticker: string) => {
    setTimeframe(DEFAULT_TIMEFRAME); // Reset to 15M when switching symbols
    router.push(`/ask?symbol=${ticker}`);
  };

  // Format last update time
  const formatLastUpdate = () => {
    if (!data.lastUpdate) return '';
    const seconds = Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    return `${Math.floor(seconds / 60)}m ago`;
  };

  if (!selectedTicker) {
    return <AskLandingView onSelectTicker={handleSelectTicker} watchlist={watchlist} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      {/* Ticker Tape */}
      <LiveTickerBar />
      
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Expanded for Readability */}
        <aside 
          className="w-[280px] flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.2)' }}
        >
          {/* Fear & Greed */}
          <div className="p-4 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <FearGreedGauge size="small" hideDetails />
          </div>

          {/* Watchlist */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              Watchlist
            </div>
            <div className="space-y-2">
              {watchlist.slice(0, 10).map((ticker) => (
                <WatchlistCard
                  key={ticker}
                  ticker={ticker}
                  onClick={handleSelectTicker}
                  isActive={ticker === selectedTicker}
                />
              ))}
            </div>
          </div>

          {/* Key Levels */}
          <div className="p-4 border-t" style={{ borderColor: COLORS.cardBorder }}>
            <div className="text-xs font-bold text-gray-400 uppercase mb-3">Key Levels</div>
            <div className="space-y-1.5">
              <LevelRow label="Call Wall" value={data.levels?.callWall || null} color={COLORS.green} currentPrice={data.price} />
              <LevelRow label="Put Wall" value={data.levels?.putWall || null} color={COLORS.red} currentPrice={data.price} />
              <LevelRow label="GEX Flip" value={data.levels?.gexFlip || null} color="#a855f7" currentPrice={data.price} />
              {data.levels?.maxPain && (
                <LevelRow label="Max Pain" value={data.levels.maxPain} color="#ff9800" currentPrice={data.price} />
              )}
              {data.levels?.vwap && (
                <LevelRow label="VWAP" value={data.levels.vwap} color={COLORS.cyan} currentPrice={data.price} />
              )}
            </div>
            
            {/* GEX Context */}
            <GexContext price={data.price} gexFlip={data.levels?.gexFlip || null} />
          </div>
          
          {/* Confluence Indicator */}
          <div className="p-4 border-t" style={{ borderColor: COLORS.cardBorder }}>
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
          {/* TIMEFRAME BAR - Fixed at top */}
          <div className="border-b px-6 py-3 flex-shrink-0" style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.3)' }}>
            <div className="flex items-center justify-between">
              <TimeframeSelector 
                value={timeframe} 
                onChange={setTimeframe}
              />
              
              {/* Live Market Clock */}
              <div className="flex items-center gap-4">
                <MarketClock />
                <span className="text-xs text-gray-500">
                  {timeframeRange.label}
                </span>
              </div>
            </div>
          </div>

          {/* Scrollable Content Area - Everything scrolls from here */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-3 space-y-3">
              {/* Header Row */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => router.push('/ask')}
                    className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors text-xs"
                  >
                    <ArrowLeft className="w-3 h-3" />
                    Back
                  </button>
                  <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                    {selectedTicker}
                  </h1>
                </div>
                
                <div className="flex items-center gap-3">
                  {/* Keyboard Shortcut Hints */}
                  <div className="flex items-center gap-2 text-[9px] text-gray-600">
                    <span>R: Refresh</span>
                    <span>|</span>
                    <span>1-5: Switch Symbol</span>
                  </div>
                  
                  {/* Data Freshness Indicator */}
                  <DataSourceBadge lastUpdate={data.lastUpdate} />
                  
                  <div 
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px]"
                    style={{ 
                      background: dataAgeSeconds < 30 ? 'rgba(0,230,118,0.1)' : 
                                  dataAgeSeconds < 120 ? 'rgba(255,193,7,0.1)' : 'rgba(255,82,82,0.1)',
                      color: dataAgeSeconds < 30 ? '#00e676' : 
                             dataAgeSeconds < 120 ? '#ffc107' : '#ff5252',
                    }}
                  >
                    <div 
                      className="w-1.5 h-1.5 rounded-full animate-pulse"
                      style={{ 
                        background: dataAgeSeconds < 30 ? '#00e676' : 
                                   dataAgeSeconds < 120 ? '#ffc107' : '#ff5252' 
                      }}
                    />
                    {dataAgeSeconds < 60 ? `${dataAgeSeconds}s` : `${Math.floor(dataAgeSeconds / 60)}m`} ago
                  </div>
                  
                  {/* Refresh */}
                  <button
                    onClick={data.refresh}
                    disabled={data.isLoading}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs hover:bg-white/10"
                    style={{ background: 'rgba(255,255,255,0.05)' }}
                  >
                    <RefreshCw className={`w-3 h-3 ${data.isLoading ? 'animate-spin' : ''}`} />
                    Refresh (R)
                  </button>
                </div>
              </div>

              {/* HERO: Intelligent Verdict Banner */}
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
              />
              
              {/* Signal Conflicts */}
              {confidenceResult && (
                <SignalConflicts 
                  conflicts={confidenceResult.conflicts}
                  supports={confidenceResult.supports}
                />
              )}

              {/* Row 1: Chart takes full width - FIXED height */}
              <div className="h-[400px]">
                <TradingViewPanel ticker={selectedTicker} timeframe={timeframe} />
              </div>
              
              {/* Row 2: Flow + Gamma side by side - FIXED height */}
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
              
              {/* Row 3: Volume + Dark Pool side by side - FIXED height */}
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
              
              {/* Row 4: News full width - FIXED height */}
              <div className="h-[400px]">
                <NewsSentimentPanel
                  ticker={selectedTicker}
                  items={data.news.items}
                  loading={data.news.loading}
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function LevelRow({ 
  label, 
  value, 
  color,
  currentPrice,
}: { 
  label: string; 
  value: number | null; 
  color: string;
  currentPrice: number;
}) {
  const distance = value && currentPrice ? value - currentPrice : null;
  const distancePct = value && currentPrice ? ((value - currentPrice) / currentPrice) * 100 : null;
  
  return (
    <div className="flex justify-between items-center py-1.5">
      <span className="text-xs text-gray-400 font-semibold">{label}</span>
      <div className="text-right">
        <span className="text-sm font-mono font-bold" style={{ color }}>
          {value ? `$${value.toFixed(2)}` : '—'}
        </span>
        {distancePct !== null && (
          <div className="text-xs font-semibold mt-0.5" style={{ color: distancePct >= 0 ? COLORS.green : COLORS.red }}>
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
    <div 
      className="mt-3 p-2.5 rounded text-xs"
      style={{ 
        background: isAbove ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)',
      }}
    >
      <div className="font-bold text-sm" style={{ color: isAbove ? '#00e676' : '#ff5252' }}>
        {isAbove ? '↑ ABOVE FLIP' : '↓ BELOW FLIP'}
      </div>
      <div className="text-gray-400 mt-1 text-xs">
        {isAbove 
          ? 'Mean reversion zone'
          : 'Trend amplification'
        }
      </div>
    </div>
  );
}

function AskLandingView({ 
  onSelectTicker, 
  watchlist 
}: { 
  onSelectTicker: (ticker: string) => void;
  watchlist: string[];
}) {
  const [search, setSearch] = useState('');
  
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
      <div className="text-center max-w-md">
        <h1 className="text-3xl font-bold text-white mb-2" style={{ fontFamily: "'Oxanium', monospace" }}>
          War Room
        </h1>
        <p className="text-gray-400 mb-6">Enter a symbol to analyze</p>
        
        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && search && onSelectTicker(search)}
            placeholder="SPY, NVDA, AAPL..."
            className="w-full px-6 py-4 text-lg rounded-xl bg-black/30 border-2 border-cyan-500/30 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
          />
        </div>
        
        <div className="flex flex-wrap justify-center gap-2">
          {watchlist.map((ticker) => (
            <button
              key={ticker}
              onClick={() => onSelectTicker(ticker)}
              className="px-4 py-2 rounded-lg text-sm font-semibold bg-white/5 border border-white/10 text-white hover:bg-white/10 transition-all"
            >
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
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <div className="text-gray-400">Loading...</div>
      </div>
    }>
      <AskPageContent />
    </Suspense>
  );
}
