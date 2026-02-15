'use client';

import { useEffect, useState } from 'react';
import { useRealtimePrices } from '@/hooks/use-realtime-price';
import { useWebSocketSafe } from '@/lib/websocket';
import { COLORS } from '@/lib/echarts-theme';
import { Wifi, WifiOff, AlertCircle, Loader2 } from 'lucide-react';

const TICKER_LIST = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA', 'AMD', 'META', 'MSFT'];

export function LiveTickerBar() {
  const ws = useWebSocketSafe();
  const prices = useRealtimePrices(TICKER_LIST);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div 
      className="w-full overflow-hidden py-1.5"
      style={{ 
        background: 'rgba(0,0,0,0.3)',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
      }}
    >
      <div className="flex items-center">
        {/* Connection Status */}
        <div className="flex-shrink-0 px-3 flex items-center gap-1.5">
          {(() => {
            const isLive = ws?.isConnected && ws?.isAuthenticated;
            const isConnecting = ws?.isConnected && !ws?.isAuthenticated;
            const hasError = ws?.error;

            if (isLive) {
              return (
                <>
                  <Wifi className="w-3 h-3" style={{ color: COLORS.green }} />
                  <span className="text-[9px] font-semibold" style={{ color: COLORS.green }}>LIVE</span>
                </>
              );
            } else if (hasError) {
              return (
                <>
                  <AlertCircle className="w-3 h-3" style={{ color: COLORS.red }} />
                  <span className="text-[9px] font-semibold" style={{ color: COLORS.red }}>ERROR</span>
                </>
              );
            } else if (isConnecting) {
              return (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" style={{ color: COLORS.yellow }} />
                  <span className="text-[9px] font-semibold" style={{ color: COLORS.yellow }}>CONNECTING</span>
                </>
              );
            } else {
              return (
                <>
                  <WifiOff className="w-3 h-3" style={{ color: '#4a6070' }} />
                  <span className="text-[9px] font-semibold" style={{ color: '#4a6070' }}>OFFLINE</span>
                </>
              );
            }
          })()}
        </div>

        {/* Scrolling Ticker Tape */}
        <div className="flex-1 overflow-hidden relative">
          <div className="animate-ticker flex gap-6">
            {/* Duplicate for seamless loop */}
            {[...TICKER_LIST, ...TICKER_LIST].map((ticker, i) => {
              const data = prices.get(ticker);
              const isPositive = (data?.changePercent || 0) >= 0;
              
              return (
                <div 
                  key={`${ticker}-${i}`}
                  className="flex items-center gap-2 flex-shrink-0"
                >
                  <span 
                    className="text-[10px] font-bold text-white"
                    style={{ fontFamily: "'Oxanium', monospace" }}
                  >
                    {ticker}
                  </span>
                  <span 
                    className="text-[10px] font-semibold"
                    style={{ color: '#c5d0e6', fontFamily: "'Oxanium', monospace" }}
                  >
                    {data?.price ? `$${data.price.toFixed(2)}` : '—'}
                  </span>
                  <span 
                    className="text-[9px] font-semibold"
                    style={{ 
                      color: isPositive ? COLORS.green : COLORS.red,
                      fontFamily: "'Oxanium', monospace"
                    }}
                  >
                    {data?.changePercent != null 
                      ? `${isPositive ? '+' : ''}${data.changePercent.toFixed(2)}%`
                      : '—'
                    }
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
