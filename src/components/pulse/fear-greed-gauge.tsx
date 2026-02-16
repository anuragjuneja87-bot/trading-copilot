'use client';

import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface Price {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

interface RegimeData {
  status: 'normal' | 'elevated' | 'crisis';
  vixLevel: number;
}

interface FearGreedGaugeProps {
  size?: 'small' | 'medium' | 'large';
  hideDetails?: boolean;
}

// TODO: Calculate Fear & Greed Index from real data
// Components: VIX, Put/Call Ratio, Market Breadth, Options GEX, Unusual Flow
function calculateFearGreedIndex(vix?: number, putCallRatio?: number): number {
  // Mock calculation - replace with real logic
  if (!vix) return 50;
  
  // VIX component (0-20 points)
  let vixScore = 0;
  if (vix < 15) vixScore = 20; // Low VIX = Greed
  else if (vix < 20) vixScore = 15;
  else if (vix < 25) vixScore = 10;
  else if (vix < 30) vixScore = 5;
  else vixScore = 0; // High VIX = Fear

  // Put/Call Ratio component (0-20 points)
  let pcScore = 0;
  if (putCallRatio && putCallRatio < 0.7) pcScore = 20; // Low P/C = Greed
  else if (putCallRatio && putCallRatio < 0.85) pcScore = 15;
  else if (putCallRatio && putCallRatio < 1.0) pcScore = 10;
  else if (putCallRatio && putCallRatio < 1.2) pcScore = 5;
  else pcScore = 0; // High P/C = Fear

  // Market Breadth (mock - TODO: fetch from API)
  const breadthScore = 12; // 60% stocks above 50-day MA

  // Options GEX (mock - TODO: fetch from options flow API)
  const gexScore = 10; // Positive GEX

  // Unusual Flow (mock - TODO: calculate from options flow)
  const flowScore = 8; // Moderate unusual activity

  return Math.round((vixScore + pcScore + breadthScore + gexScore + flowScore) / 5);
}

export function FearGreedGauge({ size = 'medium', hideDetails = false }: FearGreedGaugeProps) {
  // Fetch VIX
  const { data: pricesData } = useQuery<{ prices: Price[] }>({
    queryKey: ['prices', ['VIX']],
    queryFn: async () => {
      const res = await fetch('/api/market/prices?tickers=VIX');
      const data = await res.json();
      return data.data;
    },
    refetchInterval: 30000,
  });

  const vix = pricesData?.prices?.find((p) => p.ticker === 'VIX')?.price || 26.12;
  const putCallRatio = 0.85; // TODO: Fetch from API
  const fearGreedIndex = calculateFearGreedIndex(vix, putCallRatio);

  // Determine label and color
  const getLabel = (index: number) => {
    if (index >= 75) return { label: 'Extreme Greed', color: '#00e676' };
    if (index >= 55) return { label: 'Greed', color: '#66bb6a' };
    if (index >= 45) return { label: 'Neutral', color: '#ffa726' };
    if (index >= 25) return { label: 'Fear', color: '#ff7043' };
    return { label: 'Extreme Fear', color: '#ff5252' };
  };

  const { label, color } = getLabel(fearGreedIndex);
  const angle = (fearGreedIndex / 100) * 180 - 90; // -90 to 90 degrees

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
      <div className="w-full">
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
            <g transform={`translate(100, 100) rotate(${angle})`}>
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
              {fearGreedIndex}
            </div>
            <div className={cn('text-[#6b7a99] mt-0.5', config.textSize)}>{label}</div>
          </div>
        </div>
      </div>
    );
  }

  // Full version with details
  return (
    <Card className="p-6 lg:p-8 border-[rgba(255,255,255,0.06)] bg-background-card rounded-xl">
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
            <g transform={`translate(100, 100) rotate(${angle})`}>
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
              {fearGreedIndex}
            </div>
            <div className={cn('text-[#6b7a99] mt-1', config.textSize)}>{label}</div>
          </div>
        </div>
      </div>

      {!hideDetails && (
        <>
          {/* Component Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {/* VIX Level */}
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">VIX Level</div>
              <div className="text-lg font-bold text-white mb-1">{vix.toFixed(2)}</div>
              <Badge
                className={cn(
                  'text-[10px] px-2 py-0.5',
                  vix > 25 ? 'bg-bear/10 text-bear' : vix < 15 ? 'bg-bull/10 text-bull' : 'bg-warning/10 text-warning'
                )}
              >
                {vix > 25 ? 'Elevated' : vix < 15 ? 'Low' : 'Normal'}
              </Badge>
            </div>

            {/* Put/Call Ratio */}
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">Put/Call Ratio</div>
              <div className="text-lg font-bold text-white">{putCallRatio.toFixed(2)}</div>
              <div className="text-[10px] text-[#6b7a99] mt-1">
                {putCallRatio > 1.0 ? 'Bearish' : putCallRatio < 0.7 ? 'Bullish' : 'Neutral'}
              </div>
            </div>

            {/* Market Breadth */}
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">Market Breadth</div>
              <div className="text-lg font-bold text-white">60%</div>
              <div className="text-[10px] text-[#6b7a99] mt-1">Above 50-day MA</div>
            </div>

            {/* Options GEX */}
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">Options GEX</div>
              <div className="text-lg font-bold text-bull">Positive</div>
              <div className="text-[10px] text-[#6b7a99] mt-1">$2.5B</div>
            </div>

            {/* Unusual Flow Score */}
            <div className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-3">
              <div className="text-xs text-[#6b7a99] mb-1">Unusual Flow</div>
              <div className="text-lg font-bold text-warning">Moderate</div>
              <div className="text-[10px] text-[#6b7a99] mt-1">Score: 6.2/10</div>
            </div>
          </div>

          {/* CTA */}
          <div className="text-center pt-4 border-t border-[rgba(255,255,255,0.06)]">
            <Link
              href="/pricing"
              className="text-sm text-[#00e5ff] hover:text-[#00b8d4] transition-colors inline-flex items-center gap-1"
            >
              Want real-time GEX levels for 3,500+ tickers?
              <ArrowRight className="h-3 w-3" />
              <span className="font-semibold">Go Pro</span>
            </Link>
          </div>
        </>
      )}
    </Card>
  );
}
