import type { EnhancedOptionTrade, EnhancedFlowStats, GexStrike, FlowTimeSeries } from '@/types/flow';
import type { DarkPoolPrint, DarkPoolStats, PriceLevel } from '@/types/darkpool';

// ═══════════════════════════════════════════════════════════════
//  SYMBOL PROFILES — realistic base data per ticker
// ═══════════════════════════════════════════════════════════════

const SYMBOL_PROFILES: Record<string, { price: number; name: string; avgVolume: number; sector: string }> = {
  SPY:  { price: 592, name: 'SPDR S&P 500 ETF', avgVolume: 80_000_000, sector: 'Index' },
  QQQ:  { price: 512, name: 'Invesco QQQ Trust', avgVolume: 50_000_000, sector: 'Index' },
  NVDA: { price: 187, name: 'NVIDIA Corp', avgVolume: 150_000_000, sector: 'Semiconductors' },
  META: { price: 612, name: 'Meta Platforms', avgVolume: 25_000_000, sector: 'Tech' },
  AAPL: { price: 228, name: 'Apple Inc', avgVolume: 60_000_000, sector: 'Tech' },
  TSLA: { price: 335, name: 'Tesla Inc', avgVolume: 90_000_000, sector: 'Auto' },
  AMD:  { price: 118, name: 'Advanced Micro Devices', avgVolume: 55_000_000, sector: 'Semiconductors' },
  AMZN: { price: 205, name: 'Amazon.com', avgVolume: 45_000_000, sector: 'Tech' },
  GOOGL:{ price: 178, name: 'Alphabet Inc', avgVolume: 25_000_000, sector: 'Tech' },
  MSFT: { price: 412, name: 'Microsoft Corp', avgVolume: 22_000_000, sector: 'Tech' },
};

function getProfile(symbol: string) {
  return SYMBOL_PROFILES[symbol.toUpperCase()] || { price: 150, name: symbol, avgVolume: 10_000_000, sector: 'Unknown' };
}

// Helper: random number in range
function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function randInt(min: number, max: number) { return Math.floor(rand(min, max)); }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

// Helper: generate timestamps for the last trading session
function getSessionTimestamps(count: number): number[] {
  // Simulate a 9:30 AM - 4:00 PM ET session on the most recent Friday
  const now = new Date();
  const friday = new Date(now);
  // Go back to last Friday
  const day = friday.getDay();
  const daysBack = day === 0 ? 2 : day === 6 ? 1 : day < 5 ? day : 0;
  friday.setDate(friday.getDate() - daysBack);
  friday.setHours(9, 30, 0, 0);

  const sessionMs = 6.5 * 60 * 60 * 1000; // 6.5 hours
  const timestamps: number[] = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(friday.getTime() + (i / count) * sessionMs + rand(0, sessionMs / count));
  }
  return timestamps.sort();
}

// ═══════════════════════════════════════════════════════════════
//  OPTIONS FLOW MOCK
// ═══════════════════════════════════════════════════════════════

