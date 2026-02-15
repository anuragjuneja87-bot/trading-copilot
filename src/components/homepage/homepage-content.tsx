'use client';

import { 
  MarketPulseProvider, 
  LeftSidebar, 
  RightSidebar,
  useMarketPulse
} from '@/components/homepage/market-dashboard';
import { Hero } from '@/components/homepage/hero';
import { COLORS } from '@/lib/echarts-theme';
import { TrendingUp, TrendingDown } from 'lucide-react';

export function HomepageContent() {
  return (
    <MarketPulseProvider>
      <main className="flex-1 flex justify-center">
        {/* Left Sidebar */}
        <aside className="hidden xl:block sticky top-20 h-fit self-start">
          <LeftSidebar />
        </aside>
        
        {/* Center Content */}
        <div className="flex-1 max-w-3xl px-4 py-8">
          <Hero />
          <MobileMarketPulse />
        </div>
        
        {/* Right Sidebar */}
        <aside className="hidden xl:block sticky top-20 h-fit self-start">
          <RightSidebar />
        </aside>
      </main>
    </MarketPulseProvider>
  );
}

function MobileMarketPulse() {
  const { data, isLoading } = useMarketPulse();
  
  if (isLoading || !data) return null;
  
  return (
    <div className="xl:hidden mt-8 space-y-4">
      <h3 className="text-sm font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
        MARKET PULSE
      </h3>
      
      {/* Horizontal scroll for index cards */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
        {data.spy && <MobileIndexCard data={data.spy} />}
        {data.qqq && <MobileIndexCard data={data.qqq} />}
        {data.vix && <MobileVixCard vix={data.vix} />}
        <MobileFearGreedCard fearGreed={data.fearGreedIndex} />
      </div>
      
      {/* Movers row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl p-3" style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
          <div className="text-[9px] uppercase tracking-wider font-bold mb-2 flex items-center gap-1"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
            <TrendingUp className="w-3 h-3" style={{ color: COLORS.green }} />
            Gainers
          </div>
          {data.topGainers.slice(0, 3).map(m => (
            <div key={m.ticker} className="flex justify-between text-xs py-0.5">
              <span className="text-white" style={{ fontFamily: "'Oxanium', monospace" }}>{m.ticker}</span>
              <span style={{ color: COLORS.green }}>+{m.changePercent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl p-3" style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
          <div className="text-[9px] uppercase tracking-wider font-bold mb-2 flex items-center gap-1"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}>
            <TrendingDown className="w-3 h-3" style={{ color: COLORS.red }} />
            Losers
          </div>
          {data.topLosers.slice(0, 3).map(m => (
            <div key={m.ticker} className="flex justify-between text-xs py-0.5">
              <span className="text-white" style={{ fontFamily: "'Oxanium', monospace" }}>{m.ticker}</span>
              <span style={{ color: COLORS.red }}>{m.changePercent.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MobileIndexCard({ data }: { data: any }) {
  const isPositive = data.changePercent >= 0;
  return (
    <div className="flex-shrink-0 w-32 rounded-xl p-3" 
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
      <div className="text-[10px] font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
        {data.ticker}
      </div>
      <div className="text-base font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
        ${data.price.toFixed(2)}
      </div>
      <div className="text-xs" style={{ color: isPositive ? COLORS.green : COLORS.red }}>
        {isPositive ? '+' : ''}{data.changePercent.toFixed(2)}%
      </div>
    </div>
  );
}

function MobileVixCard({ vix }: { vix: any }) {
  const levelColors: Record<string, string> = {
    LOW: COLORS.green,
    NORMAL: '#4ade80',
    ELEVATED: COLORS.yellow,
    HIGH: '#f97316',
    EXTREME: COLORS.red,
  };
  
  return (
    <div className="flex-shrink-0 w-32 rounded-xl p-3" 
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
      <div className="text-[10px] font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
        VIX
      </div>
      <div className="text-base font-bold" style={{ color: levelColors[vix.level], fontFamily: "'Oxanium', monospace" }}>
        {vix.value.toFixed(1)}
      </div>
      <div className="text-xs" style={{ color: '#4a6070' }}>
        {vix.level}
      </div>
    </div>
  );
}

function MobileFearGreedCard({ fearGreed }: { fearGreed: any }) {
  const labelConfig: Record<string, { color: string; emoji: string }> = {
    EXTREME_FEAR: { color: COLORS.red, emoji: '😱' },
    FEAR: { color: '#f97316', emoji: '😰' },
    NEUTRAL: { color: COLORS.yellow, emoji: '😐' },
    GREED: { color: '#4ade80', emoji: '😊' },
    EXTREME_GREED: { color: COLORS.green, emoji: '🤑' },
  };
  
  const config = labelConfig[fearGreed.label] || labelConfig.NEUTRAL;
  
  return (
    <div className="flex-shrink-0 w-32 rounded-xl p-3" 
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}>
      <div className="text-[10px] font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
        F&G {config.emoji}
      </div>
      <div className="text-base font-bold" style={{ color: config.color, fontFamily: "'Oxanium', monospace" }}>
        {fearGreed.score}
      </div>
      <div className="text-xs" style={{ color: '#4a6070' }}>
        {fearGreed.label.replace(/_/g, ' ')}
      </div>
    </div>
  );
}
