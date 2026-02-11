'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/toast';
import {
  Eye,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Loader2,
  X,
  Zap,
  Plus,
  MessageSquare,
} from 'lucide-react';
import { formatCompactNumber, formatPrice, cn } from '@/lib/utils';
import { format } from 'date-fns';
import { WatchlistTickerSelect } from '@/components/trading/watchlist-ticker-select';
import { DarkPoolAnalytics } from '@/components/trading/darkpool-analytics';
import { Table as TableIcon, BarChart2 } from 'lucide-react';
import type { DarkPoolPrint, DarkPoolStats } from '@/types/darkpool';

// Types are now imported from @/types/darkpool

const PRESETS = [
  { id: 'all', label: 'All Prints' },
  { id: 'large', label: 'Large ($1M+)' },
  { id: 'mega', label: 'Mega ($10M+)' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
];

const MIN_VALUE_OPTIONS = [
  { value: 100000, label: '$100K' },
  { value: 500000, label: '$500K' },
  { value: 1000000, label: '$1M' },
  { value: 5000000, label: '$5M' },
  { value: 10000000, label: '$10M' },
];

const TIME_OPTIONS = [
  { value: 'hour', label: 'Last Hour' },
  { value: 'day', label: 'Today' },
  { value: 'week', label: 'This Week' },
];

function getWhaleEmojis(significance: number): string {
  return '🐋'.repeat(Math.min(5, Math.max(1, significance)));
}

function TickerModal({
  ticker,
  isOpen,
  onClose,
}: {
  ticker: string | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [thesis, setThesis] = useState<string>('');
  const [isLoadingThesis, setIsLoadingThesis] = useState(false);
  const [price, setPrice] = useState<number | null>(null);

  useQuery({
    queryKey: ['price', ticker],
    queryFn: async () => {
      if (!ticker) return null;
      const res = await fetch(`/api/market/prices?tickers=${ticker}`);
      const data = await res.json();
      const priceData = data.data?.prices?.[0];
      if (priceData) setPrice(priceData.price);
      return priceData;
    },
    enabled: !!ticker && isOpen,
  });

  const handleGetThesis = async () => {
    if (!ticker) return;
    setIsLoadingThesis(true);
    try {
      const res = await fetch('/api/ai/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: [ticker] }),
      });
      const data = await res.json();
      if (data.success && data.data.theses.length > 0) {
        setThesis(data.data.theses[0].fullResponse);
      } else {
        showToast('Failed to get thesis', 'error');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    } finally {
      setIsLoadingThesis(false);
    }
  };

  const handleAddToWatchlist = async () => {
    if (!ticker) return;
    try {
      const res = await fetch('/api/user/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`${ticker} added to watchlist`, 'success');
      } else {
        showToast(data.error || 'Failed to add to watchlist', 'error');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  if (!isOpen || !ticker) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="w-full max-w-md mx-4 rounded-xl border border-border bg-background-card p-6 shadow-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-text-primary">{ticker}</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-background-elevated text-text-muted"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {price !== null && (
          <div className="mb-4">
            <div className="text-2xl font-bold text-text-primary">{formatPrice(price)}</div>
          </div>
        )}

        <div className="space-y-3">
          <Button onClick={handleGetThesis} disabled={isLoadingThesis} className="w-full" size="lg">
            {isLoadingThesis ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Loading...
              </>
            ) : (
              <>
                <Zap className="h-4 w-4 mr-2" />
                Get AI Thesis
              </>
            )}
          </Button>

          <Button onClick={handleAddToWatchlist} variant="outline" className="w-full" size="lg">
            <Plus className="h-4 w-4 mr-2" />
            Add to Watchlist
          </Button>

          <Button
            onClick={() => {
              sessionStorage.setItem('chat_prompt', `Analyze ${ticker} dark pool activity`);
              router.push('/app');
              onClose();
            }}
            variant="outline"
            className="w-full"
            size="lg"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            View Full Analysis
          </Button>
        </div>

        {thesis && (
          <div className="mt-4 p-4 rounded-lg bg-background-surface border border-border">
            <h3 className="text-sm font-semibold text-text-primary mb-2">AI Thesis</h3>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">{thesis}</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DarkPoolPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePreset, setActivePreset] = useState(searchParams.get('preset') || 'all');
  const [minValue, setMinValue] = useState(parseInt(searchParams.get('minValue') || '100000'));
  const [timeFilter, setTimeFilter] = useState(searchParams.get('time') || 'hour');
  const [selectedTickers, setSelectedTickers] = useState<string[]>(
    searchParams.get('tickers')?.split(',').filter(Boolean) || []
  );
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [selectedTickerModal, setSelectedTickerModal] = useState<string | null>(null);
  const [view, setView] = useState<'table' | 'analytics'>(
    (searchParams.get('view') as 'table' | 'analytics') || 'table'
  );

  // Remove tier restrictions for testing phase
  const refreshInterval = 10000; // 10s refresh for all users

  // Fetch watchlist to drive default ticker filter
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data?.watchlist || [];
    },
  });

  useEffect(() => {
    // If no tickers specified in URL and none selected yet, default to all watchlist tickers
    if (!searchParams.get('tickers') && !selectedTickers.length && Array.isArray(watchlistData)) {
      const tickers = watchlistData.map((item: any) => item.ticker);
      if (tickers.length > 0) {
        setSelectedTickers(tickers);
      }
    }
  }, [watchlistData, selectedTickers.length, searchParams]);

  // Build filters - use watchlist tickers if none selected
  const filters = useMemo(() => {
    const f: any = {
      minValue,
      time: timeFilter,
    };

    // Get tickers from selected or watchlist
    const tickersToUse = selectedTickers.length > 0 
      ? selectedTickers 
      : (Array.isArray(watchlistData) ? watchlistData.map((item: any) => item.ticker) : []);

    if (tickersToUse.length > 0) {
      f.tickers = tickersToUse.join(',');
    }

    switch (activePreset) {
      case 'large':
        f.minValue = 1000000;
        break;
      case 'mega':
        f.minValue = 10000000;
        break;
      case 'bullish':
        // Will filter client-side
        break;
      case 'bearish':
        // Will filter client-side
        break;
    }

    return f;
  }, [activePreset, minValue, timeFilter, selectedTickers, watchlistData]);

      // Fetch dark pool data
  const { data: darkPoolData, isLoading, dataUpdatedAt } = useQuery<{
    prints: DarkPoolPrint[];
    stats: DarkPoolStats;
    meta: any;
  }>({
    queryKey: ['darkpool', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.tickers) params.set('tickers', filters.tickers);
      if (filters.minValue) params.set('minSize', String(filters.minValue)); // API expects minSize
      if (filters.time) params.set('time', filters.time);

      const res = await fetch(`/api/darkpool?${params.toString()}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      
      // If no tickers were provided, show message
      if (data.message) {
        console.log('[Dark Pool]', data.message);
      }
      
      return data.data;
    },
    enabled: !!filters.tickers && filters.tickers.length > 0, // Only fetch if tickers are provided
    refetchInterval: autoRefresh ? refreshInterval : false,
  });

  // Filter prints based on preset
  const filteredPrints = useMemo(() => {
    if (!darkPoolData?.prints) return [];
    let prints = darkPoolData.prints;

    if (activePreset === 'bullish') {
      prints = prints.filter((p) => p.side === 'BULLISH');
    } else if (activePreset === 'bearish') {
      prints = prints.filter((p) => p.side === 'BEARISH');
    }

    return prints;
  }, [darkPoolData, activePreset]);

  const stats = darkPoolData?.stats;

      // Update URL when filters change
      useEffect(() => {
        const params = new URLSearchParams();
        if (activePreset !== 'all') params.set('preset', activePreset);
        if (minValue !== 100000) params.set('minValue', String(minValue));
        if (timeFilter !== 'hour') params.set('time', timeFilter);
        if (selectedTickers.length > 0) params.set('tickers', selectedTickers.join(','));
        if (view !== 'table') params.set('view', view);
        router.replace(`/app/darkpool?${params.toString()}`, { scroll: false });
      }, [activePreset, minValue, timeFilter, selectedTickers, view, router]);

  // Removed Pro restriction for testing phase

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <Eye className="h-6 w-6 text-accent" />
              <h1 className="text-2xl font-bold text-text-primary">Dark Pool Prints</h1>
            </div>
            <p className="text-sm text-text-secondary">
              Institutional block trades and hidden liquidity
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('table')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  view === 'table' 
                    ? "bg-accent text-background" 
                    : "bg-background-elevated text-text-secondary hover:text-text-primary"
                )}
              >
                <TableIcon className="w-4 h-4" />
                Table
              </button>
              <button
                onClick={() => setView('analytics')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  view === 'analytics' 
                    ? "bg-accent text-background" 
                    : "bg-background-elevated text-text-secondary hover:text-text-primary"
                )}
              >
                <BarChart2 className="w-4 h-4" />
                Analytics
              </button>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="autoRefresh"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="autoRefresh" className="text-sm text-text-secondary">
                Auto-refresh
              </label>
            </div>
            {dataUpdatedAt && (
              <span className="text-xs text-text-muted">
                Last updated: {format(dataUpdatedAt, 'h:mm:ss a')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="sticky top-[120px] z-10 bg-background-surface border-b border-border p-4">
        <div className="flex flex-col gap-4">
          {/* Presets */}
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                variant={activePreset === preset.id ? 'default' : 'outline'}
                size="sm"
                onClick={() => setActivePreset(preset.id)}
              >
                {preset.label}
              </Button>
            ))}
          </div>

          {/* Advanced Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Min Size:</label>
              <select
                value={minValue}
                onChange={(e) => setMinValue(parseInt(e.target.value))}
                className="px-2 py-1 rounded border border-border bg-background-surface text-text-primary text-sm"
              >
                {MIN_VALUE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Time:</label>
              <select
                value={timeFilter}
                onChange={(e) => setTimeFilter(e.target.value)}
                className="px-2 py-1 rounded border border-border bg-background-surface text-text-primary text-sm"
              >
                {TIME_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Tickers:</label>
              <WatchlistTickerSelect
                value={selectedTickers}
                onChange={setSelectedTickers}
                placeholder="Select from watchlist"
                multiple={true}
                className="w-48"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      {stats && (
        <div className="p-4 border-b border-border bg-background-surface">
          <div className="flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-text-muted">Total Volume: </span>
              <span className="font-semibold text-text-primary">
                {formatCompactNumber(stats.totalValue)}
              </span>
            </div>
            <div>
              <span className="text-text-muted">Bullish vs Bearish: </span>
              <span className="font-semibold text-bull">
                {stats.bullishPct}%
              </span>
              <span className="text-text-muted"> / </span>
              <span className="font-semibold text-bear">
                {stats.bearishPct}%
              </span>
            </div>
            {stats.largestPrint && (
              <div>
                <span className="text-text-muted">Largest Print: </span>
                <span className="font-semibold text-text-primary">
                  {stats.largestPrint.ticker} {formatCompactNumber(stats.largestPrint.value)}
                </span>
              </div>
            )}
            {stats.mostActive && (
              <div>
                <span className="text-text-muted">Most Active: </span>
                <span className="font-semibold text-text-primary">
                  {stats.mostActive.ticker} ({stats.mostActive.count} prints)
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Dark Pool View */}
      <div className="p-6">
        {view === 'analytics' ? (
          <DarkPoolAnalytics 
            prints={filteredPrints} 
            stats={stats || getEmptyStats()} 
            selectedTicker={selectedTickers[0]} 
          />
        ) : (
          <>
            {/* Dark Pool Table */}
            {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 bg-background-elevated animate-pulse rounded" />
            ))}
          </div>
        ) : filteredPrints.length === 0 ? (
          <div className="text-center py-12 text-text-muted">
            <p>No dark pool prints matching your filters</p>
            <p className="text-sm mt-2">
              {(!filters.tickers || (Array.isArray(watchlistData) && watchlistData.length === 0))
                ? 'Select tickers from your watchlist to see dark pool activity'
                : 'Try adjusting your filters or wait for market activity'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Desktop Table */}
            <div className="hidden lg:block">
              <div className="rounded-xl border border-border bg-background-card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-background-surface border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Time
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Ticker
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Price
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Size
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Value
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Side
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Exchange
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                        Significance
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrints.map((print) => {
                      const isNew = new Date().getTime() - new Date(print.timestamp).getTime() < 30000;
                      return (
                        <tr
                          key={print.id}
                          className={cn(
                            'border-b border-border hover:bg-background-elevated transition-colors cursor-pointer',
                            print.isMega && 'bg-warning/5 border-l-4 border-l-warning',
                            print.isLarge && !print.isMega && 'border-l-4 border-l-accent/50',
                            print.side === 'BULLISH' && 'bg-bull/5',
                            print.side === 'BEARISH' && 'bg-bear/5'
                          )}
                          onClick={() => setSelectedTickerModal(print.ticker)}
                        >
                          <td className="px-4 py-3 text-xs text-text-secondary font-mono">
                            {format(new Date(print.timestamp), 'HH:mm:ss')}
                            {isNew && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                New
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-text-primary">
                            {print.ticker}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary font-mono">
                            {formatPrice(print.price)}
                          </td>
                          <td className="px-4 py-3 text-sm text-text-primary font-mono">
                            {formatCompactNumber(print.size)}
                          </td>
                          <td className="px-4 py-3 text-sm font-semibold text-text-primary">
                            {formatCompactNumber(print.value)}
                          </td>
                          <td className="px-4 py-3">
                            {print.side === 'BULLISH' ? (
                              <Badge variant="bullish" className="text-xs">
                                BULLISH
                              </Badge>
                            ) : print.side === 'BEARISH' ? (
                              <Badge variant="bearish" className="text-xs">
                                BEARISH
                              </Badge>
                            ) : (
                              <Badge variant="neutral" className="text-xs">
                                NEUTRAL
                              </Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-text-secondary">
                            {print.exchange}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {getWhaleEmojis(print.significance)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-3">
              {filteredPrints.map((print) => {
                const isNew = new Date().getTime() - new Date(print.timestamp).getTime() < 30000;
                return (
                  <div
                    key={print.id}
                    onClick={() => setSelectedTickerModal(print.ticker)}
                    className={cn(
                      'p-4 rounded-lg border border-border bg-background-card',
                      print.isMega && 'border-l-4 border-l-warning bg-warning/5',
                      print.isLarge && !print.isMega && 'border-l-4 border-l-accent/50',
                      print.side === 'BULLISH' && 'bg-bull/5',
                      print.side === 'BEARISH' && 'bg-bear/5'
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-text-primary">{print.ticker}</span>
                        {print.side === 'BULLISH' ? (
                          <Badge variant="bullish" className="text-xs">
                            BULLISH
                          </Badge>
                        ) : print.side === 'BEARISH' ? (
                          <Badge variant="bearish" className="text-xs">
                            BEARISH
                          </Badge>
                        ) : (
                          <Badge variant="neutral" className="text-xs">
                            NEUTRAL
                          </Badge>
                        )}
                        {isNew && (
                          <Badge variant="outline" className="text-xs">
                            New
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-text-muted font-mono">
                        {format(new Date(print.timestamp), 'HH:mm:ss')}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>
                        <span className="text-text-muted">Price:</span>{' '}
                        <span className="font-mono text-text-primary">{formatPrice(print.price)}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Size:</span>{' '}
                        <span className="font-mono text-text-primary">
                          {formatCompactNumber(print.size)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted">Value:</span>{' '}
                        <span className="font-semibold text-text-primary">
                          {formatCompactNumber(print.value)}
                        </span>
                      </div>
                      <div>
                        <span className="text-text-muted">Exchange:</span>{' '}
                        <span className="text-text-secondary text-xs">{print.exchange}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <span className="text-xs text-text-muted">{print.exchange}</span>
                      <div className="text-sm">{getWhaleEmojis(print.significance)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
            )}
          </>
        )}
      </div>

      {/* Ticker Modal */}
      <TickerModal
        ticker={selectedTickerModal}
        isOpen={!!selectedTickerModal}
        onClose={() => setSelectedTickerModal(null)}
      />
    </div>
  );
}

function getEmptyStats(): DarkPoolStats {
  return {
    totalValue: 0,
    totalShares: 0,
    printCount: 0,
    bullishCount: 0,
    bearishCount: 0,
    neutralCount: 0,
    bullishValue: 0,
    bearishValue: 0,
    bullishPct: 0,
    bearishPct: 0,
    largestPrint: null,
    mostActive: null,
    priceLevels: [],
    sizeDistribution: { mega: 0, large: 0, medium: 0, small: 0 },
    timeSeries: [],
    regime: 'NEUTRAL',
  };
}