export function generateMockFlow(symbol: string): { flow: EnhancedOptionTrade[]; stats: EnhancedFlowStats } {
  const profile = getProfile(symbol);
  const basePrice = profile.price;
  const timestamps = getSessionTimestamps(60);

  // Generate strikes around current price
  const strikeStep = basePrice > 500 ? 5 : basePrice > 100 ? 2.5 : 1;
  const strikes = Array.from({ length: 20 }, (_, i) =>
    Math.round((basePrice - 10 * strikeStep + i * strikeStep) * 100) / 100
  );

  // Flow bias: slightly bullish (60/40 call/put)
  const callBias = 0.55 + rand(-0.1, 0.15);

  const trades: EnhancedOptionTrade[] = timestamps.map((ts, i) => {
    const isCall = Math.random() < callBias;
    const strike = pick(strikes);
    const daysToExpiry = pick([0, 0, 0, 1, 2, 3, 5, 7, 14, 30]); // Bias toward 0DTE
    const expiry = new Date(ts + daysToExpiry * 86400000).toISOString().split('T')[0];
    const premium = rand(5000, 2_000_000);
    const size = randInt(1, 500);
    const isSweep = Math.random() < 0.2;
    const isUnusual = Math.random() < 0.15;
    const smartMoneyScore = isUnusual ? rand(6, 10) : isSweep ? rand(4, 8) : rand(1, 5);
    const side = Math.random() < 0.6 ? 'BUY' : 'SELL';

    const delta = isCall ? rand(0.2, 0.8) : -rand(0.2, 0.8);
    const deltaAdj = premium * delta * (side === 'BUY' ? 1 : -1) * (isCall ? 1 : -1);

    return {
      id: `mock-${i}`,
      ticker: symbol.toUpperCase(),
      optionTicker: `O:${symbol}${expiry.replace(/-/g, '')}${isCall ? 'C' : 'P'}${strike * 1000}`,
      strike,
      expiry,
      callPut: isCall ? 'C' : 'P',
      price: rand(0.5, 30),
      size,
      premium: Math.round(premium),
      exchange: pick(['CBOE', 'ISE', 'PHLX', 'ARCA', 'BATS', 'MIAX']),
      exchangeId: pick([306, 312, 319, 302, 303, 314]),
      timestamp: new Date(ts).toISOString(),
      timestampMs: ts,
      conditions: isSweep ? [219] : [209],
      tradeType: isSweep ? 'INTERMARKET_SWEEP' : 'REGULAR',
      side: side as 'BUY' | 'SELL',
      sequenceNumber: i,
      delta: parseFloat(delta.toFixed(3)),
      gamma: parseFloat(rand(0.01, 0.1).toFixed(4)),
      openInterest: randInt(100, 50000),
      underlyingPrice: basePrice + rand(-2, 2),
      deltaAdjustedPremium: Math.round(deltaAdj),
      smartMoneyScore: parseFloat(smartMoneyScore.toFixed(1)),
      isUnusual,
      moneyness: Math.abs(strike - basePrice) < strikeStep * 2 ? 'ATM' : strike > basePrice ? (isCall ? 'OTM' : 'ITM') : (isCall ? 'ITM' : 'OTM'),
      daysToExpiry,
      isSweep,
      isGolden: isUnusual && smartMoneyScore > 8,
      heatScore: parseFloat((smartMoneyScore * rand(0.7, 1.0)).toFixed(1)),
    } as EnhancedOptionTrade;
  });

  // Generate flow time series (5-min buckets)
  const bucketCount = 78; // 6.5 hours / 5 min
  let cumulativeCDAF = 0;
  const sessionStart = timestamps[0] || Date.now();
  const flowTimeSeries: FlowTimeSeries[] = Array.from({ length: bucketCount }, (_, i) => {
    const hour = Math.floor(i / 12) + 9;
    const min = (i % 12) * 5 + 30;
    const actualHour = hour + Math.floor(min / 60);
    const actualMin = min % 60;
    const callPrem = rand(50000, 800000) * (1 + (i > 60 ? 0.5 : 0)); // Volume pickup near close
    const putPrem = rand(30000, 600000) * (1 + (i > 60 ? 0.5 : 0));
    const netFlow = callPrem - putPrem;
    cumulativeCDAF += netFlow * rand(0.3, 0.7);

    // Create a proper timestamp for this bucket
    const bucketTime = sessionStart + (i * 5 * 60 * 1000); // 5 minutes per bucket

    return {
      time: new Date(bucketTime).toISOString(), // ISO string format
      timeMs: bucketTime,
      callPremium: Math.round(callPrem),
      putPremium: Math.round(putPrem),
      netFlow: Math.round(netFlow),
      cumulativeCDAF: Math.round(cumulativeCDAF),
    };
  });

  // Generate GEX by strike
  const gexByStrike: GexStrike[] = strikes.map(strike => {
    const distFromPrice = Math.abs(strike - basePrice) / basePrice;
    const intensity = Math.max(0.1, 1 - distFromPrice * 10); // Higher near ATM
    return {
      strike,
      callGex: Math.round(rand(100000, 5000000) * intensity),
      putGex: Math.round(rand(80000, 4000000) * intensity),
      netGex: 0, // calculated below
      callOI: randInt(1000, 80000),
      putOI: randInt(1000, 60000),
      callPremium: Math.round(rand(100000, 3000000) * intensity),
      putPremium: Math.round(rand(80000, 2500000) * intensity),
    };
  }).map(g => ({ ...g, netGex: g.callGex - g.putGex }));

  // Calculate stats
  const callPremium = trades.filter(t => t.callPut === 'C').reduce((s, t) => s + t.premium, 0);
  const putPremium = trades.filter(t => t.callPut === 'P').reduce((s, t) => s + t.premium, 0);
  const totalPremium = callPremium + putPremium;
  const netCDAF = trades.reduce((s, t) => s + t.deltaAdjustedPremium, 0);
  const sweepCount = trades.filter(t => t.isSweep).length;

  const stats: EnhancedFlowStats = {
    totalPremium: Math.round(totalPremium),
    callPremium: Math.round(callPremium),
    putPremium: Math.round(putPremium),
    callRatio: Math.round((callPremium / totalPremium) * 100),
    putRatio: Math.round((putPremium / totalPremium) * 100),
    tradeCount: trades.length,
    mostActive: { ticker: symbol.toUpperCase(), count: trades.length },
    netDeltaAdjustedFlow: Math.round(netCDAF),
    flowMomentum: parseFloat(rand(-1, 1).toFixed(2)),
    momentumDirection: netCDAF > 0 ? 'accelerating' : 'decelerating',
    sweepRatio: parseFloat((sweepCount / trades.length).toFixed(3)),
    avgSmartMoneyScore: parseFloat((trades.reduce((s, t) => s + t.smartMoneyScore, 0) / trades.length).toFixed(1)),
    unusualCount: trades.filter(t => t.isUnusual).length,
    regime: netCDAF > 500000 ? 'RISK_ON' : netCDAF < -500000 ? 'RISK_OFF' : 'NEUTRAL',
    gexByStrike,
    flowTimeSeries,
    bullishPremium: Math.round(callPremium * 0.65),
    bearishPremium: Math.round(putPremium * 0.6),
  };

  return { flow: trades, stats };
}

