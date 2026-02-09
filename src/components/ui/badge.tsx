import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-accent text-background',
        secondary: 'border-transparent bg-background-elevated text-text-secondary',
        outline: 'border-border text-text-primary',
        // Trading-specific
        bullish: 'border-bull/20 bg-bull/10 text-bull',
        bearish: 'border-bear/20 bg-bear/10 text-bear',
        neutral: 'border-text-muted/20 bg-text-muted/10 text-text-muted',
        // Regime
        normal: 'border-bull/20 bg-bull/10 text-bull',
        elevated: 'border-warning/20 bg-warning/10 text-warning',
        crisis: 'border-bear/20 bg-bear/10 text-bear',
        // Verdict
        buy: 'border-transparent bg-bull text-white',
        sell: 'border-transparent bg-bear text-white',
        wait: 'border-transparent bg-warning text-background',
        hold: 'border-transparent bg-text-muted text-white',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
