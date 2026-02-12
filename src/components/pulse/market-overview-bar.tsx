'use client';

import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useMarketSession } from '@/hooks/use-utils';

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

export function MarketOverviewBar() {
  const marketSession = useMarketSession();

  // Fetch regime data
  const { data: regime } = useQuery<RegimeData>({
    queryKey: ['regime'],
    queryFn: async () => {
      const res = await fetch('/api/market/regime');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch key metrics
  const { data: pricesData } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['SPY', 'QQQ', 'VIX']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=SPY,QQQ,VIX');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  // TODO: Fetch Put/Call Ratio from options flow API
  const putCallRatio = 0.85; // Mock data

  const spy = pricesData?.prices?.find((p) => p.ticker === 'SPY');
  const qqq = pricesData?.prices?.find((p) => p.ticker === 'QQQ');
  const vix = pricesData?.prices?.find((p) => p.ticker === 'VIX');

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'crisis':
        return 'bg-bear';
      case 'elevated':
        return 'bg-warning';
      default:
        return 'bg-bull';
    }
  };

  const getStatusLabel = (status?: string) => {
    switch (status) {
      case 'crisis':
        return 'CRISIS';
      case 'elevated':
        return 'ELEVATED';
      default:
        return 'NORMAL';
    }
  };

  return (
    <div
      className="w-full border-b border-[rgba(255,255,255,0.06)] bg-background-surface"
      style={{ background: 'linear-gradient(180deg, #0a0f1a, #0d1321)' }}
    >
      <div className="max-w-7xl mx-auto px-4 lg:px-8 py-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          {/* SPY */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7a99] uppercase tracking-wider">SPY</span>
            <span className="font-mono text-white text-sm font-semibold">
              {spy?.price?.toFixed(2) || '—'}
            </span>
            {spy?.changePercent !== undefined && (
              <Badge
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  spy.changePercent >= 0 ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                )}
              >
                {spy.changePercent >= 0 ? '+' : ''}
                {spy.changePercent.toFixed(2)}%
              </Badge>
            )}
          </div>

          <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />

          {/* QQQ */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7a99] uppercase tracking-wider">QQQ</span>
            <span className="font-mono text-white text-sm font-semibold">
              {qqq?.price?.toFixed(2) || '—'}
            </span>
            {qqq?.changePercent !== undefined && (
              <Badge
                className={cn(
                  'text-[10px] font-medium px-2 py-0.5 rounded-full',
                  qqq.changePercent >= 0 ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                )}
              >
                {qqq.changePercent >= 0 ? '+' : ''}
                {qqq.changePercent.toFixed(2)}%
              </Badge>
            )}
          </div>

          <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />

          {/* VIX */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7a99] uppercase tracking-wider">VIX</span>
            <span className="font-mono text-white text-sm font-semibold">
              {vix?.price?.toFixed(2) || regime?.vixLevel?.toFixed(2) || '—'}
            </span>
          </div>

          <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />

          {/* Put/Call Ratio */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#6b7a99] uppercase tracking-wider">P/C Ratio</span>
            <span className="font-mono text-white text-sm font-semibold">
              {putCallRatio.toFixed(2)}
            </span>
          </div>

          <div className="h-6 w-px bg-[rgba(255,255,255,0.08)]" />

          {/* Market Regime */}
          <Badge
            className={cn(
              'text-[10px] font-bold uppercase px-3 py-1 rounded-full flex items-center gap-1.5',
              regime?.status === 'crisis' && 'bg-bear/20 text-bear border-bear/50',
              regime?.status === 'elevated' && 'bg-warning/20 text-warning border-warning/50',
              regime?.status === 'normal' && 'bg-bull/20 text-bull border-bull/50'
            )}
          >
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                regime?.status === 'crisis' && 'bg-bear',
                regime?.status === 'elevated' && 'bg-warning',
                regime?.status === 'normal' && 'bg-bull'
              )}
            />
            {getStatusLabel(regime?.status)}
          </Badge>
        </div>
      </div>
    </div>
  );
}
