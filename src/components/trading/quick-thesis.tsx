'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import { RefreshCw, Loader2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react';
import Link from 'next/link';

interface ThesisData {
  ticker: string;
  verdict?: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  support?: string;
  resistance?: string;
  entry?: string;
  target?: string;
  stop?: string;
  reasoning?: string;
  fullResponse: string;
  error?: string;
}

interface ThesisReport {
  generatedAt: string;
  theses: ThesisData[];
}

const CACHE_KEY = 'thesis_report';
const CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours

function getCachedReport(): ThesisReport | null {
  if (typeof window === 'undefined') return null;
  
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    
    const data = JSON.parse(cached);
    const cachedAt = new Date(data.generatedAt);
    const now = new Date();
    
    if (now.getTime() - cachedAt.getTime() > CACHE_DURATION) {
      localStorage.removeItem(CACHE_KEY);
      return null;
    }
    
    return data;
  } catch {
    return null;
  }
}

function setCachedReport(report: ThesisReport) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(report));
  } catch (error) {
    console.error('Failed to cache report:', error);
  }
}

interface QuickThesisProps {
  tickers: string[];
}

export function QuickThesis({ tickers }: QuickThesisProps) {
  const router = useRouter();
  const [expandedTicker, setExpandedTicker] = useState<string | null>(null);
  const [cachedReport, setCachedReportState] = useState<ThesisReport | null>(null);

  // Load cached report on mount
  useEffect(() => {
    const cached = getCachedReport();
    if (cached) {
      setCachedReportState(cached);
    }
  }, []);

  // Generate thesis mutation
  const generateMutation = useMutation({
    mutationFn: async (tickerList: string[]) => {
      const res = await fetch('/api/ai/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: tickerList }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (data: ThesisReport) => {
      setCachedReportState(data);
      setCachedReport(data);
      showToast('Thesis generated successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const handleGenerate = () => {
    if (tickers.length === 0) {
      showToast('Add tickers to your watchlist first', 'error');
      return;
    }
    generateMutation.mutate(tickers.slice(0, 5)); // Max 5 for quick view
  };

  const handleRefresh = () => {
    handleGenerate();
  };

  const report = cachedReport || generateMutation.data;
  const isGenerating = generateMutation.isPending;
  const hasCachedData = cachedReport !== null;
  const displayTickers = tickers.slice(0, 5); // Show max 5
  const reportTheses = report?.theses || [];
  
  // Filter theses to only show watchlist tickers
  const relevantTheses = reportTheses.filter((t) => displayTickers.includes(t.ticker));

  return (
    <div className="space-y-3">
      {/* Header with action */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin text-accent" />
          ) : hasCachedData ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isGenerating}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerate}
              disabled={isGenerating || tickers.length === 0}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generate Thesis
                </>
              )}
            </Button>
          )}
        </div>
        <Link
          href="/app/thesis"
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          View Full Report
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      {/* Content */}
      {isGenerating && !report && (
        <div className="space-y-2">
          {displayTickers.map((ticker) => (
            <div
              key={ticker}
              className="h-[60px] bg-background-elevated animate-pulse rounded border border-border"
            />
          ))}
        </div>
      )}

      {!isGenerating && relevantTheses.length === 0 && !hasCachedData && (
        <div className="text-center py-4 text-sm text-text-muted">
          <p>No thesis data yet</p>
          <p className="text-xs mt-1">Click "Generate Thesis" to get started</p>
        </div>
      )}

      {!isGenerating && relevantTheses.length > 0 && (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {relevantTheses.map((thesis) => (
            <div
              key={thesis.ticker}
              className="p-3 rounded-lg border border-border bg-background-surface hover:border-accent/50 transition-colors cursor-pointer"
              onClick={() =>
                setExpandedTicker(expandedTicker === thesis.ticker ? null : thesis.ticker)
              }
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-text-primary">{thesis.ticker}</span>
                  {thesis.verdict && (
                    <Badge
                      variant={
                        thesis.verdict === 'BUY'
                          ? 'buy'
                          : thesis.verdict === 'SELL'
                          ? 'sell'
                          : 'wait'
                      }
                      className="text-xs"
                    >
                      {thesis.verdict}
                    </Badge>
                  )}
                </div>
                {expandedTicker === thesis.ticker ? (
                  <ChevronUp className="h-4 w-4 text-text-muted" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-text-muted" />
                )}
              </div>

              {thesis.verdict && thesis.verdict !== 'WAIT' && thesis.entry && thesis.target ? (
                <div className="text-xs text-text-secondary">
                  <span className="font-medium">{thesis.entry}</span>
                  <span className="mx-1">→</span>
                  <span className="font-medium">{thesis.target}</span>
                </div>
              ) : (
                <div className="text-xs text-text-muted">—</div>
              )}

              {expandedTicker === thesis.ticker && (
                <div className="mt-2 pt-2 border-t border-border">
                  {thesis.error ? (
                    <p className="text-xs text-bear">{thesis.error}</p>
                  ) : (
                    <p className="text-xs text-text-secondary line-clamp-2">
                      {thesis.reasoning || thesis.fullResponse?.substring(0, 100) || 'No reasoning available'}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isGenerating && relevantTheses.length === 0 && hasCachedData && (
        <div className="text-center py-4 text-sm text-text-muted">
          <p>No thesis data for watchlist tickers</p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerate}
            className="mt-2"
          >
            Generate Now
          </Button>
        </div>
      )}
    </div>
  );
}
