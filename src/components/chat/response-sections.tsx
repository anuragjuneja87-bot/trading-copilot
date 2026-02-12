'use client';

import { ParsedResponse } from '@/lib/chat-utils';
import { Badge } from '@/components/ui/badge';
import { Copy, Pin, RefreshCw, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { pinInsight } from '@/lib/chat-utils';
import { MarkdownRenderer } from './markdown-renderer';

interface ResponseSectionsProps {
  parsed: ParsedResponse;
  analysisDepth: 'quick' | 'analysis' | 'full';
  onGoDeeper?: () => void;
  onFollowUp?: (prompt: string) => void;
  className?: string;
}

export function ResponseSections({ parsed, analysisDepth, onGoDeeper, onFollowUp, className }: ResponseSectionsProps) {
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(false);

  const handleCopy = async () => {
    const fullText = [
      parsed.snapshot && `Snapshot: ${JSON.stringify(parsed.snapshot)}`,
      parsed.verdict && `Verdict: ${parsed.verdict.type}`,
      parsed.analysis,
      parsed.deepAnalysis && `Deep Analysis: ${parsed.deepAnalysis}`,
    ].filter(Boolean).join('\n\n');

    try {
      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handlePin = () => {
    const fullText = [
      parsed.verdict && `Verdict: ${parsed.verdict.type}`,
      parsed.verdict?.entry && `Entry: ${parsed.verdict.entry}`,
      parsed.verdict?.target && `Target: ${parsed.verdict.target}`,
      parsed.verdict?.stop && `Stop: ${parsed.verdict.stop}`,
    ].filter(Boolean).join(' | ');

    pinInsight(fullText);
    setPinned(true);
    setTimeout(() => setPinned(false), 2000);
  };

  const handleGoDeeper = () => {
    if (onGoDeeper) onGoDeeper();
  };

  const handleFollowUp = () => {
    if (onFollowUp) {
      onFollowUp('Based on the above analysis, what if...');
    }
  };

  return (
    <div className={cn('space-y-4', className)}>
      {/* Section A: Snapshot */}
      {parsed.snapshot && (
        <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.03)] p-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:flex-wrap items-start sm:items-center gap-2 sm:gap-3">
            {/* Ticker and Price on first row */}
            <div className="flex items-center gap-3">
              {parsed.snapshot.ticker && (
                <div className="font-mono font-bold text-text-primary text-sm sm:text-base">{parsed.snapshot.ticker}</div>
              )}
              {parsed.snapshot.price && (
                <div className="font-mono text-text-primary text-sm sm:text-base">
                  ${parsed.snapshot.price.toFixed(2)}
                  {parsed.snapshot.changePercent && (
                    <span className={cn(
                      'ml-2',
                      parsed.snapshot.changePercent >= 0 ? 'text-bull' : 'text-bear'
                    )}>
                      {parsed.snapshot.changePercent >= 0 ? '+' : ''}{parsed.snapshot.changePercent.toFixed(2)}%
                    </span>
                  )}
                </div>
              )}
            </div>
            {/* Levels grouped together */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              {parsed.snapshot.callWall && (
                <div className="text-xs">
                  <span className="text-text-muted">Call Wall:</span>
                  <span className="ml-1 font-mono text-bull">${parsed.snapshot.callWall}</span>
                </div>
              )}
              {parsed.snapshot.putWall && (
                <div className="text-xs">
                  <span className="text-text-muted">Put Wall:</span>
                  <span className="ml-1 font-mono text-bear">${parsed.snapshot.putWall}</span>
                </div>
              )}
              {parsed.snapshot.maxGamma && (
                <div className="text-xs">
                  <span className="text-text-muted">Max Gamma:</span>
                  <span className="ml-1 font-mono text-accent">${parsed.snapshot.maxGamma}</span>
                </div>
              )}
              {parsed.snapshot.regime && (
                <Badge
                  variant={parsed.snapshot.regime === 'CRISIS' ? 'crisis' : parsed.snapshot.regime === 'ELEVATED' ? 'elevated' : 'normal'}
                  className="text-[10px] px-2 py-0.5"
                >
                  {parsed.snapshot.regime}
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Section B: Verdict */}
      {parsed.verdict && (
        <div className="space-y-3 animate-fade-in" style={{ animationDelay: '200ms' }}>
          <div className="flex items-center gap-3">
            <Badge
              className={cn(
                'text-lg px-4 py-2 font-bold',
                parsed.verdict.type === 'BUY' && 'bg-bull/20 text-bull border-bull/30',
                parsed.verdict.type === 'SELL' && 'bg-bear/20 text-bear border-bear/30',
                parsed.verdict.type === 'WAIT' && 'bg-warning/20 text-warning border-warning/30',
                (parsed.verdict.type === 'HOLD' || parsed.verdict.type === 'NEUTRAL') && 'bg-text-muted/20 text-text-muted border-text-muted/30'
              )}
            >
              {parsed.verdict.type}
            </Badge>
          </div>

          {parsed.verdict.reasoning && (
            <p className="text-sm text-text-secondary leading-relaxed">{parsed.verdict.reasoning}</p>
          )}

          {(parsed.verdict.entry || parsed.verdict.target || parsed.verdict.stop || parsed.verdict.invalidates) && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-3 space-y-2">
              {parsed.verdict.entry && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-text-muted">Entry:</span>
                  <span className="text-sm font-mono font-semibold text-text-primary">{parsed.verdict.entry}</span>
                </div>
              )}
              {parsed.verdict.target && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-text-muted">Target:</span>
                  <span className="text-sm font-mono font-semibold text-bull">{parsed.verdict.target}</span>
                </div>
              )}
              {parsed.verdict.stop && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-text-muted">Stop:</span>
                  <span className="text-sm font-mono font-semibold text-bear">{parsed.verdict.stop}</span>
                </div>
              )}
              {parsed.verdict.invalidates && (
                <div className="flex justify-between items-start">
                  <span className="text-xs text-text-muted">Invalidates if:</span>
                  <span className="text-xs text-text-secondary text-right max-w-[70%]">{parsed.verdict.invalidates}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section C: Analysis */}
      {parsed.analysis && (
        <div className="animate-fade-in" style={{ animationDelay: '400ms' }}>
          <MarkdownRenderer content={parsed.analysis} className="text-sm" />
        </div>
      )}

      {/* Section D: Deep Analysis (only for full mode) */}
      {analysisDepth === 'full' && parsed.deepAnalysis && (
        <div className="space-y-2 animate-fade-in" style={{ animationDelay: '600ms' }}>
          <div className="flex items-center gap-2 pt-4 border-t border-[rgba(255,255,255,0.06)]">
            <span className="text-[11px] uppercase tracking-wider text-accent font-semibold">🧠 DEEP ANALYSIS</span>
          </div>
          <div className="rounded-lg bg-[rgba(0,229,255,0.02)] border border-[rgba(0,229,255,0.06)] p-4">
            <MarkdownRenderer content={parsed.deepAnalysis} className="text-sm" />
          </div>
        </div>
      )}

      {/* Response Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-[rgba(255,255,255,0.06)] animate-fade-in flex-wrap">
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)] transition-colors border border-transparent hover:border-[rgba(255,255,255,0.06)] min-h-[32px]',
            copied && 'text-accent'
          )}
        >
          <Copy className="h-3 w-3" />
          <span className="hidden sm:inline">{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button
          onClick={handlePin}
          className={cn(
            'flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)] transition-colors border border-transparent hover:border-[rgba(255,255,255,0.06)] min-h-[32px]',
            pinned && 'text-accent'
          )}
        >
          <Pin className="h-3 w-3" />
          <span className="hidden sm:inline">{pinned ? 'Pinned' : 'Pin'}</span>
        </button>
        {analysisDepth !== 'full' && onGoDeeper && (
          <button
            onClick={handleGoDeeper}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)] transition-colors border border-transparent hover:border-[rgba(255,255,255,0.06)] min-h-[32px]"
          >
            <RefreshCw className="h-3 w-3" />
            <span className="hidden sm:inline">Go Deeper</span>
          </button>
        )}
        {onFollowUp && (
          <button
            onClick={handleFollowUp}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded text-xs text-text-muted hover:text-text-primary hover:bg-[rgba(255,255,255,0.04)] transition-colors border border-transparent hover:border-[rgba(255,255,255,0.06)] min-h-[32px]"
          >
            <MessageSquare className="h-3 w-3" />
            <span className="hidden sm:inline">Follow Up</span>
          </button>
        )}
      </div>
    </div>
  );
}

