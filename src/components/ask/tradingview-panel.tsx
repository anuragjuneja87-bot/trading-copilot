'use client';

import { useEffect, useRef, memo } from 'react';
import { COLORS } from '@/lib/echarts-theme';

interface TradingViewPanelProps {
  ticker: string;
}

function TradingViewPanelComponent({ ticker }: TradingViewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    
    // Clear previous widget
    containerRef.current.innerHTML = '';
    
    // Create TradingView widget
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: `NASDAQ:${ticker}`,
      interval: '5',
      timezone: 'America/New_York',
      theme: 'dark',
      style: '1', // Candlestick
      locale: 'en',
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      hide_volume: false,
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
  }, [ticker]);

  return (
    <div 
      className="rounded-xl overflow-hidden h-full"
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
        style={{ height: 'calc(100% - 36px)' }}
      />
    </div>
  );
}

export const TradingViewPanel = memo(TradingViewPanelComponent);
