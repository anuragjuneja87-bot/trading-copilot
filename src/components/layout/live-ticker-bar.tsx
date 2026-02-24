'use client';

import { useEffect, useState } from 'react';
import { useWebSocketSafe } from '@/lib/websocket';
import { useWatchlistStore } from '@/stores';
import { COLORS } from '@/lib/echarts-theme';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface TickerData {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

export function LiveTickerBar() {
  const ws = useWebSocketSafe();
  const watchlist = useWatchlistStore((state) => state.watchlist);
  const [tickerData, setTickerData] = useState<Map<string, TickerData>>(new Map());
  const [isMarketOpen, setIsMarketOpen] = useState(true);

  // Check if market is open
  useEffect(() => {
    const checkMarketHours = () => {
      const now = new Date();
      const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
      const day = et.getDay();
      const hour = et.getHours();
      const minute = et.getMinutes();
      const currentTime = hour * 60 + minute;
      
      // Market hours: Mon-Fri, 9:30 AM - 4:00 PM ET
      const marketOpen = 9 * 60 + 30; // 9:30 AM
      const marketClose = 16 * 60; // 4:00 PM
      
      const isWeekday = day >= 1 && day <= 5;
      const isDuringHours = currentTime >= marketOpen && currentTime < marketClose;
      
      setIsMarketOpen(isWeekday && isDuringHours);
    };

    checkMarketHours();
    const interval = setInterval(checkMarketHours, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fetch REST API data as fallback (for weekends/after hours)
  useEffect(() => {
    const fetchFallbackPrices = async () => {
      if (watchlist.length === 0) return;
      
      try {
        const res = await fetch(`/api/market/prices?tickers=${watchlist.join(',')}`);
        const data = await res.json();
        
        if (data.success && data.data) {
          const newMap = new Map<string, TickerData>();
          data.data.forEach((item: any) => {
            newMap.set(item.ticker, {
              ticker: item.ticker,
              price: item.price,
              change: item.change,
              changePercent: item.changePercent,
            });
          });
          setTickerData(newMap);
        }
      } catch (err) {
        console.error('[TickerBar] Failed to fetch fallback prices:', err);
      }
    };

    // Always fetch on mount for initial data
    fetchFallbackPrices();
    
    // If market closed, poll every 5 minutes for any updates
    if (!isMarketOpen) {
      const interval = setInterval(fetchFallbackPrices, 300000);
      return () => clearInterval(interval);
    }
  }, [watchlist, isMarketOpen]);

  // Merge WebSocket data with REST fallback
  const getTickerData = (ticker: string): TickerData | null => {
    const restData = tickerData.get(ticker) || null;
    
    // Prefer WebSocket data if available, fresh, AND market is open
    const wsQuote = ws?.getQuote(ticker);
    if (wsQuote && wsQuote.price > 0) {
      // When market is closed, WS may report 0% change — use REST change instead
      const useRestChange = !isMarketOpen && restData && Math.abs(restData.changePercent) > 0.001 && Math.abs(wsQuote.changePercent) < 0.001;
      return {
        ticker: wsQuote.ticker,
        price: wsQuote.price,
        change: useRestChange ? restData!.change : wsQuote.change,
        changePercent: useRestChange ? restData!.changePercent : wsQuote.changePercent,
      };
    }
    
    // Fall back to REST data
    return restData;
  };

  // Double the tickers for seamless loop
  const displayTickers = watchlist.length > 0 ? [...watchlist, ...watchlist] : ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'MSFT'];

  return (
    <div 
      className="w-full overflow-hidden py-2"
      style={{ 
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div className="flex items-center">
        {/* Live/Delayed Badge */}
        <div 
          className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1 mx-2 rounded text-[10px] font-bold"
          style={{ 
            background: isMarketOpen && ws?.isAuthenticated 
              ? 'rgba(0,230,118,0.15)' 
              : 'rgba(255,193,7,0.15)',
            color: isMarketOpen && ws?.isAuthenticated ? COLORS.green : '#ffc107',
          }}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isMarketOpen && ws?.isAuthenticated ? 'animate-pulse' : ''}`}
            style={{ background: isMarketOpen && ws?.isAuthenticated ? COLORS.green : '#ffc107' }}
          />
          {isMarketOpen && ws?.isAuthenticated ? 'LIVE' : 'CLOSED'}
        </div>

        {/* Scrolling Tickers */}
        <div className="flex-1 overflow-hidden">
          <div 
            className="flex gap-8 animate-ticker whitespace-nowrap"
            style={{ 
              animation: 'ticker 30s linear infinite',
            }}
          >
            {displayTickers.map((ticker, idx) => {
              const data = getTickerData(ticker);
              
              return (
                <div 
                  key={`${ticker}-${idx}`}
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  <span className="text-xs font-bold text-white">{ticker}</span>
                  <span className="text-xs text-white font-mono">
                    {data ? `$${data.price.toFixed(2)}` : '—'}
                  </span>
                  {data && (
                    <span 
                      className="flex items-center text-[10px] font-semibold"
                      style={{ color: data.changePercent >= 0 ? COLORS.green : COLORS.red }}
                    >
                      {data.changePercent >= 0 ? (
                        <TrendingUp className="w-3 h-3 mr-0.5" />
                      ) : (
                        <TrendingDown className="w-3 h-3 mr-0.5" />
                      )}
                      {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
