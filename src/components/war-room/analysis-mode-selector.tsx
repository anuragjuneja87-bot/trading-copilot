'use client';

import { AnalysisDepth } from '@/lib/chat-utils';
import { Zap, BarChart3, Brain } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AnalysisModeSelectorProps {
  value: AnalysisDepth;
  onChange: (value: AnalysisDepth) => void;
}

export function AnalysisModeSelector({ value, onChange }: AnalysisModeSelectorProps) {
  const modes: Array<{ value: AnalysisDepth; label: string; time: string; icon: React.ReactNode }> = [
    { value: 'quick', label: 'Quick Look', time: '~1-3s', icon: <Zap className="h-3.5 w-3.5" /> },
    { value: 'analysis', label: 'Analysis', time: '~10-15s', icon: <BarChart3 className="h-3.5 w-3.5" /> },
    { value: 'full', label: 'Full Thesis', time: '~30-60s', icon: <Brain className="h-3.5 w-3.5" /> },
  ];

  return (
    <div className="flex gap-2">
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => onChange(mode.value)}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            value === mode.value
              ? 'bg-[rgba(0,229,255,0.15)] text-[#00e5ff] border border-[rgba(0,229,255,0.3)]'
              : 'bg-[rgba(255,255,255,0.02)] text-[#8b99b0] border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.04)]'
          )}
        >
          {mode.icon}
          <span>{mode.label}</span>
          <span className="text-[10px] opacity-70">({mode.time})</span>
        </button>
      ))}
    </div>
  );
}
