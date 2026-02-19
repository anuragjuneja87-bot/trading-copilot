'use client';

import { useEffect, useRef, memo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { Timeframe } from '@/components/war-room/timeframe-selector';

interface TradingViewPanelProps {
  ticker: string;
  timeframe?: Timeframe;
}

function getInterval(timeframe: string): string {
  const map: Record<string, string> = {
    '5m': '5',
    '15m': '15',
    '30m': '30',
    '1h': '60',
    '4h': '240',
    '1d': 'D',
    '1w': 'W',
  };
  return map[timeframe] || '15';
}

// Map tickers to correct TradingView exchange prefix
function getTVSymbol(ticker: string): string {
  if (ticker.includes(':')) return ticker;
  
  // ETFs on AMEX/NYSE ARCA
  const amexTickers = new Set([
    'SPY', 'QQQ', 'IWM', 'DIA', 'GLD', 'SLV', 'TLT', 'XLF', 'XLE', 'XLK',
    'XLV', 'XLI', 'XLP', 'XLY', 'XLU', 'XLB', 'XLRE', 'XLC',
    'VTI', 'VOO', 'VXX', 'UVXY', 'SQQQ', 'TQQQ', 'ARKK', 'HYG', 'EEM',
    'KWEB', 'FXI', 'IBIT', 'GBTC', 'MSTR',
  ]);
  
  // NYSE-listed stocks
  const nyseTickers = new Set([
    'BRK.A', 'BRK.B', 'JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'UNH',
    'HD', 'BAC', 'KO', 'PFE', 'DIS', 'MRK', 'VZ', 'CVX', 'XOM',
    'ABBV', 'ABT', 'ACN', 'CRM', 'NKE', 'LLY', 'MCD', 'PM',
    'GM', 'F', 'T', 'GS', 'MS', 'C', 'WFC', 'USB',
    'BA', 'CAT', 'MMM', 'GE', 'HON', 'LMT', 'RTX', 'UPS',
    'SQ', 'SNAP', 'UBER', 'LYFT', 'PLTR', 'HOOD',
  ]);
  
  const upper = ticker.toUpperCase();
  
  if (amexTickers.has(upper)) return `AMEX:${upper}`;
  if (nyseTickers.has(upper)) return `NYSE:${upper}`;
  
  // Default to NASDAQ for tech/most common tickers
  return `NASDAQ:${upper}`;
}

function TradingViewPanelComponent({ ticker, timeframe = '15m' }: TradingViewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    containerRef.current.innerHTML = '';
    
    const interval = getInterval(timeframe);
    const tvSymbol = getTVSymbol(ticker);
    
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: tvSymbol,
      interval: interval,
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      hide_top_toolbar: true,
      hide_legend: false,
      save_image: false,
      hide_volume: false,
      allow_symbol_change: false,
      withdateranges: true,
      hide_side_toolbar: true,
      details: false,
      calendar: false,
      support_host: 'https://www.tradingview.com',
      backgroundColor: 'rgba(0, 0, 0, 0)',
      gridColor: 'rgba(255, 255, 255, 0.05)',
    });
    
    containerRef.current.appendChild(script);
    
    return () => {
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [ticker, timeframe]);

  return (
    <div 
      className="rounded-xl overflow-hidden h-[400px]"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      <div className="flex items-center justify-between p-2 border-b" style={{ borderColor: COLORS.cardBorder }}>
        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
          Chart
        </h3>
        <span className="text-[10px] text-gray-500">TradingView</span>
      </div>
      <div 
        ref={containerRef} 
        className="tradingview-widget-container"
        style={{ height: '364px', pointerEvents: 'auto' }}
      />
    </div>
  );
}

export const TradingViewPanel = memo(TradingViewPanelComponent);
