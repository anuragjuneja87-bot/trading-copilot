'use client';

import { useState, useMemo, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { useOptionsFlowWebSocket } from '@/hooks/use-options-flow-websocket';
import { useOptionsFlow } from '@/hooks/use-trading-data';
import { FlowTable } from '@/components/trading/flow-table';
import { FlowAnalyticsV2 } from '@/components/trading/flow-analytics-v2';
import { WatchlistTickerSelect } from '@/components/trading/watchlist-ticker-select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { showToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import {
  BarChart3,
  Filter,
  RefreshCw,
  Zap,
  Flame,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  X,
  Bell,
  Plus,
  MessageSquare,
  Loader2,
  Table as TableIcon,
} from 'lucide-react';
import { formatCompactNumber, formatPrice } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import Link from 'next/link';
import type { EnhancedOptionTrade, EnhancedFlowStats } from '@/types/flow';

// Use enhanced types from API
type OptionTrade = EnhancedOptionTrade;
type FlowStats = EnhancedFlowStats;

// Helper functions
function formatTime(timestamp: string): string {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

function formatExpiry(expiry: string): string {
  if (!expiry) return '—';
  try {
    const date = new Date(expiry);
    return `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}`;
  } catch {
    return expiry;
  }
}

function formatPremium(premium: number): string {
  if (premium >= 1000000) return `$${(premium / 1000000).toFixed(1)}M`;
  if (premium >= 1000) return `$${(premium / 1000).toFixed(0)}K`;
  return `$${premium}`;
}

const PRESETS = [
  { id: 'all', label: 'All Flow', icon: BarChart3 },
  { id: 'unusual', label: 'Unusual Only', icon: Zap },
  { id: 'sweeps', label: 'Sweeps', icon: Flame },
  { id: 'large', label: 'Large Premium', icon: TrendingUp },
  { id: 'calls', label: 'Calls Only', icon: TrendingUp },
  { id: 'puts', label: 'Puts Only', icon: TrendingDown },
];

const MIN_PREMIUM_OPTIONS = [
  { value: 0, label: '$0' },
  { value: 1000, label: '$1K' },
  { value: 5000, label: '$5K' },
  { value: 10000, label: '$10K' },
  { value: 50000, label: '$50K' },
  { value: 100000, label: '$100K' },
  { value: 500000, label: '$500K' },
  { value: 1000000, label: '$1M' },
];

const EXPIRY_OPTIONS = [
  { value: 0, label: 'Today' },
  { value: 7, label: 'This Week' },
  { value: 30, label: 'This Month' },
  { value: 365, label: 'All' },
];

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

  // Fetch current price
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
              sessionStorage.setItem('chat_prompt', `Analyze ${ticker} options flow`);
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

export default function FlowPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activePreset, setActivePreset] = useState(searchParams.get('preset') || 'all');
  const [minPremium, setMinPremium] = useState(
    parseInt(searchParams.get('minPremium') || '0')
  );
  const [selectedTickers, setSelectedTickers] = useState<string[]>(
    searchParams.get('tickers')?.split(',').filter(Boolean) || []
  );
  const [customTicker, setCustomTicker] = useState('');
  const [expiryFilter, setExpiryFilter] = useState(
    parseInt(searchParams.get('expiry') || '365')
  );
  const [sideFilter, setSideFilter] = useState(searchParams.get('side') || 'all');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [soundAlerts, setSoundAlerts] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'table' | 'analytics'>('analytics');

  // Remove tier restrictions for testing phase
  const refreshInterval = 5000; // 5s refresh for all users

  // Fetch watchlist for ticker filter
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      return data.data?.watchlist || [];
    },
  });

  // Don't auto-select watchlist tickers - let user choose or use default popular tickers
  // This prevents issues when watchlist has tickers without options data

  // Build API filters (only what the API supports)
  const apiFilters = useMemo(() => {
    const f: any = {
      minPremium: activePreset === 'large' ? Math.max(minPremium, 500000) : minPremium,
      limit: 200, // Fetch more to allow client-side filtering
    };

    switch (activePreset) {
      case 'calls':
        f.callPut = 'C';
        break;
      case 'puts':
        f.callPut = 'P';
        break;
      default:
        f.callPut = 'all';
    }

    // Only filter by tickers if explicitly selected
    if (selectedTickers.length > 0) {
      f.tickers = selectedTickers.join(',');
    }

    return f;
  }, [activePreset, minPremium, selectedTickers]);

  // Get tickers for WebSocket subscription
  const wsTickers = useMemo(() => {
    if (selectedTickers.length > 0) {
      return selectedTickers;
    }
    // Default to popular tickers if none selected
    return ['SPY', 'QQQ', 'NVDA'];
  }, [selectedTickers]);

  // WebSocket for real-time updates (per-minute aggregates)
  const { isConnected: wsConnected, lastUpdate: wsLastUpdate } = useOptionsFlowWebSocket({
    tickers: wsTickers,
    enabled: autoRefresh, // Only use WebSocket when auto-refresh is enabled
    mode: 'AM', // Per-minute aggregates (less data)
  });

  // Fetch flow data using new hook
  const { data: flowResponse, isLoading, dataUpdatedAt, refetch } = useOptionsFlow({
    tickers: apiFilters.tickers,
    minPremium: apiFilters.minPremium,
    callPut: apiFilters.callPut,
    limit: apiFilters.limit,
  });

  const flowData = flowResponse?.data;
  const rawFlow = (flowData?.flow || []) as OptionTrade[];
  
  // Apply client-side filters
  const filteredFlow = useMemo(() => {
    let filtered = [...rawFlow];

    // Filter by expiry (days until expiration)
    if (expiryFilter < 365) {
      const now = Date.now();
      filtered = filtered.filter((trade) => {
        if (!trade.expiry) return false;
        const expiryDate = new Date(trade.expiry).getTime();
        const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
        // For "Today" (0), show trades expiring today or tomorrow (0-1 days)
        if (expiryFilter === 0) {
          return daysUntilExpiry >= 0 && daysUntilExpiry <= 1;
        }
        return daysUntilExpiry >= 0 && daysUntilExpiry <= expiryFilter;
      });
    }

    // Filter by side (bullish/bearish)
    if (sideFilter === 'bullish') {
      filtered = filtered.filter((trade) => 
        trade.callPut === 'C' && (trade.side === 'BUY' || trade.isSweep)
      );
    } else if (sideFilter === 'bearish') {
      filtered = filtered.filter((trade) => 
        trade.callPut === 'P' && (trade.side === 'BUY' || trade.isSweep)
      );
    }

    // Filter by preset-specific criteria
    switch (activePreset) {
      case 'unusual':
        filtered = filtered.filter((trade) => trade.isUnusual);
        break;
      case 'sweeps':
        filtered = filtered.filter((trade) => {
          const type = trade.tradeType.toUpperCase();
          return type.includes('SWEEP') || trade.isSweep;
        });
        break;
      case 'large':
        // Already handled by minPremium filter
        break;
      case 'calls':
        // Already handled by callPut filter in API
        break;
      case 'puts':
        // Already handled by callPut filter in API
        break;
    }

    return filtered;
  }, [rawFlow, expiryFilter, sideFilter, activePreset]);

  const flow = filteredFlow;
  
  // Use API stats (already enhanced) with filtered trade count override
  const stats: EnhancedFlowStats = useMemo(() => {
    const apiStats = flowData?.stats as EnhancedFlowStats | undefined;
    
    if (!apiStats) {
      // Fallback empty stats
      return {
        totalPremium: 0,
        callPremium: 0,
        putPremium: 0,
        callRatio: 50,
        putRatio: 50,
        tradeCount: 0,
        mostActive: null,
        netDeltaAdjustedFlow: 0,
        flowMomentum: 0,
        momentumDirection: 'neutral',
        sweepRatio: 0,
        avgSmartMoneyScore: 0,
        unusualCount: 0,
        regime: 'NEUTRAL',
        gexByStrike: [],
        flowTimeSeries: [],
        bullishPremium: 0,
        bearishPremium: 0,
      };
    }
    
    // Override trade count with filtered count, but keep all other enhanced metrics from API
    return {
      ...apiStats,
      tradeCount: flow.length,
    };
  }, [flowData, flow.length]);

  // Auto-refresh every 10 seconds
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      refetch();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, refetch]);

  // Sound alert for golden sweeps
  useEffect(() => {
    if (!soundAlerts || !flow) return;

    const goldenSweeps = flow.filter(
      (item) => item.isGolden && new Date(item.timestamp).getTime() > Date.now() - 10000
    );

    if (goldenSweeps.length > 0) {
      // Play sound (you can add an actual sound file)
      console.log('Golden sweep detected!', goldenSweeps);
    }
  }, [flow, soundAlerts]);

  // Update URL when filters change
  useEffect(() => {
    const params = new URLSearchParams();
    if (activePreset !== 'all') params.set('preset', activePreset);
    if (minPremium !== 0) params.set('minPremium', String(minPremium));
    if (expiryFilter !== 365) params.set('expiry', String(expiryFilter));
    if (sideFilter !== 'all') params.set('side', sideFilter);
    if (selectedTickers.length > 0) params.set('tickers', selectedTickers.join(','));
    router.replace(`/app/flow?${params.toString()}`, { scroll: false });
  }, [activePreset, minPremium, expiryFilter, sideFilter, selectedTickers, router]);

  return (
    <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Options Flow</h1>
            <p className="text-sm text-text-secondary mt-1">
              Real-time unusual options activity
            </p>
          </div>
          <div className="flex items-center gap-4">
            {/* View Toggle */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={() => setViewMode('table')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  viewMode === 'table' 
                    ? "bg-accent text-background" 
                    : "bg-background-elevated text-text-secondary hover:text-text-primary"
                )}
              >
                <TableIcon className="w-4 h-4" />
                Table
              </button>
              <button
                onClick={() => setViewMode('analytics')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5",
                  viewMode === 'analytics' 
                    ? "bg-accent text-background" 
                    : "bg-background-elevated text-text-secondary hover:text-text-primary"
                )}
              >
                <BarChart3 className="w-4 h-4" />
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
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="soundAlerts"
                checked={soundAlerts}
                onChange={(e) => setSoundAlerts(e.target.checked)}
                className="rounded border-border"
              />
              <label htmlFor="soundAlerts" className="text-sm text-text-secondary">
                Sound alerts
              </label>
            </div>
            {/* WebSocket Connection Status */}
            {autoRefresh && (
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${wsConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                <span className="text-xs text-text-muted">
                  {wsConnected ? 'Live' : 'Polling'}
                </span>
              </div>
            )}
            {dataUpdatedAt && (
              <span className="text-xs text-text-muted">
                Last updated: {formatDistanceToNow(dataUpdatedAt, { addSuffix: true })}
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
            {PRESETS.map((preset) => {
              const Icon = preset.icon;
              return (
                <Button
                  key={preset.id}
                  variant={activePreset === preset.id ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActivePreset(preset.id)}
                >
                  <Icon className="h-4 w-4 mr-2" />
                  {preset.label}
                </Button>
              );
            })}
          </div>

          {/* Advanced Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Min Premium:</label>
              <select
                value={minPremium}
                onChange={(e) => setMinPremium(parseInt(e.target.value))}
                className="px-2 py-1 rounded border border-border bg-background-surface text-text-primary text-sm"
              >
                {MIN_PREMIUM_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Expiry:</label>
              <select
                value={expiryFilter}
                onChange={(e) => setExpiryFilter(parseInt(e.target.value))}
                className="px-2 py-1 rounded border border-border bg-background-surface text-text-primary text-sm"
              >
                {EXPIRY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <label className="text-xs text-text-muted">Side:</label>
              <select
                value={sideFilter}
                onChange={(e) => setSideFilter(e.target.value)}
                className="px-2 py-1 rounded border border-border bg-background-surface text-text-primary text-sm"
              >
                <option value="all">All</option>
                <option value="bullish">Bullish</option>
                <option value="bearish">Bearish</option>
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
        <div className="flex items-center gap-6 py-3 px-4 bg-background-card rounded-lg mb-4 mx-6 mt-4">
          <div>
            <span className="text-text-muted text-sm">Total Premium</span>
            <span className="ml-2 font-semibold">{formatPremium(stats.totalPremium)}</span>
          </div>
          <div>
            <span className="text-text-muted text-sm">Call/Put</span>
            <span className="ml-2">
              <span className="text-bull">{stats.callRatio}%</span>
              {' / '}
              <span className="text-bear">{stats.putRatio}%</span>
            </span>
          </div>
          <div>
            <span className="text-text-muted text-sm">Trades</span>
            <span className="ml-2 font-semibold">{stats.tradeCount || flow.length}</span>
          </div>
          {stats.mostActive && (
            <div>
              <span className="text-text-muted text-sm">Most Active</span>
              <span className="ml-2 font-semibold">{stats.mostActive.ticker}</span>
            </div>
          )}
        </div>
      )}

      {/* Flow View */}
      <div className="p-6">
        {isLoading && flow.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-32 bg-background-elevated animate-pulse rounded-xl" />
            ))}
          </div>
        ) : viewMode === 'analytics' ? (
          <FlowAnalyticsV2 
            data={flow} 
            stats={stats} 
          />
        ) : (
          <FlowTable
            flow={flow}
            onTickerClick={setSelectedTicker}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* Ticker Modal */}
      <TickerModal
        ticker={selectedTicker}
        isOpen={!!selectedTicker}
        onClose={() => setSelectedTicker(null)}
      />
    </div>
  );
}
