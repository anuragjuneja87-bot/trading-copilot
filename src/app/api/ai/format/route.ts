import { NextRequest, NextResponse } from 'next/server';

const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Template-specific data fetching configs
const TEMPLATE_DATA_NEEDS: Record<string, string[]> = {
  bullish_setups: ['prices', 'levels', 'flow', 'regime'],
  eod_summary: ['prices', 'levels', 'flow', 'news', 'regime'],
  seasonality: ['prices', 'regime'],
  afterhours_movers: ['prices', 'gaps'],
  symbol_thesis: ['prices', 'levels', 'regime'],
};

// ========================================
// DATA FETCHING HELPERS
// ========================================

async function fetchPolygonSnapshot(tickers: string[]): Promise<Record<string, any>> {
  try {
    // Fetch last 5 calendar days of daily bars to get at least 2 trading days
    // This handles weekends and holidays
    const today = new Date();
    const fiveDaysAgo = new Date(today);
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 7); // go back 7 calendar days to ensure 2+ trading days
    const fromDate = fiveDaysAgo.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];

    const fetches = tickers.map(async (ticker) => {
      try {
        const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=3&apiKey=${POLYGON_API_KEY}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          console.error(`[Format API] Polygon range error for ${ticker}:`, res.status);
          return null;
        }
        const data = await res.json();
        const bars = data.results || [];

        if (bars.length === 0) return null;

        // bars are sorted desc (newest first)
        // bars[0] = most recent trading day (yesterday or today)
        // bars[1] = the trading day before that (actual previous close)
        const latest = bars[0];
        const previous = bars.length > 1 ? bars[1] : null;

        const price = latest.c || 0;                    // most recent close
        const prevClose = previous ? previous.c : latest.o;  // prior day close, fallback to open
        const change = price - prevClose;
        const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;

        return {
          ticker,
          price: parseFloat(price.toFixed(2)),
          open: latest.o || 0,
          high: latest.h || 0,
          low: latest.l || 0,
          volume: latest.v || 0,
          vwap: latest.vw || 0,
          prevClose: parseFloat(prevClose.toFixed(2)),
          change: parseFloat(change.toFixed(2)),
          changePercent: parseFloat(changePercent.toFixed(2)),
        };
      } catch (err) {
        console.error(`[Format API] Polygon range fetch failed for ${ticker}:`, err);
        return null;
      }
    });

    const results = await Promise.all(fetches);
    const priceMap: Record<string, any> = {};

    for (const r of results) {
      if (r) priceMap[r.ticker] = r;
    }

    console.log('[Format API] Prices fetched:', Object.entries(priceMap).map(([t, d]: [string, any]) =>
      `${t}: $${d.price} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent}%)`
    ).join(', '));

    return priceMap;
  } catch (err) {
    console.error('[Format API] fetchPolygonSnapshot FAILED:', err);
    return {};
  }
}

async function fetchKeyLevels(ticker: string) {
  try {
    const today = new Date();
    const weekAgo = new Date(today);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const fromDate = weekAgo.toISOString().split('T')[0];
    const toDate = today.toISOString().split('T')[0];

    const url = `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=desc&limit=2&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      console.error('[Format API] fetchKeyLevels error:', res.status);
      return null;
    }
    const data = await res.json();
    const currentPrice = data.results?.[0]?.c || 0;

    if (!currentPrice) {
      console.error('[Format API] fetchKeyLevels: no price for', ticker);
      return null;
    }

    return {
      ticker,
      currentPrice,
      callWall: Math.round(currentPrice * 1.02),
      putWall: Math.round(currentPrice * 0.98),
      maxGamma: Math.round(currentPrice * 1.01),
      source: 'estimated',
    };
  } catch (err) {
    console.error('[Format API] fetchKeyLevels FAILED:', err);
    return null;
  }
}

async function fetchRegime() {
  try {
    // Use VIXY previous close as VIX proxy
    const url = `https://api.polygon.io/v2/aggs/ticker/VIXY/prev?apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    let vix = 20;
    if (res.ok) {
      const data = await res.json();
      vix = data.results?.[0]?.c || 20;
    }
    const status = vix > 35 ? 'CRISIS' : vix > 25 ? 'ELEVATED' : 'NORMAL';
    console.log('[Format API] Regime:', status, 'VIX:', vix);
    return { status, vix };
  } catch (err) {
    console.error('[Format API] fetchRegime FAILED:', err);
    return { status: 'NORMAL', vix: 20 };
  }
}