// ═══════════════════════════════════════════════════════════════
//  DARK POOL MOCK
// ═══════════════════════════════════════════════════════════════

export function generateMockDarkPool(symbol: string): { prints: DarkPoolPrint[]; stats: DarkPoolStats } {
  const profile = getProfile(symbol);
  const basePrice = profile.price;
  const timestamps = getSessionTimestamps(40);

  const prints: DarkPoolPrint[] = timestamps.map((ts, i) => {
    const price = basePrice + rand(-basePrice * 0.02, basePrice * 0.02);
    const size = randInt(1000, 500000);
    const value = price * size;
    const side = pick(['BULLISH', 'BULLISH', 'BEARISH', 'NEUTRAL']) as 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    const significance = (value > 10_000_000 ? 5 : value > 5_000_000 ? 4 : value > 1_000_000 ? 3 : value > 500_000 ? 2 : 1) as 1 | 2 | 3 | 4 | 5;

    return {
      id: `dp-mock-${i}`,
      ticker: symbol.toUpperCase(),
      price: parseFloat(price.toFixed(2)),
      size,
      value: Math.round(value),
      timestamp: new Date(ts).toISOString(),
      timestampMs: ts,
      exchange: pick(['ADF', 'TRF', 'FINRA_ADF']),
      exchangeCode: pick([4, 19, 20]),
      side,
      sideConfidence: parseFloat(rand(0.5, 0.95).toFixed(2)),
      significance,
      conditions: [209],
      bidAtTrade: parseFloat((price - rand(0.01, 0.1)).toFixed(2)),
      askAtTrade: parseFloat((price + rand(0.01, 0.1)).toFixed(2)),
    };
  });

  // Build price levels
  const priceStep = basePrice > 500 ? 1 : 0.5;
  const levelMap = new Map<number, PriceLevel>();
  prints.forEach(p => {
    const bucket = Math.round(p.price / priceStep) * priceStep;
    const key = parseFloat(bucket.toFixed(2));
    const existing = levelMap.get(key) || {
      ticker: symbol.toUpperCase(),
      price: key,
      totalValue: 0,
      totalShares: 0,
      printCount: 0,
      bullishValue: 0,
      bearishValue: 0,
      avgSize: 0,
    };
    existing.totalValue += p.value;
    existing.totalShares += p.size;
    existing.printCount += 1;
    if (p.side === 'BULLISH') existing.bullishValue += p.value;
    if (p.side === 'BEARISH') existing.bearishValue += p.value;
    existing.avgSize = existing.totalShares / existing.printCount;
    levelMap.set(key, existing);
  });

  const priceLevels = Array.from(levelMap.values()).sort((a, b) => b.totalValue - a.totalValue);

  const bullishCount = prints.filter(p => p.side === 'BULLISH').length;
  const bearishCount = prints.filter(p => p.side === 'BEARISH').length;
  const neutralCount = prints.filter(p => p.side === 'NEUTRAL').length;
  const bullishValue = prints.filter(p => p.side === 'BULLISH').reduce((s, p) => s + p.value, 0);
  const bearishValue = prints.filter(p => p.side === 'BEARISH').reduce((s, p) => s + p.value, 0);
  const totalValue = prints.reduce((s, p) => s + p.value, 0);

  const stats: DarkPoolStats = {
    totalValue: Math.round(totalValue),
    totalShares: prints.reduce((s, p) => s + p.size, 0),
    printCount: prints.length,
    bullishCount,
    bearishCount,
    neutralCount,
    bullishValue: Math.round(bullishValue),
    bearishValue: Math.round(bearishValue),
    bullishPct: Math.round((bullishValue / totalValue) * 100),
    bearishPct: Math.round((bearishValue / totalValue) * 100),
    largestPrint: prints.length > 0
      ? (() => { const lp = prints.reduce((a, b) => a.value > b.value ? a : b); return { ticker: lp.ticker, value: lp.value, price: lp.price, side: lp.side }; })()
      : null,
    mostActive: { ticker: symbol.toUpperCase(), count: prints.length },
    priceLevels,
    sizeDistribution: {
      mega: prints.filter(p => p.value >= 10_000_000).length,
      large: prints.filter(p => p.value >= 5_000_000 && p.value < 10_000_000).length,
      medium: prints.filter(p => p.value >= 1_000_000 && p.value < 5_000_000).length,
      small: prints.filter(p => p.value < 1_000_000).length,
    },
    timeSeries: [],
    regime: bullishValue > bearishValue * 1.3 ? 'ACCUMULATION' : bearishValue > bullishValue * 1.3 ? 'DISTRIBUTION' : 'NEUTRAL',
  };

  return { prints, stats };
}

