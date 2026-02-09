'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { Navbar, Footer } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOptionsFlow, useRegime } from '@/hooks';
import { useUserStore } from '@/stores';
import { formatCompactNumber, formatPercent, getRelativeTime, cn } from '@/lib/utils';
import { 
  BarChart3, 
  Filter,
  RefreshCw,
  Lock,
  TrendingUp,
  TrendingDown,
  Flame,
  Zap,
  AlertTriangle,
  Clock
} from 'lucide-react';

// Filter presets
const PRESETS = [
  { id: 'all', label: 'All Flow', icon: BarChart3 },
  { id: 'unusual', label: 'Unusual', icon: Zap },
  { id: 'sweeps', label: 'Sweeps', icon: Flame },
  { id: 'calls', label: 'Calls Only', icon: TrendingUp },
  { id: 'puts', label: 'Puts Only', icon: TrendingDown },
];

export default function FlowPage() {
  const [activePreset, setActivePreset] = useState('all');
  const [minPremium, setMinPremium] = useState(10000);
  
  const tier = useUserStore((s) => s.tier);
  const isDelayed = tier === 'free';

  // Build filters based on preset
  const filters = useMemo(() => {
    const f: any = { minPremium, limit: 50 };
    switch (activePreset) {
      case 'unusual': f.unusual = true; break;
      case 'sweeps': f.sweeps = true; break;
      case 'calls': f.callPut = 'C'; break;
      case 'puts': f.callPut = 'P'; break;
    }
    return f;
  }, [activePreset, minPremium]);

  const { data: flowData, isLoading, refetch, dataUpdatedAt } = useOptionsFlow(filters);
  const { data: regime } = useRegime();

  const flow = flowData || [];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Navbar />
      
      <main className="flex-1 pt-20">
        <div className="mx-auto max-w-7xl px-4 py-8">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-text-primary">Options Flow</h1>
                {isDelayed && (
                  <Badge variant="elevated" className="gap-1">
                    <Clock className="h-3 w-3" />
                    30 min delay
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-sm text-text-secondary">
                Real-time options order flow with smart filtering
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Regime indicator */}
              {regime && (
                <div className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm',
                  regime.status === 'crisis' && 'bg-bear/10 text-bear',
                  regime.status === 'elevated' && 'bg-warning/10 text-warning',
                  regime.status === 'normal' && 'bg-bull/10 text-bull',
                )}>
                  <div className={cn(
                    'h-2 w-2 rounded-full animate-pulse',
                    regime.status === 'crisis' && 'bg-bear',
                    regime.status === 'elevated' && 'bg-warning',
                    regime.status === 'normal' && 'bg-bull',
                  )} />
                  <span className="font-medium">{regime.status.toUpperCase()}</span>
                </div>
              )}
              
              {/* Refresh button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
              >
                <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
                Refresh
              </Button>
              
              {/* Upgrade CTA for free users */}
              {isDelayed && (
                <Button size="sm" asChild>
                  <Link href="/pricing">
                    <Lock className="h-4 w-4 mr-2" />
                    Get Real-Time
                  </Link>
                </Button>
              )}
            </div>
          </div>

          {/* Filter presets */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setActivePreset(preset.id)}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  activePreset === preset.id
                    ? 'bg-accent text-background'
                    : 'bg-background-elevated text-text-secondary hover:text-text-primary'
                )}
              >
                <preset.icon className="h-4 w-4" />
                {preset.label}
              </button>
            ))}
            
            {/* Premium filter */}
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-text-muted">Min Premium:</span>
              <select
                value={minPremium}
                onChange={(e) => setMinPremium(parseInt(e.target.value))}
                className="bg-background-elevated border border-border rounded-md px-3 py-1.5 text-sm text-text-primary"
              >
                <option value={10000}>$10K+</option>
                <option value={50000}>$50K+</option>
                <option value={100000}>$100K+</option>
                <option value={500000}>$500K+</option>
                <option value={1000000}>$1M+</option>
              </select>
            </div>
          </div>

          {/* Flow table */}
          <div className="rounded-xl border border-border bg-background-card overflow-hidden">
            {/* Table header */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-background-surface">
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Ticker
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Strike / Expiry
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Premium
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      OTM %
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-text-muted uppercase tracking-wider">
                      Heat
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-text-muted uppercase tracking-wider">
                      Time
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    // Loading skeleton
                    Array.from({ length: 10 }).map((_, i) => (
                      <tr key={i} className="border-b border-border/50">
                        {Array.from({ length: 8 }).map((_, j) => (
                          <td key={j} className="px-4 py-3">
                            <div className="h-4 bg-background-elevated rounded animate-pulse" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : flow.length === 0 ? (
                    // Empty state
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center">
                        <BarChart3 className="h-12 w-12 text-text-muted mx-auto mb-4" />
                        <p className="text-text-secondary">No flow data matching your filters</p>
                        <p className="text-sm text-text-muted mt-1">Try adjusting your filters or wait for new activity</p>
                      </td>
                    </tr>
                  ) : (
                    // Flow rows
                    flow.map((item: any) => (
                      <tr
                        key={item.id}
                        className={cn(
                          'border-b border-border/50 hover:bg-background-surface transition-colors',
                          item.isGolden && 'bg-yellow-500/5 border-l-2 border-l-yellow-500',
                          item.isSweep && !item.isGolden && 'border-l-2 border-l-warning',
                          item.isUnusual && !item.isSweep && 'border-l-2 border-l-accent',
                        )}
                      >
                        {/* Ticker */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-semibold text-text-primary">
                              {item.ticker}
                            </span>
                            {item.isGolden && (
                              <span className="text-yellow-500" title="Golden Sweep">✨</span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted">
                            ${item.spotPrice?.toFixed(2)}
                          </div>
                        </td>
                        
                        {/* Strike / Expiry */}
                        <td className="px-4 py-3">
                          <div className="font-mono text-text-primary">
                            ${item.strike}
                          </div>
                          <div className="text-xs text-text-muted">
                            {item.expiry}
                          </div>
                        </td>
                        
                        {/* Type (Call/Put + Side) */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant={item.callPut === 'C' ? 'bullish' : 'bearish'}
                              className="font-mono"
                            >
                              {item.callPut === 'C' ? 'CALL' : 'PUT'}
                            </Badge>
                            {item.side !== 'BUY' && (
                              <span className={cn(
                                'text-xs font-medium',
                                item.side === 'SWEEP' && 'text-warning',
                                item.side === 'BLOCK' && 'text-accent',
                              )}>
                                {item.side}
                              </span>
                            )}
                          </div>
                        </td>
                        
                        {/* Size */}
                        <td className="px-4 py-3 text-right">
                          <span className="font-mono text-text-primary">
                            {formatCompactNumber(item.size)}
                          </span>
                          {item.oi > 0 && (
                            <div className="text-xs text-text-muted">
                              OI: {formatCompactNumber(item.oi)}
                            </div>
                          )}
                        </td>
                        
                        {/* Premium */}
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'font-mono font-semibold',
                            item.premium >= 1000000 && 'text-yellow-500',
                            item.premium >= 500000 && item.premium < 1000000 && 'text-accent',
                            item.premium < 500000 && 'text-text-primary',
                          )}>
                            ${formatCompactNumber(item.premium)}
                          </span>
                        </td>
                        
                        {/* OTM % */}
                        <td className="px-4 py-3 text-right">
                          <span className={cn(
                            'font-mono text-sm',
                            item.otmPercent > 10 && 'text-warning',
                            item.otmPercent <= 10 && 'text-text-secondary',
                          )}>
                            {formatPercent(item.otmPercent, 1)}
                          </span>
                        </td>
                        
                        {/* Heat Score */}
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <HeatScore score={item.heatScore} />
                          </div>
                        </td>
                        
                        {/* Time */}
                        <td className="px-4 py-3 text-right text-sm text-text-muted">
                          {getRelativeTime(new Date(item.timestamp))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Footer */}
            {dataUpdatedAt && (
              <div className="px-4 py-3 border-t border-border bg-background-surface flex items-center justify-between">
                <span className="text-xs text-text-muted">
                  {flow.length} trades shown • Last updated {getRelativeTime(new Date(dataUpdatedAt))}
                </span>
                {isDelayed && (
                  <Link href="/pricing" className="text-xs text-accent hover:underline">
                    Upgrade for real-time data →
                  </Link>
                )}
              </div>
            )}
          </div>

          {/* Upgrade banner for free users */}
          {isDelayed && (
            <div className="mt-8 rounded-xl border border-accent/20 bg-gradient-to-r from-accent/10 via-transparent to-accent/10 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">
                    Unlock Real-Time Flow
                  </h3>
                  <p className="text-sm text-text-secondary mt-1">
                    Get live options flow, sweeps, dark pool prints, and AI-powered analysis.
                  </p>
                </div>
                <Button asChild>
                  <Link href="/pricing">View Plans</Link>
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

// Heat score visualization
function HeatScore({ score }: { score: number }) {
  const flames = Math.ceil(score / 2); // 1-5 flames for 1-10 score
  const color = score >= 8 ? 'text-bear' : score >= 6 ? 'text-warning' : 'text-text-muted';
  
  return (
    <div className={cn('flex items-center gap-0.5', color)} title={`Heat Score: ${score}/10`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Flame
          key={i}
          className={cn(
            'h-3 w-3',
            i < flames ? 'opacity-100' : 'opacity-20'
          )}
          fill={i < flames ? 'currentColor' : 'none'}
        />
      ))}
    </div>
  );
}
