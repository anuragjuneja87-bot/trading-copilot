'use client';

import { useState, useEffect, useRef } from 'react';
import { Check, Loader2, X, Lightbulb } from 'lucide-react';
import { AnalysisDepth } from '@/lib/chat-utils';
import { cn } from '@/lib/utils';

interface ProgressStep {
  label: string;
  time: number; // seconds when this step should appear
}

interface ProgressLoaderProps {
  analysisDepth: AnalysisDepth;
  onCancel?: () => void;
  startTime: number;
}

const QUICK_STEPS: ProgressStep[] = [
  { label: 'Fetching market data...', time: 0 },
  { label: 'Analyzing options flow...', time: 2 },
];

const ANALYSIS_STEPS: ProgressStep[] = [
  { label: 'Fetching market data...', time: 0 },
  { label: 'Analyzing options flow...', time: 5 },
  { label: 'Checking news and sentiment...', time: 15 },
  { label: 'Reviewing gamma levels...', time: 25 },
  { label: 'Building trading thesis...', time: 40 },
];

const FULL_STEPS: ProgressStep[] = [
  { label: 'Fetching market data...', time: 0 },
  { label: 'Analyzing options flow...', time: 5 },
  { label: 'Checking news and sentiment...', time: 15 },
  { label: 'Reviewing gamma levels...', time: 25 },
  { label: 'Running historical analysis...', time: 40 },
  { label: 'Building trading thesis...', time: 60 },
  { label: 'Finalizing report...', time: 90 },
];

const TIPS = [
  "💡 Tip: Use 'Quick Look' mode for instant price and level checks (~1-3s)",
  "💡 Tip: Add tickers to your watchlist for personalized suggestions",
  "💡 Tip: Try asking about specific levels like 'What's SPY's gamma wall?'",
  "💡 Tip: Use 'Analysis' mode for flow and sentiment (~10-15s)",
];

export function ProgressLoader({ analysisDepth, onCancel, startTime }: ProgressLoaderProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [currentTip, setCurrentTip] = useState(0);
  const [showLongWaitWarning, setShowLongWaitWarning] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const steps = analysisDepth === 'quick' 
    ? QUICK_STEPS 
    : analysisDepth === 'analysis' 
    ? ANALYSIS_STEPS 
    : FULL_STEPS;

  // Update elapsed time
  useEffect(() => {
    const interval = setInterval(() => {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000);
      setElapsed(elapsedSeconds);

      // Update current step based on elapsed time
      const activeStep = steps.findIndex(
        (step, idx) => 
          elapsedSeconds >= step.time && 
          (idx === steps.length - 1 || elapsedSeconds < steps[idx + 1].time)
      );
      if (activeStep >= 0) {
        setCurrentStep(activeStep);
      }

      // Show warning after 120 seconds
      if (elapsedSeconds > 120) {
        setShowLongWaitWarning(true);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [startTime, steps]);

  // Rotate tips every 10 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTip((prev) => (prev + 1) % TIPS.length);
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-4">
      {/* Progress Steps */}
      <div className="space-y-2 relative pl-6">
        {/* Connecting Line */}
        <div className="absolute left-[10px] top-0 w-0.5 bg-[rgba(255,255,255,0.06)]" style={{ height: `${(steps.length - 1) * 32}px` }} />
        
        {steps.map((step, idx) => {
          const isActive = idx === currentStep;
          const isComplete = idx < currentStep;
          const isPending = idx > currentStep;

          return (
            <div
              key={idx}
              className={cn(
                'flex items-center gap-3 transition-all duration-300 relative z-10',
                isPending && 'opacity-40'
              )}
            >
              {/* Step Icon */}
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {isComplete ? (
                  <Check className="h-4 w-4 text-green-400" />
                ) : isActive ? (
                  <Loader2 className="h-4 w-4 text-accent animate-spin" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-[rgba(255,255,255,0.2)]" />
                )}
              </div>

              {/* Step Label */}
              <span
                className={cn(
                  'text-sm transition-colors',
                  isActive && 'text-white font-medium',
                  isComplete && 'text-[#6b7a99]',
                  isPending && 'text-[#4a5568]'
                )}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Elapsed Timer & Cancel */}
      <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.06)]">
        <span className="text-[11px] text-[#4a5568]">
          Analyzing... {formatTime(elapsed)}
        </span>
        {onCancel && (
          <button
            onClick={onCancel}
            className="flex items-center gap-1 text-[11px] text-[#6b7a99] hover:text-red-400 transition-colors"
          >
            <X className="h-3 w-3" />
            Cancel
          </button>
        )}
      </div>

      {/* Long Wait Warning */}
      {showLongWaitWarning && (
        <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
          <p className="text-xs text-warning">
            This is taking longer than usual. The AI is performing a deep analysis. You can wait or cancel and try a simpler question.
          </p>
        </div>
      )}

      {/* Rotating Tip */}
      <div className="p-3 rounded-lg border border-accent/20 bg-[rgba(0,229,255,0.03)]">
        <div className="flex items-start gap-2">
          <Lightbulb className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
          <p className="text-xs text-[#b0bec5] leading-relaxed">
            {TIPS[currentTip]}
          </p>
        </div>
      </div>
    </div>
  );
}
