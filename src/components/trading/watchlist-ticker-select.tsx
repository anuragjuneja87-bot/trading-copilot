'use client';

import { useQuery } from '@tanstack/react-query';
import { Select } from '@/components/ui/select';
import { Loader2, Eye, X, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface WatchlistTickerSelectProps {
  value: string[];
  onChange: (tickers: string[]) => void;
  placeholder?: string;
  multiple?: boolean;
  className?: string;
}

export function WatchlistTickerSelect({
  value,
  onChange,
  placeholder = 'Select tickers',
  multiple = true,
  className,
}: WatchlistTickerSelectProps) {
  const { data: watchlistData, isLoading } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
  });

  const watchlist = watchlistData?.watchlist || [];

  if (isLoading) {
    return (
      <div className={cn('flex items-center gap-2 px-3 py-2 border border-border rounded-md bg-background-surface', className)}>
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
        <span className="text-sm text-text-muted">Loading watchlist...</span>
      </div>
    );
  }

  if (watchlist.length === 0) {
    return (
      <div className={cn('flex flex-col items-center gap-3 px-4 py-4 border border-[rgba(255,255,255,0.06)] rounded-lg bg-[rgba(255,255,255,0.02)]', className)}>
        <div className="text-center">
          <p className="text-sm text-text-primary mb-1">Add your tickers to filter flow</p>
          <p className="text-xs text-text-muted">Get personalized alerts and insights</p>
        </div>
        <Link href="/app/settings">
          <Button
            className="bg-[#00e5ff] text-[#0a0f1a] hover:bg-[#00b8d4] font-semibold"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Add Tickers
          </Button>
        </Link>
      </div>
    );
  }

  if (multiple) {
    return (
      <div className={cn('space-y-2', className)}>
        <Select
          value=""
          onChange={(e) => {
            const selected = e.target.value;
            if (selected && !value.includes(selected)) {
              onChange([...value, selected]);
            }
            e.target.value = ''; // Reset select
          }}
          className="w-full"
        >
          <option value="" disabled>{placeholder}</option>
          {watchlist.map((item: any) => (
            <option
              key={item.ticker}
              value={item.ticker}
              disabled={value.includes(item.ticker)}
            >
              {item.ticker} {item.price !== null ? `($${item.price.toFixed(2)})` : ''}
            </option>
          ))}
        </Select>
        {value.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {value.map((ticker) => {
              const item = watchlist.find((w: any) => w.ticker === ticker);
              return (
                <div
                  key={ticker}
                  className="flex items-center gap-1 px-2 py-1 rounded-md bg-accent/10 border border-accent/20 text-sm"
                >
                  <span>{ticker}</span>
                  {item?.price !== null && (
                    <span className="text-xs text-text-muted">
                      ${item.price.toFixed(2)}
                    </span>
                  )}
                  <button
                    onClick={() => onChange(value.filter((t) => t !== ticker))}
                    className="hover:text-bear transition-colors ml-1"
                    aria-label={`Remove ${ticker}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <Select
      value={value[0] || ''}
      onChange={(e) => onChange(e.target.value ? [e.target.value] : [])}
      className={className}
    >
      <option value="">All Tickers</option>
      {watchlist.map((item: any) => (
        <option key={item.ticker} value={item.ticker}>
          {item.ticker} {item.price !== null ? `($${item.price.toFixed(2)})` : ''}
        </option>
      ))}
    </Select>
  );
}