// ═══════════════════════════════════════════════════════════════
//  LEVELS MOCK
// ═══════════════════════════════════════════════════════════════

export function generateMockLevels(symbol: string) {
  const profile = getProfile(symbol);
  const p = profile.price;
  return {
    ticker: symbol.toUpperCase(),
    currentPrice: parseFloat((p + rand(-p * 0.005, p * 0.005)).toFixed(2)),
    callWall: Math.round(p * (1 + rand(0.015, 0.03))),
    putWall: Math.round(p * (1 - rand(0.015, 0.03))),
    maxGamma: Math.round(p * (1 + rand(0.005, 0.015))),
    source: 'demo',
  };
}

// ═══════════════════════════════════════════════════════════════
//  NEWS MOCK
// ═══════════════════════════════════════════════════════════════

export function generateMockNews(symbol: string) {
  const profile = getProfile(symbol);
  const now = Date.now();

  const headlines = [
    { title: `${symbol} Options Volume Surges Ahead of Earnings Week`, severity: 'ELEVATED', ago: 2 },
    { title: `Institutional Investors Increase ${profile.sector} Exposure in Q1`, severity: 'NORMAL', ago: 4 },
    { title: `Fed Minutes Signal Extended Pause, Markets React`, severity: 'ELEVATED', ago: 6 },
    { title: `${symbol} Analyst Upgrade: Price Target Raised to $${Math.round(profile.price * 1.15)}`, severity: 'NORMAL', ago: 8 },
    { title: `Dark Pool Activity Spikes in ${profile.sector} Names`, severity: 'ELEVATED', ago: 10 },
    { title: `VIX Drops Below 20 as Market Breadth Improves`, severity: 'NORMAL', ago: 14 },
    { title: `${symbol} CEO Discusses AI Strategy at Tech Conference`, severity: 'NORMAL', ago: 18 },
    { title: `Options Market Pricing In Elevated Volatility for ${symbol}`, severity: 'ELEVATED', ago: 22 },
  ];

  return headlines.map((h, i) => ({
    title: h.title,
    teaser: `Analysis and market implications for traders watching ${symbol} and the broader ${profile.sector} sector.`,
    source: pick(['Benzinga', 'Reuters', 'Bloomberg', 'MarketWatch', 'CNBC']),
    publishedAt: new Date(now - h.ago * 3600000).toISOString(),
    severity: h.severity as 'CRISIS' | 'ELEVATED' | 'NORMAL',
    url: '#',
    tickers: [symbol.toUpperCase(), 'SPY'],
  }));
}

