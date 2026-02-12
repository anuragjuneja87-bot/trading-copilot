'use client';

import { useQuery } from '@tanstack/react-query';
import { useMarketSession } from '@/hooks/use-utils';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Price {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

interface RegimeData {
  status: 'normal' | 'elevated' | 'crisis';
  vixLevel: number;
}

export function LiveTickerBar() {
  const marketSession = useMarketSession();

  // Fetch regime data
  const { data: regime } = useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000,
  });

  // Fetch key metrics
  const { data: pricesData } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['SPY', 'VIX']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=SPY,VIX');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const getSessionLabel = (session: string) => {
    switch (session) {
      case 'pre-market':
        return 'PRE-MARKET';
      case 'market-open':
        return 'OPEN';
      case 'after-hours':
        return 'AFTER-HOURS';
      default:
        return 'CLOSED';
    }
  };

  const getRegimeLabel = (status?: string) => {
    switch (status) {
      case 'crisis':
        return 'CRISIS';
      case 'elevated':
        return 'ELEVATED';
      default:
        return 'NORMAL';
    }
  };

  const spy = pricesData?.prices?.find((p) => p.ticker === 'SPY');
  const vixPrice = pricesData?.prices?.find((p) => p.ticker === 'VIX');
  const vix = regime?.vixLevel || vixPrice?.price || 20;

  return (
    <div
      className="h-8 border-b flex items-center px-4 overflow-x-auto scrollbar-hide"
      style={{
        background: 'rgba(0,229,255,0.03)',
        borderBottom: '1px solid rgba(0,229,255,0.06)',
      }}
    >
      <div className="flex items-center gap-4 text-[11px] font-mono whitespace-nowrap" style={{ color: '#6b7a99' }}>
        {/* SPY */}
        {spy && (
          <>
            <span className="uppercase">SPY</span>
            <span className="text-white">${spy.price.toFixed(2)}</span>
            <span
              className={cn(
                'flex items-center gap-0.5',
                spy.changePercent > 0 ? 'text-[#00e676]' : 'text-[#ff5252]'
              )}
            >
              {spy.changePercent > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {Math.abs(spy.changePercent).toFixed(2)}%
            </span>
            <span className="mx-1">·</span>
          </>
        )}

        {/* VIX */}
        <span className="uppercase">VIX</span>
        <span className="text-white">{vix.toFixed(2)}</span>
        <span className="mx-1">·</span>

        {/* Market Status */}
        <span className="uppercase">Market:</span>
        <span className="text-white">{getSessionLabel(marketSession)}</span>
        <span className="mx-1">·</span>

        {/* Regime */}
        <span className="uppercase">Regime:</span>
        <span
          className={cn(
            'font-semibold',
            regime?.status === 'crisis'
              ? 'text-[#ff5252]'
              : regime?.status === 'elevated'
              ? 'text-[#ffa726]'
              : 'text-[#00e676]'
          )}
        >
          {getRegimeLabel(regime?.status)}
        </span>
      </div>
    </div>
  );
}
