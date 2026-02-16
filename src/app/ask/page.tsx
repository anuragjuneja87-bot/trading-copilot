'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWatchlistStore } from '@/stores';
import { COLORS } from '@/lib/echarts-theme';
import { 
  ArrowLeft, 
  RefreshCw, 
  Zap, 
  BarChart3, 
  Target,
  Send,
} from 'lucide-react';

// Import sub-components
import { LiveTickerBar } from '@/components/layout/live-ticker-bar';
import { FearGreedGauge } from '@/components/pulse/fear-greed-gauge';
import { WatchlistCard } from '@/components/watchlist/watchlist-card';
import { KeyLevelsSidebar } from '@/components/ask/key-levels-sidebar';
import { OptionsFlowPanel } from '@/components/ask/options-flow-panel';
import { GammaLevelsPanel } from '@/components/ask/gamma-levels-panel';
import { DarkPoolPanel } from '@/components/ask/dark-pool-panel';
import { NewsSentimentPanel } from '@/components/ask/news-sentiment-panel';
import { AIThesisPanel } from '@/components/ask/ai-thesis-panel';
import { LatestSignals } from '@/components/ask/latest-signals';

export default function AskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTicker = searchParams.get('symbol');
  
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const [queryMode, setQueryMode] = useState<'quick' | 'analysis' | 'thesis'>('quick');
  const [query, setQuery] = useState('');
  const [vix, setVix] = useState<number | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch VIX and market data
  useEffect(() => {
    const fetchMarketData = async () => {
      try {
        // First try market-pulse
        const res = await fetch('/api/market-pulse');
        const data = await res.json();
        
        if (data.success && data.data) {
          // Try various paths where VIX might be
          const vixValue = 
            data.data.vix?.value ||
            data.data.vix?.price ||
            data.data.vix?.close ||
            (typeof data.data.vix === 'number' ? data.data.vix : null);
          
          if (vixValue && typeof vixValue === 'number') {
            setVix(vixValue);
            return;
          }
        }
        
        // Fallback: Use a VIX proxy ETF (UVXY or VXX)
        // These correlate with VIX and are available as stocks
        const proxyRes = await fetch('/api/market/prices?tickers=UVXY');
        const proxyData = await proxyRes.json();
        
        if (proxyData.success && proxyData.data?.[0]?.price) {
          // UVXY is roughly 1.5x VIX, so estimate VIX
          // This is an approximation for display purposes
          const uvxyPrice = proxyData.data[0].price;
          // VIX typically ranges 12-80, UVXY typically 10-100
          // Use a simple heuristic based on UVXY level
          const estimatedVix = uvxyPrice < 20 ? 15 : uvxyPrice < 40 ? 20 : uvxyPrice < 60 ? 30 : 40;
          setVix(estimatedVix);
          return;
        }
        
        // Last fallback: set a reasonable default based on market conditions
        // Check if market is down significantly
        const spyRes = await fetch('/api/market/prices?tickers=SPY');
        const spyData = await spyRes.json();
        
        if (spyData.success && spyData.data?.[0]) {
          const spyChange = spyData.data[0].changePercent || 0;
          // Higher VIX when market is down
          if (spyChange < -2) setVix(28);
          else if (spyChange < -1) setVix(22);
          else if (spyChange < 0) setVix(18);
          else setVix(15);
        } else {
          setVix(18); // Default neutral VIX
        }
        
      } catch (err) {
        console.error('Failed to fetch market data:', err);
        setVix(18); // Default on error
      }
    };
    
    fetchMarketData();
    
    // Refresh every 2 minutes
    const interval = setInterval(fetchMarketData, 120000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectTicker = (ticker: string) => {
    router.push(`/ask?symbol=${ticker}`);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    // Trigger refresh for all panels
    window.dispatchEvent(new CustomEvent('refresh-ask-data'));
    setTimeout(() => setIsRefreshing(false), 1000);
  };

  const handleSubmitQuery = () => {
    if (!query.trim()) return;
    // Handle query submission
    console.log('Query:', query, 'Mode:', queryMode, 'Ticker:', selectedTicker);
  };

  const getRegimeColor = () => {
    if (vix === null) return COLORS.cyan; // Show cyan while loading
    if (vix < 15) return COLORS.green;
    if (vix < 20) return COLORS.cyan;
    if (vix < 25) return COLORS.yellow;
    return COLORS.red;
  };

  const getRegimeLabel = () => {
    if (vix === null) return 'NORMAL'; // Default to normal instead of "LOADING"
    if (vix < 15) return 'LOW VOL';
    if (vix < 20) return 'NORMAL';
    if (vix < 25) return 'ELEVATED';
    return 'HIGH VOL';
  };

  // If no symbol selected, show landing view
  if (!selectedTicker) {
    return <AskLandingView onSelectTicker={handleSelectTicker} watchlist={watchlist} vix={vix} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      {/* Ticker Tape */}
      <LiveTickerBar />
      
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Fixed 200px */}
        <aside 
          className="w-[200px] flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.2)' }}
        >
          {/* Market Sentiment Gauge - Compact */}
          <div className="p-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
              Market Sentiment
            </h3>
            <div className="flex justify-center">
              <FearGreedGauge size="small" />
            </div>
          </div>

          {/* Watchlist - Scrollable */}
          <div className="flex-1 overflow-y-auto border-b" style={{ borderColor: COLORS.cardBorder }}>
            <div className="p-3">
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                Watchlist
              </h3>
              <div className="space-y-1.5">
                {watchlist.slice(0, 8).map((ticker) => (
                  <WatchlistCard
                    key={ticker}
                    ticker={ticker}
                    onClick={handleSelectTicker}
                    isActive={ticker === selectedTicker}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Key Levels - Fixed at bottom */}
          <div className="p-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <KeyLevelsSidebar ticker={selectedTicker} />
          </div>

          {/* Latest Signals - Fixed at bottom */}
          <div className="p-3 max-h-[150px] overflow-y-auto">
            <LatestSignals ticker={selectedTicker} />
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* Header Row */}
          <header 
            className="h-[50px] flex items-center justify-between px-4 border-b flex-shrink-0"
            style={{ borderColor: COLORS.cardBorder }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => router.push('/ask')}
                className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-xs">Symbols</span>
              </button>
              <h1 className="text-xl font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                {selectedTicker}
              </h1>
            </div>

            <div className="flex items-center gap-3">
              {/* Regime Badge */}
              <div 
                className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                style={{ background: `${getRegimeColor()}20`, border: `1px solid ${getRegimeColor()}40` }}
              >
                <span 
                  className="w-2 h-2 rounded-full"
                  style={{ background: getRegimeColor() }}
                />
                <span className="text-xs font-bold" style={{ color: getRegimeColor() }}>
                  {getRegimeLabel()}
                </span>
                <span className="text-xs text-gray-400">
                  VIX {vix?.toFixed(1) || '—'}
                </span>
              </div>

              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                style={{ 
                  background: 'rgba(255,255,255,0.05)', 
                  border: '1px solid rgba(255,255,255,0.1)' 
                }}
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh All
              </button>
            </div>
          </header>

          {/* Content Grid */}
          <div className="flex-1 p-4 overflow-hidden">
            <div className="h-full grid grid-rows-[80px_1fr_1fr] gap-3">
              
              {/* Row 1: AI Thesis */}
              <AIThesisPanel ticker={selectedTicker} />

              {/* Row 2: Options Flow + Gamma Levels */}
              <div className="grid grid-cols-2 gap-3 min-h-0">
                <OptionsFlowPanel ticker={selectedTicker} />
                <GammaLevelsPanel ticker={selectedTicker} />
              </div>

              {/* Row 3: Dark Pool + News */}
              <div className="grid grid-cols-2 gap-3 min-h-0">
                <DarkPoolPanel ticker={selectedTicker} />
                <NewsSentimentPanel ticker={selectedTicker} />
              </div>
            </div>
          </div>

          {/* Query Bar - Fixed at bottom */}
          <footer 
            className="h-[60px] flex items-center gap-3 px-4 border-t flex-shrink-0"
            style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.3)' }}
          >
            {/* Mode Selector */}
            <div className="flex rounded-lg overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)' }}>
              {[
                { key: 'quick', label: 'Quick Look', icon: Zap, time: '1-3s' },
                { key: 'analysis', label: 'Analysis', icon: BarChart3, time: '10-15s' },
                { key: 'thesis', label: 'Full Thesis', icon: Target, time: '30-60s' },
              ].map(({ key, label, icon: Icon, time }) => (
                <button
                  key={key}
                  onClick={() => setQueryMode(key as any)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-all"
                  style={{
                    background: queryMode === key ? 'rgba(0,229,255,0.15)' : 'transparent',
                    color: queryMode === key ? COLORS.cyan : '#888',
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                  <span className="text-[10px] opacity-60">({time})</span>
                </button>
              ))}
            </div>

            {/* Input */}
            <div className="flex-1 relative">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmitQuery()}
                placeholder={`Ask about ${selectedTicker} prices, levels, or trading analysis...`}
                className="w-full pl-4 pr-12 py-2.5 rounded-lg text-sm bg-black/30 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
              />
              <button
                onClick={handleSubmitQuery}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md transition-all"
                style={{ background: 'rgba(0,229,255,0.2)' }}
              >
                <Send className="w-4 h-4" style={{ color: COLORS.cyan }} />
              </button>
            </div>
          </footer>
        </main>
      </div>
    </div>
  );
}

// Landing view when no symbol is selected
function AskLandingView({ 
  onSelectTicker, 
  watchlist, 
  vix 
}: { 
  onSelectTicker: (ticker: string) => void;
  watchlist: string[];
  vix: number | null;
}) {
  const [searchValue, setSearchValue] = useState('');

  const handleSearch = () => {
    if (searchValue.trim()) {
      onSelectTicker(searchValue.trim().toUpperCase());
    }
  };

  const getTimeOfDay = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'morning';
    if (hour < 17) return 'afternoon';
    return 'evening';
  };

  return (
    <div 
      className="min-h-[calc(100vh-40px)] flex items-center justify-center"
      style={{ background: COLORS.bg }}
    >
      <div className="text-center max-w-lg">
        <h1 
          className="text-3xl font-bold text-white mb-2"
          style={{ fontFamily: "'Oxanium', monospace" }}
        >
          Good {getTimeOfDay()}, Trader
        </h1>
        <p className="text-gray-400 mb-6">
          Enter a symbol to open the War Room
        </p>

        {/* Regime Badge */}
        <div className="flex justify-center mb-6">
          <div 
            className="flex items-center gap-2 px-4 py-2 rounded-full"
            style={{ 
              background: 'rgba(0,230,118,0.1)', 
              border: '1px solid rgba(0,230,118,0.2)' 
            }}
          >
            <span className="w-2 h-2 rounded-full bg-green-400" />
            <span className="text-sm text-green-400 font-semibold">NORMAL REGIME</span>
            <span className="text-sm text-gray-400">VIX {vix?.toFixed(1) || '—'}</span>
          </div>
        </div>

        {/* Search Input */}
        <div className="mb-6">
          <div 
            className="flex items-center rounded-xl overflow-hidden"
            style={{ 
              background: 'rgba(0,0,0,0.3)', 
              border: '2px solid rgba(0,229,255,0.3)' 
            }}
          >
            <input
              type="text"
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="SPY, NVDA, AAPL..."
              className="flex-1 px-6 py-4 text-lg bg-transparent text-white placeholder-gray-500 focus:outline-none"
            />
            <button
              onClick={handleSearch}
              className="px-6 py-4 transition-all"
              style={{ background: 'rgba(0,229,255,0.1)' }}
            >
              <Send className="w-5 h-5" style={{ color: COLORS.cyan }} />
            </button>
          </div>
        </div>

        {/* Watchlist Quick Select */}
        <div>
          <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Your Watchlist</p>
          <div className="flex flex-wrap justify-center gap-2">
            {watchlist.map((ticker) => (
              <button
                key={ticker}
                onClick={() => onSelectTicker(ticker)}
                className="px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#fff',
                }}
              >
                {ticker}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
