'use client';

import { Card } from '@/components/ui/card';
import { Lock, ArrowRight } from 'lucide-react';
import Link from 'next/link';

// TODO: Fetch from options flow API or gamma levels endpoint
interface KeyLevel {
  ticker: string;
  callWall: number;
  putWall: number;
  maxGamma: number;
}

// Mock data - replace with API call
const mockKeyLevels: KeyLevel[] = [
  {
    ticker: 'SPY',
    callWall: 450,
    putWall: 445,
    maxGamma: 448,
  },
  {
    ticker: 'QQQ',
    callWall: 380,
    putWall: 375,
    maxGamma: 378,
  },
];

export function KeyLevelsTeaser() {
  return (
    <Card className="p-6 lg:p-8 border-[rgba(255,255,255,0.06)] bg-background-card rounded-xl">
      <h2 className="text-2xl font-bold text-text-primary mb-6">Key Levels</h2>

      {/* Visible Levels - SPY and QQQ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {mockKeyLevels.map((level) => (
          <div
            key={level.ticker}
            className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-bold text-white">{level.ticker}</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#6b7a99]">Call Wall</span>
                <span className="text-sm font-mono font-semibold text-bull">${level.callWall}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#6b7a99]">Put Wall</span>
                <span className="text-sm font-mono font-semibold text-bear">${level.putWall}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-[#6b7a99]">Max Gamma</span>
                <span className="text-sm font-mono font-semibold text-[#00e5ff]">${level.maxGamma}</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Locked Section */}
      <div className="relative rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-6 overflow-hidden">
        {/* Blur overlay */}
        <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center flex-col gap-3">
          <Lock className="h-8 w-8 text-[#6b7a99]" />
          <div className="text-center">
            <p className="text-sm font-semibold text-white mb-1">
              Key levels for NVDA, AAPL, TSLA, AMZN and 3,500+ tickers
            </p>
            <p className="text-xs text-[#6b7a99]">Unlock with Pro subscription</p>
          </div>
        </div>

        {/* Blurred content underneath */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 opacity-30 blur-sm">
          {['NVDA', 'AAPL', 'TSLA', 'AMZN'].map((ticker) => (
            <div key={ticker} className="rounded-lg border border-[rgba(255,255,255,0.06)] bg-background-surface p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold text-white">{ticker}</h3>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#6b7a99]">Call Wall</span>
                  <span className="text-sm font-mono font-semibold text-bull">$XXX</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#6b7a99]">Put Wall</span>
                  <span className="text-sm font-mono font-semibold text-bear">$XXX</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-[#6b7a99]">Max Gamma</span>
                  <span className="text-sm font-mono font-semibold text-[#00e5ff]">$XXX</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="mt-6 text-center">
        <Link
          href="/pricing"
          className="text-sm text-[#00e5ff] hover:text-[#00b8d4] transition-colors inline-flex items-center gap-1"
        >
          Unlock all key levels
          <ArrowRight className="h-3 w-3" />
          <span className="font-semibold">See Pricing</span>
        </Link>
      </div>
    </Card>
  );
}
