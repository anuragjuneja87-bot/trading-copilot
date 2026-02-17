export interface NewsArticle {
  id: string;
  title: string;
  description: string;
  articleUrl: string;
  imageUrl?: string;
  publishedUtc: string;
  tickers: string[];
  author?: string;
  publisher: {
    name: string;
    logoUrl?: string;
  };
  keywords: string[];
  sentiment: number;
  sentimentLabel: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  sentimentKeywords: string[];
  sentimentValue?: 'positive' | 'negative' | 'neutral'; // For frontend display
  impactScore: number;
  eventType: string;
  // Legacy fields for backward compatibility
  headline?: string;
  summary?: string;
  source?: string;
  url?: string | null;
  severity?: 'CRISIS' | 'ELEVATED' | 'NORMAL';
  publishedAt?: string;
}

export interface TickerSentiment {
  ticker: string;
  sentimentScore: number;
  sentimentLabel: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  articleCount: number;
  bullishCount: number;
  bearishCount: number;
  neutralCount: number;
  latestHeadline: string | null;
}

export interface MarketMood {
  overall: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  score: number;
  spySentiment: number;
  qqqSentiment: number;
  vixMentions: number;
  distribution: {
    bullish: number;
    bearish: number;
    neutral: number;
  };
  topBullish: string[];
  topBearish: string[];
  totalArticles: number;
}
