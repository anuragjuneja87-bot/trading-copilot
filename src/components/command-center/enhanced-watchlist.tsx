'use client';

import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Settings, Eye } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

interface WatchlistItem {
  id: string;
  ticker: string;
  price?: number;
  changePercent?: number;
}

// Mock sparkline data - TODO: Replace with real price history API
function generateSparklineData(): number[] {
  const data = [];
  for (let i = 0; i < 20; i++) {
    data.push(Math.random() * 10 + 90); // Mock data between 90-100
  }
  return data;
}

// Mock sentiment - TODO: Replace with real flow data
function getSentiment(ticker: string): 'bullish' | 'bearish' | 'neutral' {
  const rand = Math.random();
  if (rand > 0.6) return 'bullish';
  if (rand < 0.3) return 'bearish';
  return 'neutral';
}

// Mock volume ratio - TODO: Replace with real volume data
function getVolumeRatio(): number {
  return Math.random() * 2; // 0-2x average
}

function Sparkline({ data }: { data: number[] }) {
  const width = 40;
  const height = 20;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data
    .map((value, index) => {
      const x = (index / (data.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} className="overflow-visible">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-accent"
      />
    </svg>
  );
}

interface EnhancedWatchlistProps {
  onTickerClick?: (ticker: string) => void;
}

export function EnhancedWatchlist({ onTickerClick }: EnhancedWatchlistProps) {
  const { data, isLoading, error } = useQuery<WatchlistItem[]>({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const response = await res.json();
      if (!response.success) {
        throw new Error(response.error || 'Failed to fetch watchlist');
      }
      const watchlist = response.data?.watchlist || [];
      return Array.isArray(watchlist) ? watchlist : [];
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const watchlistItems = Array.isArray(data) ? data : [];

  if (error || watchlistItems.length === 0) {
    return (
      <div className="text-center py-8">
        <Eye className="h-12 w-12 text-text-muted mx-auto mb-4 opacity-50" />
        <p className="text-text-primary font-medium mb-2">Your watchlist is empty</p>
        <p className="text-sm text-text-muted mb-4">Add tickers to track their performance</p>
        <Link href="/app/settings">
          <Button variant="outline" size="sm">
            Add Ticker
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {watchlistItems.map((item: WatchlistItem) => {
        const sentiment = getSentiment(item.ticker);
        const volumeRatio = getVolumeRatio();
        const sparklineData = generateSparklineData();

        return (
          <button
            key={item.id}
            onClick={() => onTickerClick?.(item.ticker)}
            className="w-full p-3 rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] hover:border-[rgba(0,229,255,0.3)] hover:bg-[rgba(255,255,255,0.04)] transition-all text-left"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-text-primary">{item.ticker}</span>
                  {/* Sentiment Dot */}
                  <div
                    className={cn(
                      'h-2 w-2 rounded-full',
                      sentiment === 'bullish' && 'bg-bull',
                      sentiment === 'bearish' && 'bg-bear',
                      sentiment === 'neutral' && 'bg-warning'
                    )}
                  />
                </div>
                {item.price !== null && item.price !== undefined && (
                  <div className="text-sm text-text-secondary">
                    ${item.price.toFixed(2)}
                    {item.changePercent !== null && item.changePercent !== undefined && (
                      <span
                        className={cn(
                          'ml-2',
                          item.changePercent >= 0 ? 'text-bull' : 'text-bear'
                        )}
                      >
                        {item.changePercent >= 0 ? '+' : ''}
                        {item.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </div>
                )}
                {/* Volume Bar */}
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="flex-1 h-1 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        volumeRatio > 1.5
                          ? 'bg-bull'
                          : volumeRatio > 0.8
                          ? 'bg-warning'
                          : 'bg-bear'
                      )}
                      style={{ width: `${Math.min(100, (volumeRatio / 2) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-[#6b7a99]">
                    {volumeRatio.toFixed(1)}x
                  </span>
                </div>
              </div>
              {/* Sparkline */}
              <div className="flex-shrink-0">
                <Sparkline data={sparklineData} />
              </div>
            </div>
          </button>
        );
      })}
      <Link href="/app/settings">
        <Button variant="outline" size="sm" className="w-full mt-2">
          <Settings className="h-4 w-4 mr-2" />
          Edit Watchlist
        </Button>
      </Link>
    </div>
  );
}
