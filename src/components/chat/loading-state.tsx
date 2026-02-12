'use client';

import { ProgressLoader } from './progress-loader';
import { AnalysisDepth } from '@/lib/chat-utils';

interface LoadingStateProps {
  analysisDepth: AnalysisDepth;
  onCancel?: () => void;
  startTime?: number;
}

export function LoadingState({ analysisDepth, onCancel, startTime }: LoadingStateProps) {
  const actualStartTime = startTime || Date.now();
  
  return <ProgressLoader analysisDepth={analysisDepth} onCancel={onCancel} startTime={actualStartTime} />;
}
