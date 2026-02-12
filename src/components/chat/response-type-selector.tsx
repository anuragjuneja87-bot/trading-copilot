'use client';

import { Zap, BarChart3, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnalysisDepth, getAnalysisDepthPreference, setAnalysisDepthPreference } from '@/lib/chat-utils';
import { useEffect, useState } from 'react';

interface ResponseTypeSelectorProps {
  value: AnalysisDepth;
  onChange: (value: AnalysisDepth) => void;
  className?: string;
}

export function ResponseTypeSelector({ value, onChange, className }: ResponseTypeSelectorProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Load preference on mount
    const preference = getAnalysisDepthPreference();
    if (preference !== value) {
      onChange(preference);
    }
  }, []);

  const handleChange = (newValue: AnalysisDepth) => {
    onChange(newValue);
    setAnalysisDepthPreference(newValue);
  };

  if (!mounted) {
    // Prevent hydration mismatch
    return (
      <div className={cn('flex gap-2', className)}>
        <div className="h-9 w-24 bg-background-elevated rounded-lg animate-pulse" />
        <div className="h-9 w-24 bg-background-elevated rounded-lg animate-pulse" />
        <div className="h-9 w-24 bg-background-elevated rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <button
        onClick={() => handleChange('quick')}
        className={cn(
          'flex-1 flex flex-col items-center justify-center px-2 sm:px-3 py-2 rounded-lg border transition-all min-h-[44px]',
          value === 'quick'
            ? 'bg-accent text-background border-accent'
            : 'bg-transparent text-text-muted border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]'
        )}
      >
        <Zap className={cn('h-4 w-4 mb-1', value === 'quick' ? 'text-background' : 'text-green-400')} />
        <span className="text-xs font-medium hidden sm:inline">Quick Look</span>
        <span className="text-xs font-medium sm:hidden">Quick</span>
        <span className="text-[10px] opacity-75 hidden sm:inline">~1-3s</span>
      </button>

      <button
        onClick={() => handleChange('analysis')}
        className={cn(
          'flex-1 flex flex-col items-center justify-center px-2 sm:px-3 py-2 rounded-lg border transition-all min-h-[44px]',
          value === 'analysis'
            ? 'bg-accent text-background border-accent'
            : 'bg-transparent text-text-muted border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]'
        )}
      >
        <BarChart3 className={cn('h-4 w-4 mb-1', value === 'analysis' ? 'text-background' : 'text-blue-400')} />
        <span className="text-xs font-medium">Analysis</span>
        <span className="text-[10px] opacity-75 hidden sm:inline">~10-15s</span>
      </button>

      <button
        onClick={() => handleChange('full')}
        className={cn(
          'flex-1 flex flex-col items-center justify-center px-2 sm:px-3 py-2 rounded-lg border transition-all min-h-[44px]',
          value === 'full'
            ? 'bg-accent text-background border-accent shadow-lg shadow-accent/20'
            : 'bg-transparent text-text-muted border-[rgba(255,255,255,0.06)] hover:border-[rgba(255,255,255,0.12)]'
        )}
      >
        <Brain className={cn('h-4 w-4 mb-1', value === 'full' ? 'text-background' : 'text-purple-400')} />
        <span className="text-xs font-medium hidden sm:inline">Full Thesis</span>
        <span className="text-xs font-medium sm:hidden">Full</span>
        <span className="text-[10px] opacity-75 hidden sm:inline">~30-60s</span>
      </button>
    </div>
  );
}
