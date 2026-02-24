'use client';

import { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useWatchlistStore } from '@/stores';
import { useWarRoomData } from '@/hooks/use-war-room-data';
import { useMLPrediction } from '@/hooks/use-ml-prediction';
import { COLORS } from '@/lib/echarts-theme';
import { RefreshCw, Search, ChevronDown, ChevronRight, Sparkles, Building2, BarChart3, Activity, Newspaper, Target, Layers } from 'lucide-react';
import { YodhaLogo, YodhaWordmark } from '@/components/brand/yodha-logo';

// Components
import { LiveTickerBar } from '@/components/layout/live-ticker-bar';
import { ConfluenceIndicator } from '@/components/war-room/confluence-indicator';
import { YodhaAnalysis, AskYodhaChat } from '@/components/ask/yodha-analysis';
import { YodhaChart } from '@/components/ask/yodha-chart';
import { OptionsFlowPanel } from '@/components/ask/options-flow-panel';
import { DarkPoolPanel } from '@/components/ask/dark-pool-panel';
import { GammaLevelsPanel } from '@/components/ask/gamma-levels-panel';
import { NewsSentimentPanel } from '@/components/ask/news-sentiment-panel';
import { VolumePressurePanel } from '@/components/ask/volume-pressure-panel';
import { RelativeStrengthPanel } from '@/components/ask/relative-strength-panel';
import { FearGreedGauge } from '@/components/pulse/fear-greed-gauge';
import {
  TimeframeSelector,
  Timeframe,
  DEFAULT_TIMEFRAME,
  getAdjustedTimeframeRange
} from '@/components/war-room/timeframe-selector';
import { DataSourceBadge } from '@/components/war-room/data-source-badge';
import { MarketClock } from '@/components/war-room/market-clock';

/* ──────────────────────────────────────────────────────────
   COLLAPSIBLE DATA PANEL WRAPPER
   ────────────────────────────────────────────────────────── */