async function fetchFlowSummary(tickers: string[]) {
  // For V1: return a simplified note. Full flow data comes from /api/flow/options
  // which uses a different Polygon endpoint. Haiku can still generate setups from price/levels.
  try {
    const url = `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${tickers[0]}&limit=5&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { available: false };
    const data = await res.json();
    return { available: (data.results?.length || 0) > 0, contractCount: data.results?.length || 0 };
  } catch {
    return { available: false };
  }
}

async function fetchNews(tickers: string[], limit: number) {
  try {
    // Use Polygon news API
    const url = `https://api.polygon.io/v2/reference/news?limit=${limit}&apiKey=${POLYGON_API_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).slice(0, limit).map((a: any) => ({
      title: a.title || '',
      teaser: a.description || '',
      tickers: a.tickers || [],
      published: a.published_utc || '',
    }));
  } catch (error) {
    console.error('[Format API] Error fetching news:', error);
    return [];
  }
}

async function fetchOvernightGaps(tickers: string[]) {
  const prices = await fetchPolygonSnapshot(tickers);
  return Object.entries(prices).map(([ticker, data]: [string, any]) => ({
    ticker,
    price: data.price,
    prevClose: data.prevClose,
    gap: parseFloat((data.price - data.prevClose).toFixed(2)),
    gapPercent: data.prevClose ? parseFloat(((data.price - data.prevClose) / data.prevClose * 100).toFixed(2)) : 0,
    direction: data.price >= data.prevClose ? 'up' : 'down',
  }));
}

// ========================================
// PROMPT BUILDER
// ========================================

