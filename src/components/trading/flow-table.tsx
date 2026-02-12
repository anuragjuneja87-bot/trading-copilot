'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { formatCompactNumber, formatPrice } from '@/lib/utils';
import { format, parseISO } from 'date-fns';
import { BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface OptionTrade {
  id: string;
  ticker: string;
  optionTicker: string;
  strike: number;
  expiry: string;
  callPut: 'C' | 'P';
  price: number;
  size: number;
  premium: number;
  exchange: string;
  exchangeId: number;
  timestamp: string;
  timestampMs: number;
  conditions: number[];
  tradeType: string;
  side: 'BUY' | 'SELL' | 'UNKNOWN';
  sequenceNumber: number;
  spotPrice?: number;
  otmPercent?: number;
  isUnusual?: boolean;
  isSweep?: boolean;
  isGolden?: boolean;
  heatScore?: number;
}

interface FlowTableProps {
  flow: OptionTrade[];
  onTickerClick?: (ticker: string) => void;
  isLoading?: boolean;
}

function formatTime(timestamp: string): string {
  try {
    return format(parseISO(timestamp), 'HH:mm:ss');
  } catch {
    return '--:--:--';
  }
}

function formatExpiry(expiry: string): string {
  try {
    const date = new Date(expiry);
    return format(date, 'MM/dd');
  } catch {
    return '--';
  }
}

function formatPremium(premium: number): string {
  if (premium >= 1000000) {
    return `$${(premium / 1000000).toFixed(1)}M`;
  }
  if (premium >= 1000) {
    return `$${(premium / 1000).toFixed(0)}K`;
  }
  return formatPrice(premium);
}

function getHeatEmojis(score?: number): string {
  if (!score) return '—';
  // Convert 1-10 score to 1-5 emojis
  const count = Math.min(5, Math.max(1, Math.ceil(score / 2)));
  return '🔥'.repeat(count);
}

export function FlowTable({ flow, onTickerClick, isLoading }: FlowTableProps) {
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Ensure flow is always an array
  const safeFlow = Array.isArray(flow) ? flow : [];

  const sortedFlow = useMemo(() => {
    if (!Array.isArray(safeFlow)) return [];
    if (!sortColumn) return safeFlow;

    return [...safeFlow].sort((a, b) => {
      let aVal: any;
      let bVal: any;

      switch (sortColumn) {
        case 'time':
          aVal = new Date(a.timestamp).getTime();
          bVal = new Date(b.timestamp).getTime();
          break;
        case 'ticker':
          aVal = a.ticker;
          bVal = b.ticker;
          break;
        case 'premium':
          aVal = a.premium;
          bVal = b.premium;
          break;
        case 'size':
          aVal = a.size;
          bVal = b.size;
          break;
        case 'heat':
          aVal = a.heatScore || 0;
          bVal = b.heatScore || 0;
          break;
        default:
          return 0;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [safeFlow, sortColumn, sortDirection]);

  const handleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('desc');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-background-elevated animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (!Array.isArray(safeFlow) || safeFlow.length === 0) {
    return (
      <div className="text-center py-12">
        <BarChart3 className="h-12 w-12 text-text-muted mx-auto mb-4 opacity-50" />
        <p className="text-text-primary font-medium mb-2">No options flow data</p>
        <p className="text-sm text-text-muted mb-2">
          Market may be closed or no activity matches your filters
        </p>
        <p className="text-xs text-text-muted mb-4">
          Try: Lowering min premium, removing ticker filters, or checking if market is open
        </p>
        <p className="text-xs text-text-muted">
          If no tickers are selected, default popular tickers (SPY, QQQ, NVDA, etc.) are used
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      {/* Desktop Table */}
      <div className="hidden lg:block">
        <div className="rounded-xl border border-border bg-background-card overflow-hidden">
          <table className="w-full">
            <thead className="bg-background-surface border-b border-border">
              <tr>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-text-primary cursor-pointer hover:bg-background-elevated"
                  onClick={() => handleSort('time')}
                >
                  Time
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-text-primary cursor-pointer hover:bg-background-elevated"
                  onClick={() => handleSort('ticker')}
                >
                  Symbol
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                  Side
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                  C/P
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                  Strike
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                  Expiration
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-text-primary cursor-pointer hover:bg-background-elevated"
                  onClick={() => handleSort('size')}
                >
                  Size
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-text-primary cursor-pointer hover:bg-background-elevated"
                  onClick={() => handleSort('premium')}
                >
                  Premium
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                  OTM%
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-text-primary">
                  Spot
                </th>
                <th
                  className="px-4 py-3 text-left text-xs font-semibold text-text-primary cursor-pointer hover:bg-background-elevated"
                  onClick={() => handleSort('heat')}
                >
                  Heat
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedFlow.map((trade) => {
                const isNew = new Date().getTime() - new Date(trade.timestamp).getTime() < 30000;
                const isBullish = trade.callPut === 'C' && (trade.side === 'BUY' || trade.isSweep);
                const isBearish = trade.callPut === 'P' && (trade.side === 'BUY' || trade.isSweep);

                return (
                  <tr
                    key={trade.id}
                    className={cn(
                      'border-b border-background-elevated hover:bg-background-elevated/50 transition-colors',
                      trade.isGolden && 'bg-warning/10 border-l-2 border-l-warning',
                      trade.isSweep && !trade.isGolden && 'border-l-2 border-l-warning/50',
                      trade.isUnusual && !trade.isSweep && 'border-l-2 border-l-accent/50',
                      trade.premium > 100000 && 'bg-accent/5',
                      trade.premium > 500000 && 'bg-warning/10 border-l-2 border-l-warning',
                      trade.premium > 1000000 && 'bg-bull/10 border-l-2 border-l-bull',
                      isBullish && 'bg-bull/5',
                      isBearish && 'bg-bear/5'
                    )}
                  >
                    <td className="px-4 py-4 lg:py-3 text-xs text-text-secondary font-mono min-h-[44px] flex items-center">
                      {formatTime(trade.timestamp)}
                      {isNew && (
                        <Badge variant="outline" className="ml-2 text-xs">
                          New
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => onTickerClick?.(trade.ticker)}
                        className="font-semibold text-text-primary hover:text-accent transition-colors"
                      >
                        {trade.ticker}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs",
                        trade.side === 'BUY' && "bg-bull/20 text-bull",
                        trade.side === 'SELL' && "bg-bear/20 text-bear",
                        trade.side === 'UNKNOWN' && "bg-text-muted/20 text-text-muted"
                      )}>
                        {trade.side === 'UNKNOWN' ? '—' : trade.side}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn(
                        "px-2 py-0.5 rounded text-xs font-medium",
                        trade.callPut === 'C' && "bg-bull/20 text-bull",
                        trade.callPut === 'P' && "bg-bear/20 text-bear"
                      )}>
                        {trade.callPut === 'C' ? 'CALL' : 'PUT'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-mono">
                      ${trade.strike}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {formatExpiry(trade.expiry)}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-mono">
                      {trade.size}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-primary font-mono font-semibold">
                      {formatPremium(trade.premium)}
                    </td>
                    <td className="px-4 py-3 text-xs text-text-secondary">
                      {trade.otmPercent !== undefined ? `${trade.otmPercent.toFixed(1)}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm text-text-secondary font-mono">
                      {trade.spotPrice ? formatPrice(trade.spotPrice) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {getHeatEmojis(trade.heatScore)}
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
        {sortedFlow.map((trade) => {
          const isNew = new Date().getTime() - new Date(trade.timestamp).getTime() < 30000;
          const isBullish = trade.callPut === 'C' && (trade.side === 'BUY' || trade.isSweep);
          const isBearish = trade.callPut === 'P' && (trade.side === 'BUY' || trade.isSweep);

          return (
            <div
              key={trade.id}
              onClick={() => onTickerClick?.(trade.ticker)}
              className={cn(
                'p-4 rounded-lg border border-border bg-background-card',
                trade.isGolden && 'border-l-4 border-l-warning bg-warning/5',
                trade.isSweep && !trade.isGolden && 'border-l-4 border-l-warning/50',
                trade.isUnusual && !trade.isSweep && 'border-l-4 border-l-accent/50',
                isBullish && 'bg-bull/5',
                isBearish && 'bg-bear/5'
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">{trade.ticker}</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-xs font-medium",
                    trade.callPut === 'C' && "bg-bull/20 text-bull",
                    trade.callPut === 'P' && "bg-bear/20 text-bear"
                  )}>
                    {trade.callPut === 'C' ? 'CALL' : 'PUT'}
                  </span>
                  {isNew && (
                    <Badge variant="outline" className="text-xs">
                      New
                    </Badge>
                  )}
                </div>
                <span className="text-xs text-text-muted font-mono">
                  {formatTime(trade.timestamp)}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-text-muted">Strike: </span>
                  <span className="font-mono">${trade.strike}</span>
                </div>
                <div>
                  <span className="text-text-muted">Size: </span>
                  <span className="font-mono">{trade.size}</span>
                </div>
                <div>
                  <span className="text-text-muted">Premium: </span>
                  <span className="font-semibold">{formatPremium(trade.premium)}</span>
                </div>
                <div>
                  <span className="text-text-muted">Side: </span>
                  <span className={cn(
                    trade.side === 'BUY' && "text-bull",
                    trade.side === 'SELL' && "text-bear",
                    trade.side === 'UNKNOWN' && "text-text-muted"
                  )}>
                    {trade.side === 'UNKNOWN' ? '—' : trade.side}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
