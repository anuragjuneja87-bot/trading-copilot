'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface FearGreedData {
  score: number;
  label: string;
  components?: {
    vix?: number;
    putCallRatio?: number;
    breadth?: number;
    momentum?: number;
  };
}

interface FearGreedGaugeProps {
  size?: 'small' | 'medium' | 'large';
  hideDetails?: boolean;
  className?: string;
}

export function FearGreedGauge({ size = 'medium', hideDetails = false, className }: FearGreedGaugeProps) {
  const [data, setData] = useState<FearGreedData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFearGreed = async () => {
      try {
        const res = await fetch('/api/market-pulse');
        const json = await res.json();
        
        if (json.success && json.data?.fearGreedIndex) {
          setData({
            score: json.data.fearGreedIndex.score,
            label: json.data.fearGreedIndex.label,
            components: json.data.fearGreedIndex.components,
          });
        } else {
          // Fallback: calculate from VIX if fearGreedIndex not available
          const vix = json.data?.vix?.value || 20;
          const score = calculateFromVix(vix);
          setData({
            score,
            label: getLabel(score),
          });
        }
      } catch (err) {
        console.error('[FearGreed] Fetch error:', err);
        // Default to neutral on error
        setData({ score: 50, label: 'NEUTRAL' });
      } finally {
        setLoading(false);
      }
    };

    fetchFearGreed();
    
    // Refresh every 60 seconds
    const interval = setInterval(fetchFearGreed, 60000);
    return () => clearInterval(interval);
  }, []);

  // Fallback calculation from VIX only
  const calculateFromVix = (vix: number): number => {
    // VIX 10 = Extreme Greed (90), VIX 40 = Extreme Fear (10)
    const score = Math.max(0, Math.min(100, 100 - ((vix - 10) / 30) * 90));
    return Math.round(score);
  };

  const getLabel = (score: number): string => {
    if (score <= 20) return 'EXTREME_FEAR';
    if (score <= 40) return 'FEAR';
    if (score <= 60) return 'NEUTRAL';
    if (score <= 80) return 'GREED';
    return 'EXTREME_GREED';
  };

  const getColor = (score: number): string => {
    if (score <= 20) return '#ff5252';
    if (score <= 40) return '#ff7043';
    if (score <= 60) return '#ffa726';
    if (score <= 80) return '#66bb6a';
    return '#00e676';
  };

  if (loading) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <div className="w-16 h-16 rounded-full bg-white/5 animate-pulse" />
      </div>
    );
  }

  const score = data?.score ?? 50;
  const label = data?.label ?? 'NEUTRAL';
  const color = getColor(score);
  const displayLabel = label.replace(/_/g, ' ');

  // Size configurations
  const sizeConfig = {
    small: {
      svgSize: 120,
      fontSize: 18,
      textSize: 'text-[10px]',
      containerClass: 'w-full max-w-[140px]',
    },
    medium: {
      svgSize: 200,
      fontSize: 28,
      textSize: 'text-sm',
      containerClass: 'w-full max-w-md',
    },
    large: {
      svgSize: 280,
      fontSize: 36,
      textSize: 'text-base',
      containerClass: 'w-full max-w-lg',
    },
  };

  const config = sizeConfig[size];

  // Small version for sidebar
  if (size === 'small') {
    return (
      <div className={cn("w-full", className)}>
        <div className="relative" style={{ width: config.svgSize, height: config.svgSize * 0.6, margin: '0 auto' }}>
          <svg viewBox="0 0 200 120" className="w-full h-full">
            <defs>
              <linearGradient id={`gaugeGradient-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff5252" />
                <stop offset="50%" stopColor="#ffa726" />
                <stop offset="100%" stopColor="#00e676" />
              </linearGradient>
            </defs>
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke={`url(#gaugeGradient-${size})`}
              strokeWidth="12"
              strokeLinecap="round"
            />
            <g transform={`translate(100, 100) rotate(${(score / 100) * 180 - 90})`}>
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="-70"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="0" cy="0" r="4" fill={color} />
            </g>
          </svg>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
            <div className="font-bold" style={{ color, fontSize: config.fontSize }}>
              {score}
            </div>
            <div className={cn('text-[#6b7a99] mt-0.5', config.textSize)}>{displayLabel}</div>
          </div>
        </div>
      </div>
    );
  }

  // Full version with details
  return (
    <div className={cn("p-6 lg:p-8 border-[rgba(255,255,255,0.06)] bg-background-card rounded-xl", className)}>
      <h2 className="text-2xl font-bold text-text-primary mb-6">Market Sentiment</h2>

      {/* Gauge */}
      <div className="flex justify-center mb-8">
        <div className={cn('relative', config.containerClass)}>
          <svg viewBox="0 0 200 120" className="w-full">
            <defs>
              <linearGradient id={`gaugeGradient-${size}`} x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#ff5252" />
                <stop offset="50%" stopColor="#ffa726" />
                <stop offset="100%" stopColor="#00e676" />
              </linearGradient>
            </defs>
            <path
              d="M 20 100 A 80 80 0 0 1 180 100"
              fill="none"
              stroke={`url(#gaugeGradient-${size})`}
              strokeWidth="12"
              strokeLinecap="round"
            />
            <g transform={`translate(100, 100) rotate(${(score / 100) * 180 - 90})`}>
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="-70"
                stroke={color}
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="0" cy="0" r="4" fill={color} />
            </g>
          </svg>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-center">
            <div className="font-bold" style={{ color, fontSize: config.fontSize }}>
              {score}
            </div>
            <div className={cn('text-[#6b7a99] mt-1', config.textSize)}>{displayLabel}</div>
          </div>
        </div>
      </div>

      {!hideDetails && data?.components && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {data.components.vix !== undefined && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">VIX Level</div>
              <div className="text-lg font-bold text-white">{data.components.vix.toFixed(2)}</div>
            </div>
          )}
          {data.components.putCallRatio !== undefined && (
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">Put/Call Ratio</div>
              <div className="text-lg font-bold text-white">{data.components.putCallRatio.toFixed(2)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