function CollapsiblePanel({
  title,
  subtitle,
  subtitleColor,
  icon: Icon,
  defaultOpen = true,
  forceOpen,
  children,
  height = '400px',
}: {
  title: string;
  subtitle?: string | null;
  subtitleColor?: string;
  icon?: any;
  defaultOpen?: boolean;
  forceOpen?: boolean;
  children: React.ReactNode;
  height?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const dotColor = subtitleColor || '#555';

  // Sync with external forceOpen when it changes
  useEffect(() => {
    if (forceOpen !== undefined) setIsOpen(forceOpen);
  }, [forceOpen]);

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex-1 min-w-0 text-left">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: subtitle ? dotColor : '#666' }} />}
            <span className="text-xs font-bold text-gray-200 uppercase tracking-wider">{title}</span>
            {subtitle && (
              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor, boxShadow: `0 0 4px ${dotColor}50` }} />
            )}
          </div>
          {subtitle && (
            <p className="text-[11px] mt-1 truncate leading-tight pl-[22px]" style={{ color: `${dotColor}cc` }}>{subtitle}</p>
          )}
        </div>
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-gray-500 flex-shrink-0" />
          : <ChevronRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        }
      </button>
      {isOpen && (
        <div style={{ height }} className="overflow-hidden">
          {children}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   PANEL HEADER SUMMARIES (rule-based, zero API cost)
   ────────────────────────────────────────────────────────── */

interface PanelSummary {
  text: string | null;
  color: string;
}

function buildFlowSummary(flow: any, session: string): PanelSummary {
  if (!flow?.tradeCount) {
    return { text: session !== 'open' ? 'Market closed · No live data' : null, color: '#555' };
  }
  // callRatio and putRatio are already 0-100 from the API
  const callPct = flow.callRatio != null ? flow.callRatio.toFixed(0) : '—';
  const sweeps = flow.sweepRatio ? (flow.sweepRatio * 100).toFixed(0) : '0';
  const unusual = flow.unusualCount || 0;
  const netDelta = flow.netDeltaAdjustedFlow;
  const netStr = netDelta ? `${netDelta > 0 ? '+' : ''}$${(netDelta / 1e6).toFixed(1)}M delta` : '';

  const bias = (flow.callRatio || 50) >= 60 ? 'bullish' : (flow.putRatio || 50) >= 60 ? 'bearish' : 'mixed';
  const color = bias === 'bullish' ? COLORS.green : bias === 'bearish' ? COLORS.red : '#ffc107';

  const parts = [`${callPct}% calls`];
  if (parseInt(sweeps) > 5) parts.push(`${sweeps}% sweeps`);
  if (unusual > 0) parts.push(`${unusual} unusual`);
  if (netStr) parts.push(netStr);
  if (session !== 'open') parts.unshift('Last session');

  return { text: parts.join(' · '), color };
}

function buildDarkPoolSummary(dp: any, session: string): PanelSummary {
  if (!dp?.printCount) {
    return { text: session !== 'open' ? 'Market closed · No live data' : null, color: '#555' };
  }
  const bullPct = dp.bullishPct ?? 50;
  const bearPct = 100 - bullPct;
  const prints = dp.printCount;
  const val = dp.totalValue
    ? dp.totalValue >= 1e6 ? `$${(dp.totalValue / 1e6).toFixed(1)}M` : `$${(dp.totalValue / 1e3).toFixed(0)}K`
    : '';

  const bias = bullPct > 55 ? 'bullish' : bullPct < 45 ? 'bearish' : 'neutral';
  const color = bias === 'bullish' ? COLORS.green : bias === 'bearish' ? COLORS.red : '#ffc107';

  const parts: string[] = [];
  if (session !== 'open') parts.push('Last session');
  parts.push(`${prints} prints`);
  // Show the dominant direction's percentage
  if (bias === 'bearish') {
    parts.push(`${bearPct.toFixed(0)}% bearish`);
  } else {
    parts.push(`${bullPct.toFixed(0)}% bullish`);
  }
  if (val) parts.push(val);

  return { text: parts.join(' · '), color };
}

function buildGammaSummary(levels: any, price: number): PanelSummary {
  if (!levels?.callWall && !levels?.gexFlip) {
    return { text: null, color: '#555' };
  }
  const parts: string[] = [];

  if (levels.gexFlip && price) {
    const above = price > levels.gexFlip;
    parts.push(`${above ? 'Above' : 'Below'} GEX flip ($${levels.gexFlip.toFixed(0)})`);
  }
  if (levels.callWall && price) {
    const dist = ((levels.callWall - price) / price * 100).toFixed(1);
    parts.push(`Call wall ${dist}% away`);
  }
  if (levels.vwap && price) {
    parts.push(`${price > levels.vwap ? 'Above' : 'Below'} VWAP`);
  }

  const aboveFlip = levels.gexFlip && price > levels.gexFlip;
  const color = aboveFlip ? COLORS.green : aboveFlip === false ? COLORS.red : '#ffc107';

  return { text: parts.join(' · '), color };
}

function buildVolumeSummary(vp: number | undefined, session?: string): PanelSummary {
  if (vp === undefined) return { text: null, color: '#555' };

  const prefix = session !== 'open' ? 'Last session · ' : '';
  // vp ranges from roughly -100 to +100 (buy-sell pressure delta)
  if (vp > 20) {
    return { text: `${prefix}+${vp}% buy pressure`, color: COLORS.green };
  } else if (vp < -20) {
    return { text: `${prefix}${vp}% sell pressure`, color: COLORS.red };
  } else {
    return { text: `${prefix}Balanced (${vp > 0 ? '+' : ''}${vp}%)`, color: '#ffc107' };
  }
}

function buildRSSummary(rs: any, ticker: string): PanelSummary {
  if (!rs) return { text: null, color: '#555' };

  const { rsVsSpy, regime, tickerChange, spyChange } = rs;
  const bias = regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM' ? 'bullish'
    : regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM' ? 'bearish'
    : 'neutral';
  const color = bias === 'bullish' ? COLORS.green : bias === 'bearish' ? COLORS.red : '#ffc107';

  return {
    text: `${ticker} ${tickerChange >= 0 ? '+' : ''}${tickerChange.toFixed(2)}% vs SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}% · RS ${rsVsSpy >= 0 ? '+' : ''}${rsVsSpy.toFixed(2)}`,
    color,
  };
}

function buildNewsSummary(news: any[], ticker: string): PanelSummary {
  if (!news || news.length === 0) return { text: null, color: '#555' };

  const tickerSpecific = news.filter((n: any) =>
    (n.title || n.headline || '').toLowerCase().includes(ticker.toLowerCase()) ||
    (n.tickers && Array.isArray(n.tickers) && n.tickers.includes(ticker.toUpperCase()))
  ).length;

  const positiveWords = ['surge', 'rally', 'gain', 'beat', 'upgrade', 'bull', 'growth', 'record', 'soar', 'jump'];
  const negativeWords = ['drop', 'fall', 'crash', 'miss', 'downgrade', 'bear', 'cut', 'decline', 'plunge', 'weak'];
  let pos = 0, neg = 0;
  news.forEach((item: any) => {
    const title = (item.title || item.headline || '').toLowerCase();
    positiveWords.forEach(w => { if (title.includes(w)) pos++; });
    negativeWords.forEach(w => { if (title.includes(w)) neg++; });
  });

  const bias = pos > neg + 1 ? 'bullish' : neg > pos + 1 ? 'bearish' : 'neutral';
  const color = bias === 'bullish' ? COLORS.green : bias === 'bearish' ? COLORS.red : '#ffc107';

  const parts = [`${news.length} headlines`];
  if (tickerSpecific > 0) parts.push(`${tickerSpecific} ${ticker}-specific`);
  parts.push(bias === 'bullish' ? 'Positive lean' : bias === 'bearish' ? 'Negative lean' : 'Mixed sentiment');

  return { text: parts.join(' · '), color };
}

/* ──────────────────────────────────────────────────────────
   MAIN WAR ROOM
   ────────────────────────────────────────────────────────── */

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

  // Unified data hook
  const data = useWarRoomData(selectedTicker || '', timeframeParams);

  // ML prediction (lifted)
  const mlResult = useMLPrediction(selectedTicker || '', data);

  // Volume pressure
  const [volumePressure, setVolumePressure] = useState<number | undefined>(undefined);
  const [allPanelsOpen, setAllPanelsOpen] = useState<boolean | undefined>(undefined);

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

  const dataAgeSeconds = data.lastUpdate ? Math.floor((Date.now() - data.lastUpdate.getTime()) / 1000) : 0;

  // Panel header summaries (rule-based, zero API cost)
  const ps = useMemo(() => ({
    flow: buildFlowSummary(data.flow?.stats, data.marketSession),
    darkPool: buildDarkPoolSummary(data.darkpool?.stats, data.marketSession),
    gamma: buildGammaSummary(data.levels, data.price),
    volume: buildVolumeSummary(volumePressure, data.marketSession),
    rs: buildRSSummary(data.relativeStrength, selectedTicker || ''),
    news: buildNewsSummary(data.news.items, selectedTicker || ''),
  }), [data.flow?.stats, data.darkpool?.stats, data.levels, data.price, data.marketSession, volumePressure, data.relativeStrength, data.news.items, selectedTicker]);

  const handleSelectTicker = (ticker: string) => {
    setTimeframe(DEFAULT_TIMEFRAME);
    router.push(`/ask?symbol=${ticker}`);
  };

  if (!selectedTicker) {
    return <AskLandingView onSelectTicker={handleSelectTicker} watchlist={watchlist} />;
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden" style={{ background: COLORS.bg }}>
      <DesktopViewport />
      <LiveTickerBar />

      <div className="flex-1 flex overflow-hidden">
        {/* ── LEFT SIDEBAR ───────────────────────────────── */}
        <aside
          className="w-[240px] flex-shrink-0 flex flex-col border-r overflow-hidden"
          style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.2)' }}
        >
          <div className="p-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <FearGreedGauge size="small" hideDetails />
          </div>

          <div className="p-3 border-b" style={{ borderColor: COLORS.cardBorder }}>
            <div className="text-[10px] font-bold text-gray-200 uppercase tracking-wider mb-2">Key Levels</div>
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

        {/* ── MAIN CONTENT ───────────────────────────────── */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {/* TOP BAR */}
          <div className="border-b flex-shrink-0" style={{ borderColor: COLORS.cardBorder, background: 'rgba(0,0,0,0.3)' }}>
            <div className="px-4 pt-2 pb-1 flex items-center gap-2">
              <button
                onClick={() => router.push('/')}
                className="flex items-center gap-1.5 text-gray-500 hover:text-white transition-colors mr-1 p-1.5 rounded hover:bg-white/5"
                title="Back to TradeYodha"
              >
                <YodhaLogo size={20} />
              </button>

              <div className="flex items-center gap-3 mr-3">
                <span className="text-xl font-black text-white tracking-wide" style={{ fontFamily: "'Oxanium', monospace" }}>
                  {selectedTicker}
                </span>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-sm font-bold text-white font-mono">${data.price?.toFixed(2) || '—'}</span>
                  <span className="text-xs font-bold font-mono" style={{ color: data.changePercent >= 0 ? '#00e676' : '#ff5252' }}>
                    {data.changePercent >= 0 ? '+' : ''}{data.changePercent?.toFixed(2) || '0.00'}%
                  </span>
                </div>
              </div>

              <div className="h-5 w-px bg-white/10 mr-1" />

              {watchlist.slice(0, 5).map((ticker) => (
                <button
                  key={ticker}
                  onClick={() => handleSelectTicker(ticker)}
                  className="relative px-3 py-1 rounded text-sm font-bold transition-all"
                  style={{
                    background: ticker === selectedTicker ? 'rgba(0,229,255,0.15)' : 'transparent',
                    border: ticker === selectedTicker ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
                    color: ticker === selectedTicker ? '#00e5ff' : 'rgba(255,255,255,0.6)',
                  }}
                  onMouseEnter={(e) => {
                    if (ticker !== selectedTicker) e.currentTarget.style.color = '#fff';
                  }}
                  onMouseLeave={(e) => {
                    if (ticker !== selectedTicker) e.currentTarget.style.color = 'rgba(255,255,255,0.6)';
                  }}
                >
                  {ticker}
                </button>
              ))}
              {watchlist.length > 5 && <span className="text-xs text-gray-400 font-bold">+{watchlist.length - 5}</span>}

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
                <span className="text-gray-300">Refresh (R)</span>
              </button>
            </div>

            <div className="px-4 pb-2 flex items-center justify-between">
              <TimeframeSelector value={timeframe} onChange={setTimeframe} />
              <div className="flex items-center gap-4">
                <MarketClock />
                <span className="text-xs text-gray-300">{timeframeRange.label}</span>
              </div>
            </div>
          </div>

          {/* ── SCROLLABLE CONTENT ───────────────────────── */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-3 space-y-3 max-w-[1200px] mx-auto">

              {/* ★ YODHA ANALYSIS — THE CENTERPIECE ★ */}
              <YodhaAnalysis
                ticker={selectedTicker}
                price={data.price}
                changePercent={data.changePercent}
                flowStats={data.flow?.stats || null}
                darkPoolStats={data.darkpool?.stats || null}
                newsItems={data.news.items}
                relativeStrength={data.relativeStrength}
                levels={data.levels}
                marketSession={data.marketSession}
                volumePressure={volumePressure}
                mlPrediction={mlResult.prediction}
                mlLoading={mlResult.isLoading}
                mlError={mlResult.error}
                mlMeta={mlResult.meta}
                mlRefresh={mlResult.refresh}
                confidenceHistory={mlResult.confidenceHistory}
              />

              {/* ★ ASK YODHA — CHAT INPUT ★ */}
              <AskYodhaChat
                ticker={selectedTicker}
                price={data.price}
                levels={data.levels}
                marketSession={data.marketSession}
                changePercent={data.changePercent}
                flowStats={data.flow?.stats || null}
                darkPoolStats={data.darkpool?.stats || null}
                newsItems={data.news.items}
                relativeStrength={data.relativeStrength}
                mlPrediction={mlResult.prediction}
                volumePressure={volumePressure}
              />

              {/* ★ YODHA CHART — TV Lightweight Charts ★ */}
              <div className="h-[580px] rounded overflow-hidden" style={{ border: '1px solid rgba(42,46,57,0.5)' }}>
                <YodhaChart
                  ticker={selectedTicker}
                  timeframe={timeframe}
                  levels={data.levels}
                  price={data.price}
                  changePercent={data.changePercent}
                  marketSession={data.marketSession}
                />
              </div>

              {/* DETAILED DATA PANELS (collapsible) */}
              <div className="flex items-center justify-end mb-1">
                <button
                  onClick={() => setAllPanelsOpen(prev => prev === true ? false : true)}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] transition-all hover:bg-white/5"
                  style={{ color: allPanelsOpen ? COLORS.cyan : 'rgba(255,255,255,0.5)', border: `1px solid ${allPanelsOpen ? COLORS.cyan + '30' : 'rgba(255,255,255,0.08)'}` }}
                >
                  <Layers className="w-3 h-3" />
                  {allPanelsOpen ? 'Collapse All' : 'Expand All'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <CollapsiblePanel title="Options Flow" height="420px" icon={Sparkles} subtitle={ps.flow.text} subtitleColor={ps.flow.color} forceOpen={allPanelsOpen}>
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
                </CollapsiblePanel>
                <CollapsiblePanel title="Gamma & Key Levels" height="420px" icon={Target} subtitle={ps.gamma.text} subtitleColor={ps.gamma.color} forceOpen={allPanelsOpen}>
                  <GammaLevelsPanel
                    ticker={selectedTicker}
                    gexByStrike={data.flow?.stats?.gexByStrike || []}
                    currentPrice={data.price}
                  />
                </CollapsiblePanel>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CollapsiblePanel title="Volume Pressure" height="380px" icon={BarChart3} subtitle={ps.volume.text} subtitleColor={ps.volume.color} forceOpen={allPanelsOpen}>
                  <VolumePressurePanel ticker={selectedTicker} timeframeRange={timeframeRange} />
                </CollapsiblePanel>
                <CollapsiblePanel title="Dark Pool Activity" height="380px" icon={Building2} subtitle={ps.darkPool.text} subtitleColor={ps.darkPool.color} forceOpen={allPanelsOpen}>
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
                </CollapsiblePanel>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <CollapsiblePanel title="Relative Strength" height="380px" icon={Activity} subtitle={ps.rs.text} subtitleColor={ps.rs.color} forceOpen={allPanelsOpen}>
                  <RelativeStrengthPanel ticker={selectedTicker} timeframeRange={timeframeRange} />
                </CollapsiblePanel>
                <CollapsiblePanel title="News Sentiment" height="380px" icon={Newspaper} subtitle={ps.news.text} subtitleColor={ps.news.color} forceOpen={allPanelsOpen}>
                  <NewsSentimentPanel
                    ticker={selectedTicker}
                    items={data.news.items}
                    loading={data.news.loading}
                  />
                </CollapsiblePanel>
              </div>

              <div className="h-4" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────
   HELPER COMPONENTS
   ────────────────────────────────────────────────────────── */

function DesktopViewport() {
  useEffect(() => {
    const viewport = document.querySelector('meta[name="viewport"]');
    const original = viewport?.getAttribute('content') || '';
    if (viewport && window.innerWidth < 1024) {
      viewport.setAttribute('content', 'width=1400, initial-scale=0.25, user-scalable=yes');
    }
    return () => { if (viewport) viewport.setAttribute('content', original); };
  }, []);
  return null;
}

function SymbolSearch({ onSelect }: { onSelect: (ticker: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSubmit = () => {
    const ticker = query.trim().toUpperCase();
    if (ticker) { onSelect(ticker); setQuery(''); setOpen(false); }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-white/5 transition-all ml-1"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}>
        <Search className="w-3 h-3" /><span>Search</span>
        <kbd className="hidden sm:inline text-[9px] text-gray-500 ml-1 px-1 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)' }}>⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1 ml-1">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
        <input ref={inputRef} type="text" value={query}
          onChange={(e) => setQuery(e.target.value.toUpperCase())}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') setOpen(false); }}
          onBlur={() => { if (!query) setOpen(false); }}
          placeholder="Ticker..."
          className="w-28 pl-7 pr-2 py-1 rounded text-xs text-white bg-black/40 border border-cyan-500/30 focus:border-cyan-500 focus:outline-none placeholder-gray-600"
          style={{ fontFamily: "'Oxanium', monospace" }} />
      </div>
      <button onClick={handleSubmit}
        className="px-2 py-1 rounded text-xs font-bold transition-all hover:scale-105"
        style={{ background: 'rgba(0,229,255,0.15)', color: '#00e5ff', border: '1px solid rgba(0,229,255,0.3)' }}>
        Go
      </button>
    </div>
  );
}

function LevelRow({ label, value, color, currentPrice }: { label: string; value: number | null; color: string; currentPrice: number }) {
  const distancePct = value && currentPrice ? ((value - currentPrice) / currentPrice) * 100 : null;
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[10px] text-white font-semibold">{label}</span>
      <div className="text-right">
        <span className="text-xs font-mono font-bold" style={{ color }}>
          {value ? `$${value.toFixed(2)}` : '—'}
        </span>
        {distancePct !== null && (
          <div className="text-[9px] font-semibold" style={{ color: distancePct >= 0 ? COLORS.green : COLORS.red }}>
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
      <div className="text-gray-200 mt-0.5 text-[10px]">
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
        <h1 className="text-3xl font-bold text-white mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>War Room</h1>
        <p className="text-gray-300 text-sm mb-6">Enter a symbol to begin analysis</p>
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
    <Suspense fallback={
      <div className="h-screen flex items-center justify-center" style={{ background: COLORS.bg }}>
        <div className="text-gray-300">Loading...</div>
      </div>
    }>
      <AskPageContent />
    </Suspense>
  );
}
