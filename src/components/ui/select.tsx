'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, error, children, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          className={cn(
            'flex h-10 w-full appearance-none rounded-md border border-border bg-background-surface px-3 py-2 pr-8 text-sm text-text-primary',
            'placeholder:text-text-muted',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:border-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-bear focus-visible:ring-bear',
            className
          )}
          ref={ref}
          {...props}
        >
          {children}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 pointer-events-none text-text-muted" />
        {error && (
          <p className="mt-1 text-xs text-bear">{error}</p>
        )}
      </div>
    );
  }
);
Select.displayName = 'Select';

// For compatibility with shadcn/ui style API
export const SelectTrigger = React.forwardRef<HTMLSelectElement, SelectProps>(
  (props, ref) => <Select ref={ref} {...props} />
);
SelectTrigger.displayName = 'SelectTrigger';

export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  return <>{placeholder}</>;
};

export const SelectContent = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

export const SelectItem = ({ value, children, disabled, ...props }: { value: string; children: React.ReactNode; disabled?: boolean }) => {
  return (
    <option value={value} disabled={disabled} {...props}>
      {children}
    </option>
  );
};

export { Select };
