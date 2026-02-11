'use client';

import { useQuery } from '@tanstack/react-query';
import { useMarketSession } from '@/hooks/use-utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { 
  Activity, 
  TrendingUp, 
  TrendingDown,
  Clock
} from 'lucide-react';

interface RegimeData {
  status: 'normal' | 'elevated' | 'crisis';
  vixLevel: number;
  crisisCount: number;
  elevatedCount: number;
  reason?: string;
}

interface Price {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

export function RegimeBar() {
  const marketSession = useMarketSession();
  
  // Fetch regime data
  const { data: regime, isLoading: regimeLoading } = useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 60000, // Refresh every 60 seconds
  });

  // Fetch key metrics
  const { data: pricesData, isLoading: pricesLoading } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['SPY', 'QQQ', 'VIXY']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=SPY,QQQ,VIXY');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'crisis': return 'bg-bear';
      case 'elevated': return 'bg-warning';
      default: return 'bg-bull';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'crisis': return 'CRISIS';
      case 'elevated': return 'ELEVATED';
      default: return 'NORMAL';
    }
  };

  const getSessionLabel = (session: string) => {
    switch (session) {
      case 'pre-market': return 'PRE-MARKET';
      case 'market-open': return 'MARKET OPEN';
      case 'after-hours': return 'AFTER-HOURS';
      default: return 'CLOSED';
    }
  };

  // Get current ET time
  const etTime = new Date().toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const spy = pricesData?.prices?.find(p => p.ticker === 'SPY');
  const qqq = pricesData?.prices?.find(p => p.ticker === 'QQQ');
  const vixy = pricesData?.prices?.find(p => p.ticker === 'VIXY');
  const vix = regime?.vixLevel || vixy?.price || 20;

  return (
    <div className="h-12 border-b border-border bg-background-surface flex items-center justify-between px-4 lg:px-6">
      {/* Left: Status */}
      <div className="flex items-center gap-3">
        {regimeLoading ? (
          <div className="h-3 w-3 rounded-full bg-background-elevated animate-pulse" />
        ) : (
          <div className={cn('h-3 w-3 rounded-full', getStatusColor(regime?.status))} />
        )}
        {regimeLoading ? (
          <div className="h-5 w-20 bg-background-elevated animate-pulse rounded" />
        ) : (
          <Badge variant={regime?.status === 'crisis' ? 'crisis' : regime?.status === 'elevated' ? 'elevated' : 'normal'}>
            {getStatusLabel(regime?.status)}
          </Badge>
        )}
      </div>

      {/* Center: Key Metrics */}
      <div className="hidden md:flex items-center gap-6">
        {pricesLoading ? (
          <>
            <div className="h-4 w-16 bg-background-elevated animate-pulse rounded" />
            <div className="h-4 w-16 bg-background-elevated animate-pulse rounded" />
            <div className="h-4 w-16 bg-background-elevated animate-pulse rounded" />
            <div className="h-4 w-16 bg-background-elevated animate-pulse rounded" />
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">VIX:</span>
              <span className="font-mono font-semibold text-text-primary">{vix.toFixed(2)}</span>
            </div>
            {spy && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-muted">SPY:</span>
                <span className="font-mono font-semibold text-text-primary">${spy.price.toFixed(2)}</span>
                {spy.changePercent !== 0 && (
                  <span className={cn('text-xs flex items-center', spy.changePercent > 0 ? 'text-bull' : 'text-bear')}>
                    {spy.changePercent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(spy.changePercent).toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            {qqq && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-text-muted">QQQ:</span>
                <span className="font-mono font-semibold text-text-primary">${qqq.price.toFixed(2)}</span>
                {qqq.changePercent !== 0 && (
                  <span className={cn('text-xs flex items-center', qqq.changePercent > 0 ? 'text-bull' : 'text-bear')}>
                    {qqq.changePercent > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(qqq.changePercent).toFixed(2)}%
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-muted">10Y:</span>
              <span className="font-mono font-semibold text-text-primary">—</span>
            </div>
          </>
        )}
      </div>

      {/* Right: Session + Clock */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm">
          <Clock className="h-4 w-4 text-text-muted" />
          <span className="text-text-muted">{getSessionLabel(marketSession)}</span>
          <span className="font-mono text-text-primary">{etTime} ET</span>
        </div>
      </div>
    </div>
  );
}
