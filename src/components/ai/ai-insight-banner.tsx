'use client';

import { Sparkles, RefreshCw, AlertCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { COLORS } from '@/lib/echarts-theme';

interface AIInsightBannerProps {
  insight: string | null;
  isLoading: boolean;
  error: string | null;
  processingTime: number | null;
  onRefresh: () => void;
  regime?: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' | 'ACCUMULATION' | 'DISTRIBUTION' | null;
  title?: string;
  className?: string;
}

export function AIInsightBanner({
  insight,
  isLoading,
  error,
  processingTime,
  onRefresh,
  regime,
  title = 'AI INSIGHT',
  className,
}: AIInsightBannerProps) {
  // Determine regime color
  const getRegimeConfig = (regime: string | null | undefined) => {
    switch (regime) {
      case 'RISK_ON':
      case 'ACCUMULATION':
        return { bg: COLORS.glowGreen, border: 'rgba(0,230,118,0.3)', color: COLORS.green };
      case 'RISK_OFF':
      case 'DISTRIBUTION':
        return { bg: COLORS.glowRed, border: 'rgba(255,82,82,0.3)', color: COLORS.red };
      default:
        return { bg: 'rgba(255,193,7,0.1)', border: 'rgba(255,193,7,0.3)', color: COLORS.yellow };
    }
  };

  const regimeConfig = getRegimeConfig(regime);

  return (
    <div 
      className={cn(
        "rounded-xl p-4 relative overflow-hidden",
        className
      )}
      style={{ 
        background: COLORS.cardBg, 
        border: `1px solid ${COLORS.cardBorder}`,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: COLORS.cyan }} />
          <span 
            className="text-[10px] uppercase tracking-wider font-bold"
            style={{ color: '#2a4a5a', fontFamily: "'Oxanium', monospace" }}
          >
            {title}
          </span>
          {regime && (
            <span 
              className="text-[9px] font-bold px-2 py-0.5 rounded"
              style={{ 
                background: regimeConfig.bg, 
                color: regimeConfig.color,
                fontFamily: "'Oxanium', monospace"
              }}
            >
              {regime}
            </span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1.5 rounded-lg transition-all hover:bg-[rgba(255,255,255,0.05)] disabled:opacity-50"
          title="Refresh insight"
        >
          <RefreshCw 
            className={cn("w-3.5 h-3.5", isLoading && "animate-spin")} 
            style={{ color: '#4a6070' }}
          />
        </button>
      </div>

      {/* Content */}
      <div className="min-h-[60px]">
        {isLoading ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 space-y-2">
              <div 
                className="h-3 rounded animate-pulse"
                style={{ background: 'rgba(255,255,255,0.05)', width: '90%' }}
              />
              <div 
                className="h-3 rounded animate-pulse"
                style={{ background: 'rgba(255,255,255,0.05)', width: '75%' }}
              />
              <div 
                className="h-3 rounded animate-pulse"
                style={{ background: 'rgba(255,255,255,0.05)', width: '60%' }}
              />
            </div>
          </div>
        ) : error ? (
          <div className="flex items-center gap-2 text-[11px]" style={{ color: COLORS.red }}>
            <AlertCircle className="w-4 h-4" />
            <span>{error}</span>
          </div>
        ) : insight ? (
          <p 
            className="text-[12px] leading-relaxed"
            style={{ color: '#c5d0e6' }}
          >
            {insight}
          </p>
        ) : (
          <p 
            className="text-[11px]"
            style={{ color: '#4a6070' }}
          >
            No insight available. Click refresh to generate.
          </p>
        )}
      </div>

      {/* Footer */}
      {processingTime && !isLoading && (
        <div 
          className="flex items-center gap-1 mt-3 pt-2"
          style={{ borderTop: '1px solid rgba(255,255,255,0.03)' }}
        >
          <Clock className="w-3 h-3" style={{ color: '#4a6070' }} />
          <span className="text-[9px]" style={{ color: '#4a6070' }}>
            {(processingTime / 1000).toFixed(1)}s • Haiku
          </span>
        </div>
      )}

      {/* Decorative gradient line */}
      <div 
        className="absolute bottom-0 left-0 right-0 h-[2px]"
        style={{ 
          background: `linear-gradient(to right, ${COLORS.cyan}00, ${COLORS.cyan}40, ${COLORS.cyan}00)` 
        }}
      />
    </div>
  );
}
