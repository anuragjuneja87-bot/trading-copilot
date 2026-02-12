'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';

interface ChatHeaderProps {
  ticker?: string;
  verdict?: 'BUY' | 'SELL' | 'WAIT' | 'HOLD' | 'NEUTRAL';
  onNewChat: () => void;
}

export function ChatHeader({ ticker, verdict, onNewChat }: ChatHeaderProps) {
  const { data: priceData } = useQuery({
    queryKey: ['price', ticker],
    queryFn: async () => {
      if (!ticker) return null;
      const res = await fetch(`/api/market/prices?tickers=${ticker}`);
      const data = await res.json();
      return data.data?.prices?.[0];
    },
    enabled: !!ticker,
    refetchInterval: 10000,
  });

  if (!ticker && !verdict) return null;

  return (
    <div className="sticky top-0 z-10 h-11 flex items-center justify-between px-4 border-b border-[rgba(255,255,255,0.06)] bg-background/80 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        {ticker && (
          <>
            <span className="font-mono font-semibold text-text-primary">{ticker}</span>
            {priceData && (
              <span className="text-sm font-mono text-text-secondary">
                ${priceData.price.toFixed(2)}
                {priceData.changePercent && (
                  <span className={cn(
                    'ml-2',
                    priceData.changePercent >= 0 ? 'text-bull' : 'text-bear'
                  )}>
                    {priceData.changePercent >= 0 ? '+' : ''}{priceData.changePercent.toFixed(2)}%
                  </span>
                )}
              </span>
            )}
          </>
        )}
        {verdict && (
          <Badge
            className={cn(
              'text-xs px-2 py-0.5',
              verdict === 'BUY' && 'bg-bull/20 text-bull border-bull/30',
              verdict === 'SELL' && 'bg-bear/20 text-bear border-bear/30',
              verdict === 'WAIT' && 'bg-warning/20 text-warning border-warning/30',
              (verdict === 'HOLD' || verdict === 'NEUTRAL') && 'bg-text-muted/20 text-text-muted border-text-muted/30'
            )}
          >
            {verdict}
          </Badge>
        )}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onNewChat}
        className="h-8 text-xs"
      >
        <MessageSquare className="h-3 w-3 mr-1" />
        New Chat
      </Button>
    </div>
  );
}
