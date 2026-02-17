// Enhanced Option Trade Interface
export interface EnhancedOptionTrade {
  id: string;
  ticker: string;
  optionTicker: string;
  strike: number;
  expiry: string;
  callPut: 'C' | 'P';
  price: number;
  size: number;
  premium: number;
  exchange: string;
  exchangeId: number;
  timestamp: string;
  timestampMs: number;
  conditions: number[];
  tradeType: string; // REGULAR, SWEEP, BLOCK, INTERMARKET_SWEEP
  side: 'BUY' | 'SELL' | 'UNKNOWN';
  sequenceNumber: number;
  // Enhanced fields
  delta: number;
  gamma: number;
  openInterest: number;
  underlyingPrice: number;
  deltaAdjustedPremium: number;
  smartMoneyScore: number;
  isUnusual: boolean;
  moneyness: 'ITM' | 'ATM' | 'OTM';
  daysToExpiry: number;
  spotPrice?: number;
  otmPercent?: number;
  isSweep?: boolean;
  isGolden?: boolean;
  heatScore?: number;
  aggression?: 'ABOVE_ASK' | 'AT_ASK' | 'AT_MID' | 'AT_BID' | 'BELOW_BID' | 'UNKNOWN';
  aggressionScore?: number;
}

// GEX Strike Data
export interface GexStrike {
  strike: number;
  callGex: number;
  putGex: number;
  netGex: number;
  callOI: number;
  putOI: number;
  callPremium: number;
  putPremium: number;
}

// Flow Time Series Data
export interface FlowTimeSeries {
  time: string;
  timeMs: number;
  callPremium: number;
  putPremium: number;
  netFlow: number;
  cumulativeCDAF: number;
}

// Enhanced Flow Stats
export interface EnhancedFlowStats {
  totalPremium: number;
  callPremium: number;
  putPremium: number;
  callRatio: number;
  putRatio: number;
  tradeCount: number;
  mostActive: { ticker: string; count: number } | null;
  // Enhanced metrics
  netDeltaAdjustedFlow: number;
  flowMomentum: number;
  momentumDirection: 'accelerating' | 'decelerating' | 'neutral';
  sweepRatio: number;
  avgSmartMoneyScore: number;
  unusualCount: number;
  regime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL';
  gexByStrike: GexStrike[];
  flowTimeSeries: FlowTimeSeries[];
  // Aggression metrics
  aggressionRatio?: number; // % of premium above ask
  aggressionBias?: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  aboveAskPremium?: number;
  belowBidPremium?: number;
  // Legacy fields for compatibility
  bullishPremium: number;
  bearishPremium: number;
}