function buildPrompt(
  templateType: string,
  tickers: string[],
  marketData: Record<string, any>,
  context?: any,
): string {
  const tickerStr = tickers.join(', ');
  const pricesSummary = marketData.prices
    ? Object.entries(marketData.prices)
        .map(([t, d]: [string, any]) =>
          `${t}: $${d.price?.toFixed(2)} (${d.changePercent >= 0 ? '+' : ''}${d.changePercent?.toFixed(2)}%), vol ${(d.volume / 1e6).toFixed(1)}M`
        )
        .join('\n')
    : 'No price data available';

  const levelsSummary = marketData.levels
    ? `SPY Levels — Call Wall: $${marketData.levels.callWall || 'N/A'}, Put Wall: $${marketData.levels.putWall || 'N/A'}, Max Gamma: $${marketData.levels.maxGamma || 'N/A'}, GEX Flip: $${marketData.levels.gexFlip || 'N/A'}, Max Pain: $${marketData.levels.maxPain || 'N/A'}, Price: $${marketData.levels.currentPrice?.toFixed(2) || 'N/A'}`
    : 'Levels unavailable';

  const regimeSummary = marketData.regime
    ? `Market Regime: ${marketData.regime.status}, VIX: ${marketData.regime.vix?.toFixed(1)}`
    : 'Regime: NORMAL (default)';

  const newsSummary = marketData.news?.length
    ? marketData.news.slice(0, 5).map((n: any) => `- ${n.title}`).join('\n')
    : 'No recent news';

  switch (templateType) {
    case 'bullish_setups':
      return `You are a professional options trader's assistant. Based on the following LIVE market data, identify the best bullish trading setups right now.

MARKET DATA:
${pricesSummary}

${levelsSummary}
${regimeSummary}

INSTRUCTIONS:
- Identify 2-3 bullish setups from the tickers provided
- For each setup, provide: Ticker, Setup Type (e.g. "Gamma Squeeze", "Breakout", "Bounce off Support"), Entry Price, Target, Stop, Conviction (1-5)
- Base setups on the relationship between current price and key levels (call wall as magnet, put wall as support)
- Keep each setup to 2-3 sentences of reasoning
- End with a 1-sentence overall market bias

FORMAT YOUR RESPONSE AS VALID JSON with this exact structure:
{
  "setups": [
    {
      "ticker": "SPY",
      "setupType": "Gamma Squeeze",
      "entry": "$602",
      "target": "$610",
      "stop": "$598",
      "conviction": 4,
      "reasoning": "Price consolidating below call wall..."
    }
  ],
  "marketBias": "Bullish — positive gamma environment with price being pulled toward call wall."
}

RESPOND WITH ONLY THE JSON. No markdown, no backticks, no preamble.`;

    case 'eod_summary':
      return `You are a professional trading floor analyst delivering the end-of-day market summary.

CRITICAL RULES:
- LOOK AT THE changePercent VALUES BELOW. These are FACTS. Do not contradict them.
- If SPY changePercent is NEGATIVE, the market SOLD OFF. Say so clearly. Do not say "flat" or "mixed" if indices are down.
- If SPY changePercent is POSITIVE, the market RALLIED. Say so clearly.
- Only discuss the tickers provided below. Do NOT add other tickers.

MARKET DATA (TODAY'S SESSION):
${pricesSummary}

${levelsSummary}
${regimeSummary}

NEWS:
${newsSummary}

INSTRUCTIONS:
- Summarize today's session in 2-3 sentences. Lead with the DIRECTION (sold off / rallied / choppy) and magnitude.
- For each ticker provided, describe the key move and what levels were tested
- Summarize news impact in 1 sentence
- Provide tomorrow's setup: key levels to watch, bias, and what would change the thesis

FORMAT YOUR RESPONSE AS VALID JSON:
{
  "summary": "Markets sold off sharply with SPY dropping X.XX%...",
  "keyMoves": [
    { "ticker": "SPY", "move": "-X.XX%", "note": "Broke below max gamma at $688..." }
  ],
  "newsImpact": "...",
  "tomorrowSetup": "Watch for...",
  "bias": "BULLISH" | "BEARISH" | "NEUTRAL"
}

RESPOND WITH ONLY THE JSON. No markdown, no backticks, no preamble.`;

    case 'seasonality':
      const month = context?.month || new Date().getMonth() + 1;
      const monthName = new Date(2026, month - 1, 1).toLocaleString('en-US', { month: 'long' });
      return `You are a quantitative trading analyst specializing in seasonality patterns. Analyze ${monthName} seasonality for ${tickerStr}.

CURRENT DATA:
${pricesSummary}

${regimeSummary}

INSTRUCTIONS:
- Provide the historical average ${monthName} return for each ticker (use your knowledge of historical data)
- Note if current positioning (price, regime) aligns with or diverges from the seasonal pattern
- Provide a risk assessment for this month
- Keep it concise and actionable

FORMAT YOUR RESPONSE AS VALID JSON:
{
  "month": "${monthName}",
  "patterns": [
    {
      "ticker": "QQQ",
      "historicalAvgReturn": "-2.1%",
      "winRate": "45%",
      "note": "Historically weak month for tech"
    }
  ],
  "currentAlignment": "Current elevated VIX and...",
  "riskAssessment": "HIGH",
  "actionableNote": "Consider reducing tech exposure..."
}

RESPOND WITH ONLY THE JSON. No markdown, no backticks, no preamble.`;

    case 'afterhours_movers':
      const gapsSummary = marketData.gaps
        ? marketData.gaps
            .sort((a: any, b: any) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent))
            .slice(0, 5)
            .map((g: any) => `${g.ticker}: ${g.direction === 'up' ? '+' : ''}${g.gapPercent.toFixed(2)}% ($${g.price.toFixed(2)})`)
            .join('\n')
        : 'No gap data';

      return `You are a professional after-hours trading analyst. Summarize after-hours activity.

AFTER-HOURS DATA:
${pricesSummary}

GAPS:
${gapsSummary}

${regimeSummary}

INSTRUCTIONS:
- Identify the top 3 after-hours movers and explain why they moved (earnings, news, etc.)
- Note implications for tomorrow's open
- Provide 1-2 actionable setups for tomorrow based on AH activity

FORMAT YOUR RESPONSE AS VALID JSON:
{
  "topMovers": [
    {
      "ticker": "NVDA",
      "move": "+3.2%",
      "reason": "Beat earnings estimates...",
      "tomorrowImplication": "Likely gap up, watch $145 resistance"
    }
  ],
  "marketOutlook": "After-hours activity suggests...",
  "tomorrowSetups": [
    {
      "ticker": "NVDA",
      "setup": "Gap-and-go if holds above $143 pre-market",
      "risk": "Fades if broader market sells off"
    }
  ]
}

RESPOND WITH ONLY THE JSON. No markdown, no backticks, no preamble.`;

    case 'symbol_thesis':
      // Extract all data with proper fallbacks (data already extracted above)
      const price = Array.isArray(marketData.prices) ? marketData.prices[0] : marketData.prices?.[tickers[0]] || marketData.prices || {};
      const currentPrice = price.price || 0;
      const priceChange = price.change || 0;
      const priceChangePct = price.changePercent || 0;
      const volume = price.volume || 0;
      
      const levels = marketData.levels || {};
      const callWall = levels.callWall || 0;
      const putWall = levels.putWall || 0;
      const maxGamma = levels.maxGamma || 0;
      const gexFlip = levels.gexFlip || 0;
      const maxPain = levels.maxPain || 0;
      const expectedMove = levels.expectedMove || 0;
      
      // Calculate Pin Zone CORRECTLY (spread between walls, not distance from price)
      const levelSpread = Math.abs(callWall - putWall);
      const spreadPercent = currentPrice > 0 ? (levelSpread / currentPrice) * 100 : 0;
      const isPinZone = spreadPercent < 3 && spreadPercent > 0; // Less than 3% spread = pin zone
      
      // Position relative to levels
      const aboveGexFlip = currentPrice > gexFlip;
      const distanceToCallWall = currentPrice > 0 ? ((callWall - currentPrice) / currentPrice * 100) : 0;
      const distanceToPutWall = currentPrice > 0 ? ((currentPrice - putWall) / currentPrice * 100) : 0;
      
      // Flow data (already extracted above)
      const flowStats = marketData.flow || {};
      const netFlow = flowStats.netDeltaAdjustedFlow ?? 0;
      const callRatio = flowStats.callRatio ?? 50;
      const putRatio = flowStats.putRatio ?? 50;
      const sweepRatio = (flowStats.sweepRatio ?? 0) * 100; // Already converted to percentage
      const unusualCount = flowStats.unusualCount ?? 0;
      const flowRegime = flowStats.regime || 'UNKNOWN';
      
      // Dark pool data (already extracted above)
      const dpStats = marketData.darkPool || {};
      const dpVolume = dpStats.totalValue ?? 0;
      const dpBullishPct = dpStats.bullishPct ?? 0;
      const dpBearishPct = dpStats.bearishPct ?? 0;
      const dpRegime = dpStats.regime || 'UNKNOWN';
      const dpPrintCount = dpStats.printCount ?? 0;
      
      // News data (already extracted above)
      const articles = marketData.news?.articles || [];
      const articleCount = articles.length;
      const bullishNews = marketData.news?.bullish ?? 0;
      const bearishNews = marketData.news?.bearish ?? 0;
      const neutralNews = marketData.news?.neutral ?? 0;
      const newsSentiment = marketData.news?.sentiment || 'MIXED';
      
      // Market pulse (already extracted above)
      const vix = marketData.pulse?.vix ?? 20;
      const vixLevel = marketData.pulse?.vixLevel || 'NORMAL';
      const fearGreed = marketData.pulse?.fearGreed ?? 50;
      const fearGreedLabel = marketData.pulse?.fearGreedLabel || 'NEUTRAL';
      const marketRegime = marketData.pulse?.regime || 'NORMAL';
      
      const timestamp = new Date().toLocaleTimeString('en-US', {
        timeZone: 'America/New_York',
        hour: '2-digit',
        minute: '2-digit',
      });
      
      return `You are a professional trading floor analyst. Analyze the data below and provide a thesis.

══════════════════════════════════════════════════════════════════════
CRITICAL RULES — READ FIRST
══════════════════════════════════════════════════════════════════════

1. USE ONLY THE EXACT NUMBERS PROVIDED BELOW — Do NOT invent, estimate, or recall other data
2. If a value shows 0, "unknown", or "N/A", acknowledge it as missing data
3. Do NOT hallucinate VIX, volume, or any other metrics
4. PIN ZONE definition: Call Wall and Put Wall within 3% of each other (NOT within 3% of price)

══════════════════════════════════════════════════════════════════════
MARKET DATA FOR ${tickerStr} — ${timestamp} ET
══════════════════════════════════════════════════════════════════════

PRICE
• Current Price: $${currentPrice.toFixed(2)}
• Change: ${priceChange >= 0 ? '+' : ''}$${priceChange.toFixed(2)} (${priceChangePct >= 0 ? '+' : ''}${priceChangePct.toFixed(2)}%)
• Day Range: $${levels.low?.toFixed(2) || 'N/A'} - $${levels.high?.toFixed(2) || 'N/A'}
• Volume: ${volume > 0 ? (volume / 1e6).toFixed(1) + 'M shares' : 'N/A (market closed)'}

VOLATILITY (USE THESE EXACT VALUES)
• VIX: ${vix.toFixed(1)} ← USE THIS NUMBER, DO NOT INVENT ANOTHER
• VIX Level: ${vixLevel}
• Fear/Greed Index: ${fearGreed} (${fearGreedLabel})

GAMMA LEVELS
• Call Wall: $${callWall} (${distanceToCallWall.toFixed(1)}% above current price) — Major resistance
• Put Wall: $${putWall} (${distanceToPutWall.toFixed(1)}% below current price) — Major support  
• Level Spread: $${levelSpread.toFixed(0)} (${spreadPercent.toFixed(1)}% of price)
• Max Gamma: $${maxGamma}
• GEX Flip: $${gexFlip}
• Max Pain: $${maxPain}
• Expected Move: ±$${expectedMove.toFixed(2)} (${currentPrice > 0 ? (expectedMove / currentPrice * 100).toFixed(1) : '0'}%)

PIN ZONE STATUS: ${isPinZone ? '⚠️ YES — Call Wall and Put Wall are within 3% of each other, expect pinning/consolidation' : '❌ NO — Wide $' + levelSpread.toFixed(0) + ' spread (' + spreadPercent.toFixed(1) + '%) allows directional movement'}

GAMMA POSITIONING
• Price vs GEX Flip: ${aboveGexFlip ? 'ABOVE ($' + currentPrice.toFixed(2) + ' > $' + gexFlip + ') — Positive gamma territory, mean reversion pressure' : 'BELOW ($' + currentPrice.toFixed(2) + ' < $' + gexFlip + ') — Negative gamma territory, trend acceleration risk'}

OPTIONS FLOW
• Net Delta-Adjusted Flow: ${netFlow >= 0 ? '+' : ''}$${(netFlow / 1000).toFixed(1)}K
• Call/Put Split: ${callRatio}% calls / ${putRatio}% puts
• Sweep Activity: ${sweepRatio.toFixed(2)}%${sweepRatio > 10 ? ' (elevated)' : sweepRatio < 3 ? ' (low)' : ''}
• Unusual Trades: ${unusualCount}
• Flow Regime: ${flowRegime}

DARK POOL
• Block Volume: $${(dpVolume / 1e6).toFixed(1)}M (${dpPrintCount} prints)
• Bullish: ${dpBullishPct}% | Bearish: ${dpBearishPct}%
• Regime: ${dpRegime}
${dpPrintCount === 0 ? '• ⚠️ NO DATA — Market may be closed, cannot assess institutional positioning' : ''}

NEWS SENTIMENT (${articleCount} articles analyzed)
• Breakdown: ${bullishNews} bullish, ${bearishNews} bearish, ${neutralNews} neutral
• Overall: ${newsSentiment}
${articleCount > 0 ? articles.slice(0, 3).map((a: any) => `• "${(a.title || 'Untitled').substring(0, 60)}..."`).join('\n') : '• No news articles available'}

══════════════════════════════════════════════════════════════════════
ANALYSIS TASK
══════════════════════════════════════════════════════════════════════

Write a 4-6 sentence thesis following this structure:

1. LEAD: What is the single most important signal? (gamma positioning, flow direction, or dark pool activity)

2. LEVELS: Explain the gamma structure
   - If PIN ZONE = YES: Expect consolidation, price magnetically attracted to max pain
   - If PIN ZONE = NO: Identify the key levels to watch for breakout/breakdown

3. CONFLICTS: Note any conflicting signals or data quality issues
   - Missing dark pool data = cannot confirm institutional bias
   - Low flow volume = weak directional signal
   
4. VERDICT: End with exactly one of:
   - "BULLISH with [high/medium/low] confidence" 
   - "BEARISH with [high/medium/low] confidence"
   - "NEUTRAL with [high/medium/low] confidence"

REMINDER: Use ONLY the data above. The VIX is ${vix.toFixed(1)} — do not say it is any other number.

Write in plain text. No markdown, no JSON.`;

    default:
      return `Summarize market data for ${tickerStr}. Data: ${pricesSummary}. Return JSON with "summary" field.`;
  }
}

