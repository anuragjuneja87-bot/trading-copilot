'use client';

import { useState } from 'react';
import { MarkdownRenderer } from '@/components/chat/markdown-renderer';
import { ParsedResponse } from '@/lib/chat-utils';
import { Copy, Pin, RefreshCw, MessageSquare, Bell, Scale } from 'lucide-react';
import { cn } from '@/lib/utils';
import { pinInsight } from '@/lib/chat-utils';

interface AnalysisResponseProps {
  parsed: ParsedResponse;
  rawContent: string;
  ticker?: string;
  onGoDeeper?: () => void;
  onFollowUp?: (query: string) => void;
  onNewAnalysis?: () => void;
}

export function AnalysisResponse({
  parsed,
  rawContent,
  ticker,
  onGoDeeper,
  onFollowUp,
  onNewAnalysis,
}: AnalysisResponseProps) {
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(rawContent);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handlePin = () => {
    const summary = [
      parsed.verdict && `Verdict: ${parsed.verdict.type}`,
      parsed.verdict?.entry && `Entry: ${parsed.verdict.entry}`,
      parsed.verdict?.target && `Target: ${parsed.verdict.target}`,
      parsed.verdict?.stop && `Stop: ${parsed.verdict.stop}`,
    ]
      .filter(Boolean)
      .join(' | ');

    pinInsight(summary);
    setPinned(true);
    setTimeout(() => setPinned(false), 2000);
  };

  const getVerdictColor = (type?: string) => {
    switch (type) {
      case 'BUY':
        return { bg: 'rgba(0,230,118,0.15)', border: 'rgba(0,230,118,0.3)', text: '#00e676', badge: '#00e676' };
      case 'SELL':
        return { bg: 'rgba(255,82,82,0.15)', border: 'rgba(255,82,82,0.3)', text: '#ff5252', badge: '#ff5252' };
      case 'WAIT':
        return { bg: 'rgba(255,193,7,0.15)', border: 'rgba(255,193,7,0.3)', text: '#ffc107', badge: '#ffc107' };
      default:
        return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: '#8b99b0', badge: '#8b99b0' };
    }
  };

  const colors = getVerdictColor(parsed.verdict?.type);

  // Generate follow-up suggestions
  const followUps = ticker
    ? [
        `What happens if ${ticker} breaks below the ${parsed.snapshot?.putWall ? `$${parsed.snapshot.putWall}` : 'put wall'}?`,
        `Show me ${ticker}'s ${new Date().toLocaleString('en-US', { month: 'long' })} performance historically`,
        `Compare ${ticker} flow vs SPY flow today`,
      ]
    : [
        'What are the top bullish setups right now?',
        'Show me the highest conviction flow',
        'Analyze market regime and positioning',
      ];

  return (
    <div className="space-y-6">
      {/* New Analysis Button */}
      {onNewAnalysis && (
        <div className="flex justify-end">
          <button
            onClick={onNewAnalysis}
            className="text-sm text-[#8b99b0] hover:text-white transition-colors flex items-center gap-1"
          >
            <span>←</span>
            <span>New Analysis</span>
          </button>
        </div>
      )}

      {/* Snapshot Metrics Bar */}
      {parsed.snapshot && (
        <div className="flex flex-wrap gap-3">
          {parsed.snapshot.ticker && (
            <div
              className="px-3 py-2 rounded"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="text-[9px] text-[#4a6070] mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>
                Ticker
              </div>
              <div className="text-base font-bold text-white" style={{ fontFamily: "'Oxanium', monospace" }}>
                {parsed.snapshot.ticker}
                {parsed.snapshot.price && (
                  <>
                    {' '}
                    <span className="text-sm">${parsed.snapshot.price.toFixed(2)}</span>
                    {parsed.snapshot.changePercent !== undefined && (
                      <span
                        className="text-sm ml-2"
                        style={{ color: parsed.snapshot.changePercent >= 0 ? '#00e676' : '#ff5252' }}
                      >
                        {parsed.snapshot.changePercent >= 0 ? '+' : ''}
                        {parsed.snapshot.changePercent.toFixed(2)}%
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
          {parsed.snapshot.callWall && (
            <div
              className="px-3 py-2 rounded"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="text-[9px] text-[#4a6070] mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>
                Call Wall
              </div>
              <div className="text-base font-bold text-[#00e676]" style={{ fontFamily: "'Oxanium', monospace" }}>
                ${parsed.snapshot.callWall.toFixed(0)}
              </div>
            </div>
          )}
          {parsed.snapshot.putWall && (
            <div
              className="px-3 py-2 rounded"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="text-[9px] text-[#4a6070] mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>
                Put Wall
              </div>
              <div className="text-base font-bold text-[#ff5252]" style={{ fontFamily: "'Oxanium', monospace" }}>
                ${parsed.snapshot.putWall.toFixed(0)}
              </div>
            </div>
          )}
          {parsed.snapshot.maxGamma && (
            <div
              className="px-3 py-2 rounded"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="text-[9px] text-[#4a6070] mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>
                Max Gamma
              </div>
              <div className="text-base font-bold text-[#00e5ff]" style={{ fontFamily: "'Oxanium', monospace" }}>
                ${parsed.snapshot.maxGamma.toFixed(0)}
              </div>
            </div>
          )}
          {parsed.snapshot.regime && (
            <div
              className="px-3 py-2 rounded"
              style={{
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
              }}
            >
              <div className="text-[9px] text-[#4a6070] mb-1" style={{ fontFamily: "'Oxanium', monospace" }}>
                Regime
              </div>
              <div
                className="text-base font-bold"
                style={{
                  color:
                    parsed.snapshot.regime === 'CRISIS'
                      ? '#ff5252'
                      : parsed.snapshot.regime === 'ELEVATED'
                      ? '#ffc107'
                      : '#00e676',
                  fontFamily: "'Oxanium', monospace",
                }}
              >
                {parsed.snapshot.regime}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Verdict Banner */}
      {parsed.verdict && (
        <div
          className="p-4 rounded-lg"
          style={{
            background: colors.bg,
            border: `1px solid ${colors.border}`,
          }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <span
                className="px-4 py-2 rounded font-bold text-sm"
                style={{
                  background: colors.badge,
                  color: '#0a0f1a',
                  fontFamily: "'Oxanium', monospace",
                  letterSpacing: '1px',
                }}
              >
                {parsed.verdict.type}
              </span>
              {parsed.verdict.reasoning && (
                <span className="text-sm text-white">{parsed.verdict.reasoning}</span>
              )}
            </div>
            <div className="flex items-center gap-4 text-xs">
              {parsed.verdict.entry && (
                <div>
                  <span className="text-[#4a6070]">Entry: </span>
                  <span className="text-white font-mono">{parsed.verdict.entry}</span>
                </div>
              )}
              {parsed.verdict.target && (
                <div>
                  <span className="text-[#4a6070]">Target: </span>
                  <span className="text-[#00e676] font-mono">{parsed.verdict.target}</span>
                </div>
              )}
              {parsed.verdict.stop && (
                <div>
                  <span className="text-[#4a6070]">Stop: </span>
                  <span className="text-[#ff5252] font-mono">{parsed.verdict.stop}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analysis Prose */}
      {parsed.analysis && (
        <div>
          <MarkdownRenderer content={parsed.analysis} className="text-sm" />
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap pt-4 border-t border-[rgba(255,255,255,0.06)]">
        <button
          onClick={handleCopy}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors',
            'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]',
            'text-[#8b99b0] hover:text-white hover:bg-[rgba(0,229,255,0.06)]',
            copied && 'text-[#00e5ff]'
          )}
        >
          <Copy className="h-3 w-3" />
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
        <button
          onClick={handlePin}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors',
            'bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)]',
            'text-[#8b99b0] hover:text-white hover:bg-[rgba(0,229,255,0.06)]',
            pinned && 'text-[#00e5ff]'
          )}
        >
          <Pin className="h-3 w-3" />
          <span>{pinned ? 'Pinned' : 'Pin Insight'}</span>
        </button>
        {onGoDeeper && (
          <button
            onClick={onGoDeeper}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] text-[#8b99b0] hover:text-white hover:bg-[rgba(0,229,255,0.06)]"
          >
            <RefreshCw className="h-3 w-3" />
            <span>Go Deeper</span>
          </button>
        )}
        {ticker && (
          <button
            onClick={() => onFollowUp?.(`Alert me when ${ticker} reaches $${parsed.verdict?.target || parsed.snapshot?.callWall || 0}`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] text-[#8b99b0] hover:text-white hover:bg-[rgba(0,229,255,0.06)]"
          >
            <Bell className="h-3 w-3" />
            <span>Alert at ${parsed.verdict?.target || parsed.snapshot?.callWall || 0}</span>
          </button>
        )}
        {ticker && (
          <button
            onClick={() => onFollowUp?.(`Compare ${ticker} with SPY`)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] transition-colors bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.05)] text-[#8b99b0] hover:text-white hover:bg-[rgba(0,229,255,0.06)]"
          >
            <Scale className="h-3 w-3" />
            <span>Compare with SPY</span>
          </button>
        )}
      </div>

      {/* Suggested Follow-ups */}
      {followUps.length > 0 && (
        <div>
          <div
            className="text-[9px] uppercase tracking-wider mb-3"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace", fontWeight: 700 }}
          >
            SUGGESTED FOLLOW-UPS
          </div>
          <div className="space-y-2">
            {followUps.map((followUp, idx) => (
              <button
                key={idx}
                onClick={() => onFollowUp?.(followUp)}
                className="w-full text-left p-3 rounded transition-colors hover:bg-[rgba(0,229,255,0.06)]"
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[#00e5ff]">→</span>
                  <span className="text-sm text-[#8b99b0]">{followUp}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
