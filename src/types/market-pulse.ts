export interface MarketPulseData {
  vix: VixData | null;
  spy: TickerSnapshot | null;
  qqq: TickerSnapshot | null;
  fearGreedIndex: FearGreedIndex;
  marketSentiment: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  topGainers: Mover[];
  topLosers: Mover[];
  topNews: NewsItem[];
  timestamp: string;
  processingTime: number;
}

export interface VixData {
  value: number;
  change: number;
  changePercent: number;
  level: 'LOW' | 'NORMAL' | 'ELEVATED' | 'HIGH' | 'EXTREME';
}

export interface TickerSnapshot {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
  levels: {
    r1: number;
    s1: number;
    pivot: number;
  };
}

export interface FearGreedIndex {
  score: number;
  label: 'EXTREME_FEAR' | 'FEAR' | 'NEUTRAL' | 'GREED' | 'EXTREME_GREED';
}

export interface Mover {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
}

export interface NewsItem {
  id: string;
  title: string;
  tickers: string[];
  publishedUtc: string;
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  url: string;
}
