'use client';

import { useEffect, useState } from 'react';
import { useWebSocketSafe } from '@/lib/websocket';
import { COLORS } from '@/lib/echarts-theme';

interface WatchlistCardProps {
  ticker: string;
  onClick?: (ticker: string) => void;
  isActive?: boolean;
}

interface PriceData {
  price: number;
  change: number;
  changePercent: number;
}

export function WatchlistCard({ ticker, onClick, isActive }: WatchlistCardProps) {
  const ws = useWebSocketSafe();
  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch REST data as fallback
  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch(`/api/market/prices?tickers=${ticker}`);
        const data = await res.json();
        
        if (data.success && data.data) {
          // Handle both formats: { data: { prices: [...] } } and { data: [...] }
          const prices = data.data.prices || data.data;
          const item = Array.isArray(prices) ? prices.find((p: any) => p.ticker === ticker) || prices[0] : prices;
          
          if (item && item.price) {
            setPriceData({
              price: item.price,
              change: item.change || 0,
              changePercent: item.changePercent || 0,
            });
          }
        }
      } catch (err) {
        console.error(`[WatchlistCard] Failed to fetch ${ticker}:`, err);
      } finally {
        setLoading(false);
      }
    };

    fetchPrice();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchPrice, 30000);
    return () => clearInterval(interval);
  }, [ticker]);

  // Prefer WebSocket data if available
  const wsQuote = ws?.getQuote(ticker);
  const displayData = wsQuote && wsQuote.price > 0 
    ? { price: wsQuote.price, change: wsQuote.change, changePercent: wsQuote.changePercent }
    : priceData;

  const isPositive = (displayData?.changePercent ?? 0) >= 0;

  return (
    <button
      onClick={() => onClick?.(ticker)}
      className="w-full px-2 py-1.5 rounded-lg transition-all text-left hover:bg-white/5"
      style={{
        background: isActive ? 'rgba(0,229,255,0.1)' : 'transparent',
        border: isActive ? '1px solid rgba(0,229,255,0.3)' : '1px solid transparent',
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <span 
            className="w-1.5 h-1.5 rounded-full flex-shrink-0"
            style={{ background: isPositive ? COLORS.green : COLORS.red }}
          />
          <span className="text-xs font-bold text-white">{ticker}</span>
        </div>
        <span 
          className="text-[10px] font-semibold"
          style={{ color: isPositive ? COLORS.green : COLORS.red }}
        >
          {loading ? '...' : displayData 
            ? `${isPositive ? '+' : ''}${displayData.changePercent.toFixed(1)}%` 
            : '—'
          }
        </span>
      </div>
      
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-[10px] text-gray-500 font-mono">
          {loading ? '...' : displayData ? `$${displayData.price.toFixed(2)}` : '—'}
        </span>
        <span 
          className="text-[10px] font-mono"
          style={{ color: isPositive ? COLORS.green : COLORS.red }}
        >
          {displayData ? `${isPositive ? '+' : ''}${displayData.change.toFixed(2)}` : ''}
        </span>
      </div>
    </button>
  );
}
