export interface DarkPoolPrint {
  id: string;
  ticker: string;
  price: number;
  size: number;
  value: number;
  timestamp: string;
  timestampMs: number;
  exchange: string;
  exchangeCode: number;
  side: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sideConfidence: number;
  significance: 1 | 2 | 3 | 4 | 5;
  conditions: number[];
  bidAtTrade: number;
  askAtTrade: number;
}

export interface PriceLevel {
  ticker: string;
  price: number;
  totalValue: number;
  totalShares: number;
  printCount: number;
  bullishValue: number;
  bearishValue: number;
  avgSize: number;
}

export interface DarkPoolStats {
  totalValue: number;
  totalShares: number;
  printCount: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  bullishValue: number;
  bearishValue: number;
  bullishPct: number;
  bearishPct: number;
  largestPrint: { ticker: string; value: number; price: number; side: string } | null;
  mostActive: { ticker: string; count: number } | null;
  priceLevels: PriceLevel[];
  sizeDistribution: { mega: number; large: number; medium: number; small: number };
  timeSeries: any[];
  regime: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
}
