'use client';

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { ArrowRight, Clock } from 'lucide-react';

// TODO: Fetch from /api/flow/options with unusual filter
interface UnusualTrade {
  time: string;
  ticker: string;
  strike: number;
  expiry: string;
  type: 'CALL' | 'PUT';
  premium: number;
  side: 'BUY' | 'SELL' | 'SWEEP';
  unusualScore: number;
}

// Mock data - replace with API call
const mockUnusualTrades: UnusualTrade[] = [
  {
    time: '14:32:15',
    ticker: 'SPY',
    strike: 450,
    expiry: '01/17',
    type: 'CALL',
    premium: 125000,
    side: 'SWEEP',
    unusualScore: 9.2,
  },
  {
    time: '14:28:42',
    ticker: 'QQQ',
    strike: 380,
    expiry: '01/19',
    type: 'PUT',
    premium: 89000,
    side: 'BUY',
    unusualScore: 8.7,
  },
  {
    time: '14:25:18',
    ticker: 'NVDA',
    strike: 520,
    expiry: '01/17',
    type: 'CALL',
    premium: 156000,
    side: 'SWEEP',
    unusualScore: 9.5,
  },
  {
    time: '14:21:55',
    ticker: 'TSLA',
    strike: 240,
    expiry: '01/19',
    type: 'PUT',
    premium: 112000,
    side: 'BUY',
    unusualScore: 8.3,
  },
  {
    time: '14:18:33',
    ticker: 'AAPL',
    strike: 195,
    expiry: '01/17',
    type: 'CALL',
    premium: 98000,
    side: 'SWEEP',
    unusualScore: 8.9,
  },
  {
    time: '14:15:07',
    ticker: 'AMD',
    strike: 145,
    expiry: '01/19',
    type: 'CALL',
    premium: 87000,
    side: 'BUY',
    unusualScore: 7.8,
  },
  {
    time: '14:12:41',
    ticker: 'MSFT',
    strike: 420,
    expiry: '01/17',
    type: 'PUT',
    premium: 103000,
    side: 'BUY',
    unusualScore: 8.1,
  },
  {
    time: '14:09:25',
    ticker: 'META',
    strike: 480,
    expiry: '01/19',
    type: 'CALL',
    premium: 134000,
    side: 'SWEEP',
    unusualScore: 9.0,
  },
  {
    time: '14:06:12',
    ticker: 'AMZN',
    strike: 155,
    expiry: '01/17',
    type: 'CALL',
    premium: 95000,
    side: 'BUY',
    unusualScore: 7.9,
  },
  {
    time: '14:03:48',
    ticker: 'GOOGL',
    strike: 145,
    expiry: '01/19',
    type: 'PUT',
    premium: 88000,
    side: 'SWEEP',
    unusualScore: 8.4,
  },
];

function formatPremium(premium: number): string {
  if (premium >= 1000000) {
    return `$${(premium / 1000000).toFixed(1)}M`;
  }
  return `$${(premium / 1000).toFixed(0)}K`;
}

export function UnusualOptionsActivity() {
  return (
    <Card className="p-6 lg:p-8 border-[rgba(255,255,255,0.06)] bg-background-card rounded-xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-text-primary">Today's Unusual Options Activity</h2>
      </div>

      {/* Delay Banner */}
      <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/20 flex items-center gap-2">
        <Clock className="h-4 w-4 text-warning" />
        <span className="text-sm text-warning">
          Viewing 30-min delayed data.{' '}
          <Link href="/pricing" className="underline hover:text-warning/80">
            Go Pro for real-time →
          </Link>
        </span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[rgba(255,255,255,0.06)]">
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Time
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Ticker
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Strike
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Expiry
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Type
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Premium
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Side
              </th>
              <th className="text-left py-3 px-4 text-xs text-[#6b7a99] uppercase tracking-wider font-medium">
                Score
              </th>
            </tr>
          </thead>
          <tbody>
            {mockUnusualTrades.map((trade, index) => (
              <tr
                key={index}
                className={cn(
                  'border-b border-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.02)] transition-colors',
                  trade.side === 'SWEEP' && 'bg-[rgba(255,193,7,0.05)]'
                )}
              >
                <td className="py-3 px-4 text-sm font-mono text-[#6b7a99]">{trade.time}</td>
                <td className="py-3 px-4 text-sm font-bold text-white">{trade.ticker}</td>
                <td className="py-3 px-4 text-sm font-mono text-white">${trade.strike}</td>
                <td className="py-3 px-4 text-sm font-mono text-[#6b7a99]">{trade.expiry}</td>
                <td className="py-3 px-4">
                  <Badge
                    className={cn(
                      'text-[10px] px-2 py-0.5',
                      trade.type === 'CALL' ? 'bg-bull/10 text-bull' : 'bg-bear/10 text-bear'
                    )}
                  >
                    {trade.type}
                  </Badge>
                </td>
                <td className="py-3 px-4 text-sm font-mono text-white">{formatPremium(trade.premium)}</td>
                <td className="py-3 px-4">
                  <Badge
                    className={cn(
                      'text-[10px] px-2 py-0.5',
                      trade.side === 'SWEEP' && 'bg-warning/20 text-warning border-warning/30',
                      trade.side === 'BUY' && 'bg-bull/10 text-bull',
                      trade.side === 'SELL' && 'bg-bear/10 text-bear'
                    )}
                  >
                    {trade.side}
                  </Badge>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.1)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#00e5ff] rounded-full"
                        style={{ width: `${(trade.unusualScore / 10) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-white w-8 text-right">
                      {trade.unusualScore.toFixed(1)}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div className="mt-6 pt-6 border-t border-[rgba(255,255,255,0.06)] text-center">
        <Link
          href="/pricing"
          className="text-sm text-[#00e5ff] hover:text-[#00b8d4] transition-colors inline-flex items-center gap-1"
        >
          See the full flow with AI analysis
          <ArrowRight className="h-3 w-3" />
          <span className="font-semibold">Try Pro Free for 7 Days</span>
        </Link>
      </div>
    </Card>
  );
}