// ========================================
// MAIN ENDPOINT
// ========================================

export async function POST(request: NextRequest) {
  try {
    const { templateType, tickers, context } = await request.json();

    if (!templateType || !tickers?.length) {
      return NextResponse.json(
        { success: false, error: 'templateType and tickers required' },
        { status: 400 }
      );
    }

    if (!DATABRICKS_HOST || !DATABRICKS_TOKEN) {
      return NextResponse.json(
        { success: false, error: 'Databricks configuration missing. Check DATABRICKS_HOST and DATABRICKS_TOKEN in .env' },
        { status: 500 }
      );
    }

    const dataNeedsList = TEMPLATE_DATA_NEEDS[templateType];
    if (!dataNeedsList) {
      return NextResponse.json(
        { success: false, error: `Unknown templateType: ${templateType}` },
        { status: 400 }
      );
    }

    // ========================================
    // STEP 1: Parallel data fetching
    // ========================================
    const tickerStr = tickers.join(',');
    const dataFetches: Record<string, Promise<any>> = {};

    // Helper to fetch internal API
    const baseUrl = request.nextUrl.origin;
    const fetchInternal = async (path: string): Promise<any> => {
      try {
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) return null;
        const json = await res.json();
        return json.success ? json.data : null;
      } catch (err) {
        console.error(`[Format API] Failed to fetch ${path}:`, err);
        return null;
      }
    };

    // Build fetch promises based on what this template needs
    if (dataNeedsList.includes('prices')) {
      dataFetches.prices = fetchPolygonSnapshot(tickers);
    }
    if (dataNeedsList.includes('levels')) {
      // For symbol_thesis, fetch from internal API to get real gamma levels
      if (templateType === 'symbol_thesis') {
        dataFetches.levels = fetchInternal(`/api/market/levels/${tickers[0]}`);
      } else {
        dataFetches.levels = fetchKeyLevels('SPY');
      }
    }
    if (dataNeedsList.includes('regime')) {
      dataFetches.regime = fetchRegime();
    }
    if (dataNeedsList.includes('flow')) {
      // For symbol_thesis, fetch full flow data from internal API
      if (templateType === 'symbol_thesis') {
        dataFetches.flow = fetchInternal(`/api/flow/options?tickers=${tickers[0]}&limit=100`);
      } else {
        dataFetches.flow = fetchFlowSummary(tickers);
      }
    }
    if (dataNeedsList.includes('news')) {
      // For symbol_thesis, fetch from internal API
      if (templateType === 'symbol_thesis') {
        dataFetches.news = fetchInternal(`/api/news?tickers=${tickers[0]}&limit=5`);
      } else {
        dataFetches.news = fetchNews(tickers, 10);
      }
    }
    if (dataNeedsList.includes('gaps')) {
      dataFetches.gaps = fetchOvernightGaps(tickers);
    }
    
    // For symbol_thesis, also fetch dark pool and market pulse
    if (templateType === 'symbol_thesis') {
      dataFetches.darkPool = fetchInternal(`/api/darkpool?tickers=${tickers[0]}`);
      dataFetches.pulse = fetchInternal(`/api/market-pulse`);
    }

    // Await all in parallel
    const dataKeys = Object.keys(dataFetches);
    const dataValues = await Promise.all(Object.values(dataFetches));
    const marketData: Record<string, any> = {};
    dataKeys.forEach((key, i) => {
      marketData[key] = dataValues[i];
    });

    // ========================================
    // DEBUG: Log raw responses
    // ========================================
    
    console.log('[AI Format] ===== DATA FETCH RESULTS =====');
    console.log('[AI Format] Prices:', marketData.prices ? (Array.isArray(marketData.prices) ? `${marketData.prices.length} records` : 'object') : 'NULL');
    console.log('[AI Format] Levels:', marketData.levels ? `callWall=${marketData.levels.callWall}, putWall=${marketData.levels.putWall}` : 'NULL');
    console.log('[AI Format] Flow keys:', marketData.flow ? Object.keys(marketData.flow) : 'NULL');
    console.log('[AI Format] Flow stats keys:', marketData.flow?.stats ? Object.keys(marketData.flow.stats) : 'NULL');
    console.log('[AI Format] Dark Pool keys:', marketData.darkPool ? Object.keys(marketData.darkPool) : 'NULL');
    console.log('[AI Format] News keys:', marketData.news ? Object.keys(marketData.news) : 'NULL');
    console.log('[AI Format] News articles count:', marketData.news?.articles?.length || (Array.isArray(marketData.news) ? marketData.news.length : 0));
    console.log('[AI Format] Pulse keys:', marketData.pulse ? Object.keys(marketData.pulse) : 'NULL');
    console.log('[AI Format] ===== END DATA FETCH =====');
    
    // ========================================
    // EXTRACT & FORMAT DATA (with correct paths)
    // ========================================
    
    // Flow data - handle both {stats: {...}} and direct {...} structures
    const flowStats = marketData.flow?.stats || marketData.flow || {};
    const netFlow = flowStats.netDeltaAdjustedFlow ?? 0;
    const callRatio = flowStats.callRatio ?? 50;
    const putRatio = flowStats.putRatio ?? 50;
    const sweepRatio = (flowStats.sweepRatio ?? 0) * 100; // Convert decimal to %
    const unusualCount = flowStats.unusualCount ?? 0;
    const flowRegime = flowStats.regime || 'UNKNOWN';
    
    console.log('[AI Format] Extracted Flow:', { 
      callRatio, 
      putRatio, 
      sweepRatio: sweepRatio.toFixed(2), 
      netFlow: (netFlow / 1000).toFixed(1) + 'K',
      unusualCount,
      flowStatsKeys: Object.keys(flowStats),
    });
    
    // Dark pool data - handle both {stats: {...}} and direct {...} structures
    const dpStats = marketData.darkPool?.stats || marketData.darkPool || {};
    const dpVolume = dpStats.totalValue ?? 0;
    const dpBullishPct = dpStats.bullishPct ?? 0;
    const dpBearishPct = dpStats.bearishPct ?? 0;
    const dpRegime = dpStats.regime || 'UNKNOWN';
    const dpPrintCount = dpStats.printCount ?? 0;
    
    // News data - handle both {articles: [...]} and direct [...] structures
    const rawArticles = marketData.news?.articles || (Array.isArray(marketData.news) ? marketData.news : []);
    const articleCount = rawArticles.length;
    
    console.log('[AI Format] News articles found:', articleCount);
    if (articleCount > 0) {
      console.log('[AI Format] First article:', {
        title: rawArticles[0]?.title?.substring(0, 50),
        sentiment: rawArticles[0]?.sentiment,
      });
    }
    
    // Calculate news sentiment from articles
    let bullishNews = 0;
    let bearishNews = 0;
    let neutralNews = 0;
    
    if (Array.isArray(rawArticles) && rawArticles.length > 0) {
      rawArticles.forEach((article: any) => {
        const s = article.sentiment;
        if (typeof s === 'number') {
          if (s > 0.3) bullishNews++;
          else if (s < -0.3) bearishNews++;
          else neutralNews++;
        } else if (typeof s === 'string') {
          const sLower = s.toLowerCase();
          if (sLower.includes('bull') || sLower.includes('positive')) bullishNews++;
          else if (sLower.includes('bear') || sLower.includes('negative')) bearishNews++;
          else neutralNews++;
        } else {
          neutralNews++;
        }
      });
    }
    
    const newsSentiment = bullishNews > bearishNews ? 'BULLISH' : 
                         bearishNews > bullishNews ? 'BEARISH' : 'MIXED';
    
    console.log('[AI Format] News sentiment:', { bullishNews, bearishNews, neutralNews, newsSentiment });
    
    // Market pulse data
    const vix = marketData.pulse?.vix?.value ?? (marketData.pulse?.vix ?? 20);
    const vixLevel = marketData.pulse?.vix?.level || 'NORMAL';
    const fearGreed = marketData.pulse?.fearGreedIndex?.score ?? 50;
    const fearGreedLabel = marketData.pulse?.fearGreedIndex?.label || 'NEUTRAL';
    const marketRegime = marketData.pulse?.regime || 'NORMAL';
    
    // Store extracted data for prompt building
    marketData.flow = flowStats;
    marketData.darkPool = dpStats;
    marketData.news = {
      articles: rawArticles,
      sentiment: newsSentiment,
      bullish: bullishNews,
      bearish: bearishNews,
      neutral: neutralNews,
    };
    marketData.pulse = {
      vix,
      vixLevel,
      fearGreed,
      fearGreedLabel,
      regime: marketRegime,
    };

    // Validation log after all fetches
    console.log('[Format API] Data fetch results:', {
      pricesCount: Object.keys(marketData.prices || {}).length,
      priceTickers: Object.keys(marketData.prices || {}),
      hasLevels: !!marketData.levels,
      levelsPrice: marketData.levels?.currentPrice,
      hasFlow: !!marketData.flow,
      hasDarkPool: !!marketData.darkPool,
      hasNews: !!marketData.news,
      hasPulse: !!marketData.pulse,
      regime: marketData.regime?.status,
    });

    // ========================================
    // STEP 2: Build template-specific prompt
    // ========================================
    const prompt = buildPrompt(templateType, tickers, marketData, context);
    
    // Debug logging for symbol_thesis
    if (templateType === 'symbol_thesis') {
      const levels = marketData.levels || {};
      const vix = marketData.pulse?.vix || marketData.regime?.vix || 20;
      const levelSpread = Math.abs((levels.callWall || 0) - (levels.putWall || 0));
      const spreadPercent = levels.currentPrice > 0 ? (levelSpread / levels.currentPrice) * 100 : 0;
      const isPinZone = spreadPercent < 3;
      
      const flowStats = marketData.flow || {};
      const newsData = marketData.news || {};
      
      console.log('[AI Format] Symbol thesis data:', {
        vix: typeof vix === 'number' ? vix.toFixed(1) : vix,
        callWall: levels.callWall,
        putWall: levels.putWall,
        levelSpread: levelSpread.toFixed(0),
        spreadPercent: spreadPercent.toFixed(1) + '%',
        isPinZone,
        callRatio: flowStats.callRatio,
        putRatio: flowStats.putRatio,
        sweepRatio: flowStats.sweepRatio ? (flowStats.sweepRatio * 100).toFixed(2) + '%' : 'N/A',
        articleCount: newsData.articles?.length || 0,
        newsSentiment: newsData.sentiment,
        hasFlow: !!marketData.flow,
        hasDarkPool: !!marketData.darkPool,
        hasNews: !!marketData.news,
        hasPulse: !!marketData.pulse,
      });
    }

    // ========================================
    // STEP 3: Call Claude Haiku via Databricks
    // ========================================
    const startTime = Date.now();

    const haikuResponse = await fetch(
      `${DATABRICKS_HOST}/serving-endpoints/databricks-claude-haiku-4-5/invocations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        },
        body: JSON.stringify({
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 1500,
        }),
        signal: AbortSignal.timeout(15000), // 15s hard timeout
      }
    );

    if (!haikuResponse.ok) {
      const errText = await haikuResponse.text();
      console.error('[Format API] Haiku error:', haikuResponse.status, errText);
      throw new Error(`Haiku API error: ${haikuResponse.status}`);
    }

    const haikuData = await haikuResponse.json();

    // Databricks Foundation Model API returns OpenAI-compatible format:
    // { choices: [{ message: { content: "..." } }] }
    let narrative = '';
    if (haikuData.choices?.[0]?.message?.content) {
      narrative = haikuData.choices[0].message.content;
    } else if (haikuData.content) {
      // Fallback: direct content array format
      narrative = Array.isArray(haikuData.content)
        ? haikuData.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n')
        : typeof haikuData.content === 'string' ? haikuData.content : '';
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`[Format API] ${templateType} completed in ${elapsed}s`);

    // ========================================
    // STEP 4: Return structured response
    // ========================================
    return NextResponse.json({
      success: true,
      data: {
        templateType,
        tickers,
        narrative,          // The Haiku-formatted text
        marketData,         // Raw data so frontend can render structured elements
        elapsed: parseFloat(elapsed),
      },
    });

  } catch (error: any) {
    console.error('[Format API] Error:', error);
    if (error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Format request timed out (15s)' },
        { status: 504 }
      );
    }
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to format analysis' },
      { status: 500 }
    );
  }
}
