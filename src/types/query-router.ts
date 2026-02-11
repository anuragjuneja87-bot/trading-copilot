export interface QueryClassification {
  category: 'SIMPLE_LOOKUP' | 'QUICK_ANALYSIS' | 'COMPLEX_ANALYSIS';
  tickers: string[];
  dataNeeded: string[];
  timeframe: string;
  confidence: number;
}

export interface TickerData {
  ticker: string;
  price: number | null;
  change: number | null;
  changePercent: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
  vwap: number | null;
  previousClose: number | null;
  levels: {
    pivot: number;
    r1: number;
    r2: number;
    s1: number;
    s2: number;
    high: number;
    low: number;
    vwap: number | null;
  } | null;
  timestamp: string;
}

export interface QueryResponse {
  routedTo: 'SIMPLE_LOOKUP' | 'QUICK_ANALYSIS' | 'SUPERVISOR';
  answer: string;
  data: any;
  message?: string;
  classification?: QueryClassification;
  processingTime?: number;
}
