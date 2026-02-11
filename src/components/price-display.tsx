'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PriceDisplayProps {
  price: number;
  previousPrice?: number;
  className?: string;
}

export function PriceDisplay({ 
  price, 
  previousPrice,
  className
}: PriceDisplayProps) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (previousPrice !== undefined && price !== previousPrice) {
      setFlash(price > previousPrice ? 'up' : 'down');
      const timeout = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timeout);
    }
  }, [price, previousPrice]);

  return (
    <span 
      className={cn(
        'transition-all duration-300 font-mono px-1 rounded',
        flash === 'up' && 'text-bull bg-bull/20',
        flash === 'down' && 'text-bear bg-bear/20',
        className
      )}
    >
      ${price.toFixed(2)}
    </span>
  );
}