// ═══════════════════════════════════════════════════════════════
//  REGIME MOCK
// ═══════════════════════════════════════════════════════════════

export function generateMockRegime() {
  return {
    status: 'elevated' as const,
    vixLevel: parseFloat(rand(18, 28).toFixed(1)),
    reason: 'VIX elevated due to upcoming economic data',
  };
}

// ═══════════════════════════════════════════════════════════════
//  PRICE MOCK
// ═══════════════════════════════════════════════════════════════

export function generateMockPrice(symbol: string) {
  const profile = getProfile(symbol);
  const change = rand(-3, 3);
  return {
    ticker: symbol.toUpperCase(),
    price: parseFloat((profile.price * (1 + change / 100)).toFixed(2)),
    change: parseFloat((profile.price * change / 100).toFixed(2)),
    changePercent: parseFloat(change.toFixed(2)),
    volume: Math.round(profile.avgVolume * rand(0.5, 1.5)),
    prevClose: profile.price,
    high: parseFloat((profile.price * (1 + Math.abs(change) / 100 + 0.005)).toFixed(2)),
    low: parseFloat((profile.price * (1 - Math.abs(change) / 100 - 0.005)).toFixed(2)),
  };
}

// ═══════════════════════════════════════════════════════════════
//  MASTER: Generate all mock data for a symbol
// ═══════════════════════════════════════════════════════════════

export function generateAllMockData(symbol: string) {
  const { flow, stats } = generateMockFlow(symbol);
  const { prints, stats: darkpoolStats } = generateMockDarkPool(symbol);
  const levels = generateMockLevels(symbol);
  const news = generateMockNews(symbol);
  const regime = generateMockRegime();
  const price = generateMockPrice(symbol);

  return {
    flow: { flow, stats },
    darkpool: { prints, stats: darkpoolStats },
    levels,
    news,
    regime,
    price,
  };
}
