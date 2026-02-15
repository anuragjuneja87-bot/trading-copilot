'use client';

import { useKeyLevels, useOptionsFlow } from './use-trading-data';
import type { GexStrike } from '@/types/flow';

interface UseGexDataOptions {
  ticker: string;
  enabled?: boolean;
}

export function useGexData({ ticker, enabled = true }: UseGexDataOptions) {
  // Get key levels (call wall, put wall, max gamma)
  const levels = useKeyLevels(ticker);
  
  // Get GEX by strike from the flow API
  const flow = useOptionsFlow({ tickers: ticker, limit: 50 });

  // Extract gexByStrike from flow stats
  const flowData = flow.data?.success ? flow.data.data : null;
  const gexByStrike: GexStrike[] = flowData?.stats?.gexByStrike || [];
  
  // Extract levels data - check both possible response formats
  const levelsData = levels.data || null;
  const currentPrice = levelsData?.currentPrice || levelsData?.data?.currentPrice || 0;
  const callWall = levelsData?.callWall || levelsData?.data?.callWall || 0;
  const putWall = levelsData?.putWall || levelsData?.data?.putWall || 0;
  const maxGamma = levelsData?.maxGamma || levelsData?.data?.maxGamma || 0;
  const source = levelsData?.source || levelsData?.data?.source || 'unknown';

  return {
    gexByStrike,
    currentPrice,
    callWall,
    putWall,
    maxGamma,
    source,
    isLoading: levels.isLoading || flow.isLoading,
    isError: levels.isError || flow.isError,
    refetch: () => {
      levels.refetch();
      flow.refetch();
    },
  };
}
