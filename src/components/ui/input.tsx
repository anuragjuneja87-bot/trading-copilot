import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: React.ReactNode;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, icon, error, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted">
            {icon}
          </div>
        )}
        <input
          type={type}
          className={cn(
            'flex h-10 w-full rounded-md border border-border bg-background-surface px-3 py-2 text-sm text-text-primary',
            'placeholder:text-text-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            icon && 'pl-10',
            error && 'border-bear focus-visible:ring-bear',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && (
          <p className="mt-1 text-xs text-bear">{error}</p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';

export { Input };
