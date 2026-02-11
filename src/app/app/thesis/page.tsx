'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { showToast } from '@/components/ui/toast';
import {
  FileText,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Copy,
  Send,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';

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

export default function ThesisPage() {
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

  // Fetch watchlist
  const { data: watchlistData } = useQuery({
    queryKey: ['watchlist'],
    queryFn: async () => {
      const res = await fetch('/api/user/watchlist');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
  });

  // Generate thesis mutation
  const generateMutation = useMutation({
    mutationFn: async (tickers: string[]) => {
      const res = await fetch('/api/ai/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      return data.data;
    },
    onSuccess: (data: ThesisReport) => {
      setCachedReportState(data);
      setCachedReport(data); // Save to localStorage
      showToast('Thesis report generated successfully', 'success');
    },
    onError: (error: Error) => {
      showToast(error.message, 'error');
    },
  });

  const handleGenerate = () => {
    const tickers = watchlistData?.watchlist.map((item: any) => item.ticker) || [];
    if (tickers.length === 0) {
      showToast('Add tickers to your watchlist first', 'error');
      return;
    }
    generateMutation.mutate(tickers);
  };

  const handleCopySummary = () => {
    if (!cachedReport) return;

    const lines = [
      'Morning Thesis Report',
      `Generated: ${format(new Date(cachedReport.generatedAt), 'PPpp')}`,
      '',
      'Ticker | Verdict | Support | Resistance | Entry | Target | Stop | Reasoning',
      '--- | --- | --- | --- | --- | --- | --- | ---',
    ];

    cachedReport.theses.forEach((thesis) => {
      lines.push(
        [
          thesis.ticker,
          thesis.verdict || '-',
          thesis.support || '-',
          thesis.resistance || '-',
          thesis.entry || '-',
          thesis.target || '-',
          thesis.stop || '-',
          thesis.reasoning || '-',
        ].join(' | ')
      );
    });

    navigator.clipboard.writeText(lines.join('\n'));
    showToast('Summary copied to clipboard', 'success');
  };

  const handleShareToChat = () => {
    if (!cachedReport) return;
    
    const summary = cachedReport.theses
      .map((t) => `${t.ticker}: ${t.verdict || 'N/A'} - ${t.reasoning || 'No reasoning'}`)
      .join('\n');
    
    // Store in sessionStorage for chat to pick up
    sessionStorage.setItem('thesis_share', summary);
    router.push('/app');
    showToast('Thesis summary shared to chat', 'success');
  };

  const handleRefreshTicker = async (ticker: string) => {
    try {
      const res = await fetch('/api/ai/thesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: [ticker] }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      if (cachedReport && data.data.theses.length > 0) {
        const updated = {
          ...cachedReport,
          theses: cachedReport.theses.map((t) =>
            t.ticker === ticker ? data.data.theses[0] : t
          ),
        };
        setCachedReportState(updated);
        setCachedReport(updated); // Save to localStorage
        showToast(`${ticker} thesis refreshed`, 'success');
      }
    } catch (error: any) {
      showToast(error.message, 'error');
    }
  };

  const report = cachedReport || generateMutation.data;
  const tickers = watchlistData?.watchlist?.map((item: any) => item.ticker) || [];
  const isGenerating = generateMutation.isPending;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8 text-accent" />
            <h1 className="text-3xl font-bold text-text-primary">Morning Thesis Report</h1>
          </div>
          <p className="text-text-secondary mb-4">
            One-click trading thesis for your watchlist
          </p>
          <div className="flex items-center gap-4">
            <Button
              onClick={handleGenerate}
              disabled={isGenerating || tickers.length === 0}
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Generate Report
                </>
              )}
            </Button>
            {report && (
              <span className="text-sm text-text-muted">
                Generated at {format(new Date(report.generatedAt), 'h:mm a')} ET
              </span>
            )}
            {!report && !isGenerating && (
              <span className="text-sm text-text-muted">Not yet generated today</span>
            )}
          </div>
        </div>

        {/* Progress indicator */}
        {isGenerating && (
          <div className="mb-6 p-4 rounded-lg bg-background-card border border-border">
            <p className="text-sm text-text-secondary mb-2">
              Analyzing tickers... This may take a few minutes.
            </p>
            <div className="flex gap-2 flex-wrap">
              {tickers.map((ticker: string, idx: number) => (
                <Badge
                  key={ticker}
                  variant="outline"
                  className={
                    idx < (generateMutation.variables?.length || 0)
                      ? 'bg-accent/10 border-accent'
                      : ''
                  }
                >
                  {ticker}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Report Table */}
        {report && report.theses.length > 0 && (
          <>
            {/* Desktop Table */}
            <div className="hidden lg:block overflow-x-auto mb-6">
              <div className="rounded-xl border border-border bg-background-card overflow-hidden">
                <table className="w-full">
                  <thead className="bg-background-surface border-b border-border">
                    <tr>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Ticker
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Verdict
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Support
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Resistance
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Entry
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Target
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Stop
                      </th>
                      <th className="px-4 py-3 text-left text-sm font-semibold text-text-primary">
                        Reasoning
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.theses.map((thesis) => (
                      <tr
                        key={thesis.ticker}
                        className="border-b border-border hover:bg-background-elevated cursor-pointer"
                        onClick={() =>
                          setExpandedTicker(
                            expandedTicker === thesis.ticker ? null : thesis.ticker
                          )
                        }
                      >
                        <td className="px-4 py-3 font-semibold text-text-primary">
                          {thesis.ticker}
                        </td>
                        <td className="px-4 py-3">
                          {thesis.verdict ? (
                            <Badge
                              variant={
                                thesis.verdict === 'BUY'
                                  ? 'buy'
                                  : thesis.verdict === 'SELL'
                                  ? 'sell'
                                  : 'wait'
                              }
                            >
                              {thesis.verdict}
                            </Badge>
                          ) : (
                            <span className="text-text-muted">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {thesis.support || '-'}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {thesis.resistance || '-'}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {thesis.entry || '-'}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {thesis.target || '-'}
                        </td>
                        <td className="px-4 py-3 text-text-secondary">
                          {thesis.stop || '-'}
                        </td>
                        <td className="px-4 py-3 text-text-secondary text-sm max-w-xs truncate">
                          {thesis.reasoning || thesis.error || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Mobile Cards */}
            <div className="lg:hidden space-y-4 mb-6">
              {report.theses.map((thesis) => (
                <div
                  key={thesis.ticker}
                  className="rounded-xl border border-border bg-background-card p-4"
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-semibold text-text-primary text-lg">
                      {thesis.ticker}
                    </h3>
                    {thesis.verdict && (
                      <Badge
                        variant={
                          thesis.verdict === 'BUY'
                            ? 'buy'
                            : thesis.verdict === 'SELL'
                            ? 'sell'
                            : 'wait'
                        }
                      >
                        {thesis.verdict}
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                    <div>
                      <span className="text-text-muted">Support:</span>{' '}
                      <span className="text-text-primary">{thesis.support || '-'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Resistance:</span>{' '}
                      <span className="text-text-primary">{thesis.resistance || '-'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Entry:</span>{' '}
                      <span className="text-text-primary">{thesis.entry || '-'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Target:</span>{' '}
                      <span className="text-text-primary">{thesis.target || '-'}</span>
                    </div>
                    <div>
                      <span className="text-text-muted">Stop:</span>{' '}
                      <span className="text-text-primary">{thesis.stop || '-'}</span>
                    </div>
                  </div>
                  <p className="text-sm text-text-secondary mb-3">
                    {thesis.reasoning || thesis.error || 'No reasoning provided'}
                  </p>
                  <button
                    onClick={() =>
                      setExpandedTicker(
                        expandedTicker === thesis.ticker ? null : thesis.ticker
                      )
                    }
                    className="text-sm text-accent hover:underline flex items-center gap-1"
                  >
                    {expandedTicker === thesis.ticker ? (
                      <>
                        <ChevronUp className="h-4 w-4" />
                        Hide Details
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4" />
                        Show Details
                      </>
                    )}
                  </button>
                </div>
              ))}
            </div>

            {/* Expanded Detail View */}
            {expandedTicker && (
              <div className="mb-6 rounded-xl border border-border bg-background-card p-6">
                {report.theses
                  .filter((t) => t.ticker === expandedTicker)
                  .map((thesis) => (
                    <div key={thesis.ticker}>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-xl font-semibold text-text-primary">
                          {thesis.ticker} - Full Thesis
                        </h3>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRefreshTicker(thesis.ticker)}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Refresh
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              sessionStorage.setItem(
                                'chat_prompt',
                                `Tell me more about ${thesis.ticker} trading thesis`
                              );
                              router.push('/app');
                            }}
                          >
                            <Send className="h-4 w-4 mr-2" />
                            Ask Follow-up
                          </Button>
                        </div>
                      </div>
                      {thesis.error ? (
                        <div className="p-4 rounded-lg bg-bear/10 border border-bear/20 text-bear">
                          <AlertCircle className="h-5 w-5 inline mr-2" />
                          {thesis.error}
                        </div>
                      ) : (
                        <div className="prose prose-invert max-w-none text-text-secondary whitespace-pre-wrap">
                          {thesis.fullResponse || 'No response available'}
                        </div>
                      )}
                    </div>
                  ))}
              </div>
            )}

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-3">
              <Button variant="outline" onClick={handleCopySummary}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Summary
              </Button>
              <Button variant="outline" onClick={handleShareToChat}>
                <Send className="h-4 w-4 mr-2" />
                Share to Chat
              </Button>
              <Button variant="outline" onClick={handleGenerate}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh All
              </Button>
            </div>
          </>
        )}

        {/* Empty State */}
        {!report && !isGenerating && (
          <div className="text-center py-12 rounded-xl border border-border bg-background-card">
            <FileText className="h-12 w-12 text-text-muted mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No thesis report yet
            </h3>
            <p className="text-text-secondary mb-4">
              Generate a morning thesis report for all your watchlist tickers
            </p>
            {tickers.length === 0 && (
              <p className="text-sm text-text-muted mb-4">
                Add tickers to your watchlist in Settings first
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
