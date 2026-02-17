'use client';

import { useState, useEffect, useMemo } from 'react';
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

export default function AskPage() {
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
    timeFilter: timeframe === '15m' ? 'hour' : timeframe === '1h' ? 'hour' : timeframe === '4h' ? 'day' : timeframe === '1d' ? 'day' : 'week',
  }), [timeframeRange, timeframe]);
  
  // Reset timeframe to default when symbol changes
  useEffect(() => {
    setTimeframe(DEFAULT_TIMEFRAME);
  }, [selectedTicker]);

  // Use the new unified data hook
  const data = useWarRoomData(selectedTicker || '', timeframeParams);
  
  // Calculate intelligent confidence
  const confidenceResult = useMemo(() => {
    if (!data.flow?.stats) return null;
    
    return calculateConfidence({
      netDeltaFlow: data.flow.stats.netDeltaAdjustedFlow || 0,
      avgDailyFlow: 2000000, // TODO: Fetch historical average
      sweepRatio: data.flow.stats.sweepRatio || 0,
      callPutRatio: data.flow.stats.callRatio || 50,
      dpBullishPct: data.darkpool?.stats?.bullishPct || 50,
      dpVolume: data.darkpool?.stats?.totalValue || 0,
      avgDpVolume: 50000000, // TODO: Fetch historical average
      priceChange: data.changePercent,
      vix: 20, // TODO: Get from market pulse
      fearGreedIndex: 50, // TODO: Get from fear greed gauge
      flowTradeCount: data.flow.stats.tradeCount || 0,
      dataAgeSeconds: data.lastUpdate 
        ? Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000)
        : 999,
    });
  }, [data]);

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
        {/* Left Sidebar - Compact */}
        <aside 
          className="w-[180px] flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.2)' }}
        >
          {/* Fear & Greed */}
          <div className="p-2 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <FearGreedGauge size="small" hideDetails />
          </div>

          {/* Watchlist */}
          <div className="flex-1 overflow-y-auto p-2">
            <div className="text-[9px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              Watchlist
            </div>
            <div className="space-y-1">
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
          <div className="p-2 border-t" style={{ borderColor: COLORS.cardBorder }}>
            <div className="text-[9px] font-bold text-gray-500 uppercase mb-2">Key Levels</div>
            <div className="space-y-0.5">
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
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* TIMEFRAME BAR - Prominent, below header */}
          <div className="border-b px-6 py-3" style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.3)' }}>
            <div className="flex items-center justify-between">
              <TimeframeSelector 
                value={timeframe} 
                onChange={setTimeframe}
              />
              
              {/* Market status indicator */}
              <div className="flex items-center gap-3">
                {timeframeRange.marketStatus === 'pre-market' && (
                  <span className="text-xs text-yellow-500 bg-yellow-500/10 px-2 py-1 rounded flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                    Pre-Market
                  </span>
                )}
                {timeframeRange.marketStatus === 'after-hours' && (
                  <span className="text-xs text-orange-500 bg-orange-500/10 px-2 py-1 rounded flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-pulse"></span>
                    After-Hours
                  </span>
                )}
                {timeframeRange.marketStatus === 'closed' && (
                  <span className="text-xs text-red-400 bg-red-500/10 px-2 py-1 rounded">
                    🔴 Closed - Showing {timeframeRange.tradingDay}
                  </span>
                )}
                {timeframeRange.marketStatus === 'open' && (
                  <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                    Market Open
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  {timeframeRange.label}
                </span>
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col overflow-hidden p-3 gap-3">
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
              reliability={confidenceResult.reliability}
            />
          )}

          {/* Main Grid: 3x2 */}
          <div className="flex-1 grid grid-cols-3 grid-rows-2 gap-3 min-h-0">
            {/* Row 1 */}
            <TradingViewPanel ticker={selectedTicker} />
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
            <GammaLevelsPanel 
              ticker={selectedTicker}
              gexByStrike={data.flow?.stats?.gexByStrike || []}
              currentPrice={data.price}
            />

            {/* Row 2 */}
            <VolumePressurePanel ticker={selectedTicker} />
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
            <NewsSentimentPanel
              ticker={selectedTicker}
              items={data.news.items}
              loading={data.news.loading}
            />
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
    <div className="flex justify-between items-center py-0.5">
      <span className="text-[10px] text-gray-400">{label}</span>
      <div className="text-right">
        <span className="text-[11px] font-mono font-semibold" style={{ color }}>
          {value ? `$${value.toFixed(0)}` : '—'}
        </span>
        {distancePct !== null && (
          <div className="text-[9px] text-gray-500">
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
      className="mt-2 p-1.5 rounded text-[9px]"
      style={{ 
        background: isAbove ? 'rgba(0,230,118,0.1)' : 'rgba(255,82,82,0.1)',
      }}
    >
      <div className="font-bold" style={{ color: isAbove ? '#00e676' : '#ff5252' }}>
        {isAbove ? '↑ ABOVE FLIP' : '↓ BELOW FLIP'}
      </div>
      <div className="text-gray-400 mt-0.5">
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
