import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
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
      // Extract price data with debug logging
      // fetchPolygonSnapshot returns Record<string, any> = { SPY: { price, volume, ... }, ... }
      // So marketData.prices should be { SPY: {...}, QQQ: {...} }
      let price: any = {};
      if (Array.isArray(marketData.prices)) {
        // If it's an array, use first element (shouldn't happen with fetchPolygonSnapshot)
        price = marketData.prices[0] || {};
        console.log('[AI Format] WARNING: prices is an array, using first element');
      } else if (marketData.prices && typeof marketData.prices === 'object') {
        // Try to get price for the first ticker
        const ticker = tickers[0]?.toUpperCase() || 'SPY';
        price = marketData.prices[ticker] || marketData.prices[Object.keys(marketData.prices)[0]] || {};
      }
      
      console.log('[AI Format] Price extraction debug:', {
        pricesType: Array.isArray(marketData.prices) ? 'array' : typeof marketData.prices,
        pricesKeys: marketData.prices && typeof marketData.prices === 'object' && !Array.isArray(marketData.prices) ? Object.keys(marketData.prices) : [],
        ticker: tickers[0],
        priceObject: JSON.stringify(price, null, 2),
        priceVolume: price.volume,
        priceVolumeType: typeof price.volume,
        priceVolumeValue: price.volume,
      });
      
      const currentPrice = typeof price.price === 'number' ? price.price : 0;
      const priceChange = typeof price.change === 'number' ? price.change : 0;
      const priceChangePct = typeof price.changePercent === 'number' ? price.changePercent : 0;
      // CRITICAL: Use exact value from API, preserve 0
      const volume = typeof price.volume === 'number' ? price.volume : 0;
      
      console.log('[AI Format] Extracted volume:', {
        rawVolume: price.volume,
        extractedVolume: volume,
        volumeIsZero: volume === 0,
        volumeIsNumber: typeof volume === 'number',
        volumeValue: volume,
      });
      
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
      
      // Flow data (already extracted and stored in marketData.flow above)
      // marketData.flow should already be the stats object at this point
      console.log('[AI Format] ===== PROMPT BUILDING - EXTRACTION =====');
      console.log('[AI Format] marketData.flow at prompt build:', {
        type: typeof marketData.flow,
        isObject: typeof marketData.flow === 'object',
        keys: marketData.flow ? Object.keys(marketData.flow) : [],
        hasCallRatio: 'callRatio' in (marketData.flow || {}),
        callRatio: marketData.flow?.callRatio,
        putRatio: marketData.flow?.putRatio,
        sweepRatio: marketData.flow?.sweepRatio,
        fullObject: JSON.stringify(marketData.flow, null, 2),
      });
      
      const flowStats = marketData.flow || {};
      const netFlow = flowStats.netDeltaAdjustedFlow ?? 0;
      // CRITICAL: Use explicit checks to preserve actual values (40, 60) instead of defaulting to 50
      const callRatio = flowStats.callRatio !== undefined && flowStats.callRatio !== null ? flowStats.callRatio : 50;
      const putRatio = flowStats.putRatio !== undefined && flowStats.putRatio !== null ? flowStats.putRatio : 50;
      // sweepRatio is a decimal (0.0126), convert to percentage (1.26%)
      const sweepRatio = flowStats.sweepRatio !== undefined && flowStats.sweepRatio !== null ? (flowStats.sweepRatio * 100) : 0;
      const unusualCount = flowStats.unusualCount ?? 0;
      const flowRegime = flowStats.regime || 'UNKNOWN';
      
      // Debug: Log what we're using in the prompt
      console.log('[AI Format] Extracted flow values for prompt:', {
        callRatio,
        putRatio,
        sweepRatio: sweepRatio.toFixed(2),
        netFlow,
        flowStatsKeys: Object.keys(flowStats),
        flowStatsCallRatio: flowStats.callRatio,
        flowStatsPutRatio: flowStats.putRatio,
        flowStatsSweepRatio: flowStats.sweepRatio,
      });
      
      // Dark pool data (already extracted above)
      const dpStats = marketData.darkPool || {};
      const dpVolume = dpStats.totalValue ?? 0;
      const dpBullishPct = dpStats.bullishPct ?? 0;
      const dpBearishPct = dpStats.bearishPct ?? 0;
      const dpRegime = dpStats.regime || 'UNKNOWN';
      const dpPrintCount = dpStats.printCount ?? 0;
      
      // News data (already extracted and stored in marketData.news above)
      // marketData.news should already have articles, bullish, bearish, neutral, sentiment
      console.log('[AI Format] marketData.news at prompt build:', {
        type: typeof marketData.news,
        isObject: typeof marketData.news === 'object',
        keys: marketData.news ? Object.keys(marketData.news) : [],
        hasArticles: 'articles' in (marketData.news || {}),
        articlesLength: marketData.news?.articles?.length,
        articlesIsArray: Array.isArray(marketData.news?.articles),
        fullObject: JSON.stringify(marketData.news, null, 2),
      });
      
      const articles = marketData.news?.articles || [];
      const articleCount = articles.length;
      const bullishNews = marketData.news?.bullish ?? 0;
      const bearishNews = marketData.news?.bearish ?? 0;
      const neutralNews = marketData.news?.neutral ?? 0;
      const newsSentiment = marketData.news?.sentiment || 'MIXED';
      
      // Debug: Log what we're using in the prompt
      console.log('[AI Format] Extracted news values for prompt:', {
        articleCount,
        articlesLength: articles.length,
        bullishNews,
        bearishNews,
        neutralNews,
        newsSentiment,
        firstArticleTitle: articles[0]?.title?.substring(0, 50) || 'N/A',
      });
      
      console.log('[AI Format] Volume value for prompt:', {
        volume,
        volumeType: typeof volume,
        volumeIsZero: volume === 0,
        volumeValue: volume,
      });
      
      console.log('[AI Format] ===== END PROMPT BUILDING VALUES =====');
      
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
• Volume: ${volume > 0 ? (volume / 1e6).toFixed(1) + 'M shares' : 'Market closed (0 shares)'} ← USE THIS EXACT VALUE: ${volume === 0 ? '0 (market closed)' : volume.toLocaleString() + ' shares'}. DO NOT invent a different volume number.

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
• Call/Put Split: ${callRatio}% calls / ${putRatio}% puts ← USE THESE EXACT VALUES: ${callRatio}% calls, ${putRatio}% puts. DO NOT say "50/50" if the data shows ${callRatio}/${putRatio}.
• Sweep Activity: ${sweepRatio.toFixed(2)}%${sweepRatio > 10 ? ' (elevated)' : sweepRatio < 3 ? ' (low)' : ''} ← USE THIS EXACT VALUE: ${sweepRatio.toFixed(2)}%. DO NOT say "zero sweep activity" if this shows ${sweepRatio.toFixed(2)}%.
• Unusual Trades: ${unusualCount}
• Flow Regime: ${flowRegime}

DARK POOL
• Block Volume: $${(dpVolume / 1e6).toFixed(1)}M (${dpPrintCount} prints)
• Bullish: ${dpBullishPct}% | Bearish: ${dpBearishPct}%
• Regime: ${dpRegime}
${dpPrintCount === 0 ? '• ⚠️ NO DATA — Market may be closed, cannot assess institutional positioning' : ''}

NEWS SENTIMENT (${articleCount} articles analyzed) ← USE THIS EXACT COUNT: ${articleCount} articles. DO NOT say "no news articles" if this shows ${articleCount} articles.
• Breakdown: ${bullishNews} bullish, ${bearishNews} bearish, ${neutralNews} neutral
• Overall: ${newsSentiment}
${articleCount > 0 ? articles.slice(0, 3).map((a: any) => {
  const title = a.title || a.headline || 'Untitled';
  return `• "${title.substring(0, 60)}${title.length > 60 ? '...' : ''}"`;
}).join('\n') : '• No news articles available'}

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

REMINDER: Use ONLY the data above. 
- The VIX is ${vix.toFixed(1)} — do not say it is any other number.
- The volume is ${volume === 0 ? '0 (market closed)' : volume.toLocaleString() + ' shares'} — do not invent a different volume number like "96.3M shares" if the data shows 0.

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

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'AI service is not configured' },
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
        console.log(`[AI Format] Fetching: ${baseUrl}${path}`);
        const res = await fetch(`${baseUrl}${path}`, {
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });
        if (!res.ok) {
          console.error(`[AI Format] Fetch failed for ${path}: ${res.status} ${res.statusText}`);
          return null;
        }
        const json = await res.json();
        // Handle both { success: true, data: {...} } and direct {...} responses
        const result = json.success ? json.data : json;
        console.log(`[AI Format] Fetched ${path}:`, {
          hasSuccess: !!json.success,
          hasData: !!json.data,
          resultKeys: result ? Object.keys(result) : [],
        });
        return result;
      } catch (err) {
        console.error(`[AI Format] Failed to fetch ${path}:`, err);
        return null;
      }
    };

    // For symbol_thesis, ALWAYS fetch ALL market data regardless of TEMPLATE_DATA_NEEDS
    if (templateType === 'symbol_thesis') {
      const ticker = tickers[0];
      console.log(`[AI Format] Fetching ALL market data for symbol_thesis: ${ticker}`);
      
      // Fetch ALL required data in parallel
      dataFetches.prices = fetchInternal(`/api/market/prices?tickers=${ticker}`);
      dataFetches.levels = fetchInternal(`/api/market/levels/${ticker}`);
      dataFetches.flow = fetchInternal(`/api/flow/options?tickers=${ticker}&limit=100`);
      dataFetches.darkPool = fetchInternal(`/api/darkpool?tickers=${ticker}`);
      dataFetches.news = fetchInternal(`/api/news?tickers=${ticker}&limit=5`);
      dataFetches.pulse = fetchInternal(`/api/market-pulse`);
      
      console.log('[AI Format] All data fetch promises created for symbol_thesis');
    } else {
      // For other templates, use dataNeedsList
      if (dataNeedsList.includes('prices')) {
        dataFetches.prices = fetchPolygonSnapshot(tickers);
      }
      if (dataNeedsList.includes('levels')) {
        dataFetches.levels = fetchKeyLevels('SPY');
      }
      if (dataNeedsList.includes('regime')) {
        dataFetches.regime = fetchRegime();
      }
      if (dataNeedsList.includes('flow')) {
        dataFetches.flow = fetchFlowSummary(tickers);
      }
      if (dataNeedsList.includes('news')) {
        dataFetches.news = fetchNews(tickers, 10);
      }
      if (dataNeedsList.includes('gaps')) {
        dataFetches.gaps = fetchOvernightGaps(tickers);
      }
    }

    // Await all in parallel
    const dataKeys = Object.keys(dataFetches);
    const dataValues = await Promise.all(Object.values(dataFetches));
    const marketData: Record<string, any> = {};
    dataKeys.forEach((key, i) => {
      marketData[key] = dataValues[i];
    });
    
    // ========================================
    // IMMEDIATE DEBUG: Log raw API responses BEFORE any extraction
    // ========================================
    console.log('[DEBUG] ===== RAW API RESPONSES AFTER Promise.all =====');
    if (templateType === 'symbol_thesis') {
      const flowData = marketData.flow;
      const newsData = marketData.news;
      
      console.log('[DEBUG] flowData:', JSON.stringify(flowData, null, 2));
      console.log('[DEBUG] newsData:', JSON.stringify(newsData, null, 2));
      
      // Check structure
      console.log('[DEBUG] flowData structure check:', {
        hasData: !!flowData?.data,
        hasStats: !!flowData?.stats,
        hasDataStats: !!flowData?.data?.stats,
        callRatioFromData: flowData?.data?.stats?.callRatio,
        callRatioFromStats: flowData?.stats?.callRatio,
        keys: flowData ? Object.keys(flowData) : [],
        dataKeys: flowData?.data ? Object.keys(flowData.data) : [],
      });
      
      console.log('[DEBUG] newsData structure check:', {
        hasData: !!newsData?.data,
        hasArticles: !!newsData?.articles,
        hasDataArticles: !!newsData?.data?.articles,
        articlesLengthFromData: newsData?.data?.articles?.length,
        articlesLengthFromRoot: newsData?.articles?.length,
        keys: newsData ? Object.keys(newsData) : [],
        dataKeys: newsData?.data ? Object.keys(newsData.data) : [],
      });
    }
    console.log('[DEBUG] ===== END RAW API RESPONSES =====');
    
    // ========================================
    // DEBUG: Log raw flowData immediately after fetch
    // ========================================
    if (templateType === 'symbol_thesis' && marketData.flow) {
      console.log('[AI Format] ===== RAW FLOW DATA DEBUG =====');
      console.log('[AI Format] 1. flowData type:', typeof marketData.flow);
      console.log('[AI Format] 1. flowData is array?', Array.isArray(marketData.flow));
      console.log('[AI Format] 1. flowData keys:', Object.keys(marketData.flow));
      console.log('[AI Format] 1. flowData full object:', JSON.stringify(marketData.flow, null, 2));
      
      if (marketData.flow.stats) {
        console.log('[AI Format] 2. flowData.stats exists');
        console.log('[AI Format] 2. flowData.stats keys:', Object.keys(marketData.flow.stats));
        console.log('[AI Format] 2. flowData.stats.callRatio:', marketData.flow.stats.callRatio);
        console.log('[AI Format] 2. flowData.stats.putRatio:', marketData.flow.stats.putRatio);
        console.log('[AI Format] 2. flowData.stats full object:', JSON.stringify(marketData.flow.stats, null, 2));
      } else {
        console.log('[AI Format] 2. flowData.stats does NOT exist');
        console.log('[AI Format] 2. flowData.callRatio (direct):', marketData.flow.callRatio);
        console.log('[AI Format] 2. flowData.putRatio (direct):', marketData.flow.putRatio);
      }
      console.log('[AI Format] ===== END RAW FLOW DATA DEBUG =====');
    }

    // ========================================
    // DEBUG: Log raw responses
    // ========================================
    
    console.log('[AI Format] ===== DATA FETCH RESULTS =====');
    console.log('[AI Format] Prices:', marketData.prices ? (Array.isArray(marketData.prices) ? `${marketData.prices.length} records` : 'object') : 'NULL');
    console.log('[AI Format] Levels:', marketData.levels ? `callWall=${marketData.levels.callWall}, putWall=${marketData.levels.putWall}` : 'NULL');
    console.log('[AI Format] Flow keys:', marketData.flow ? Object.keys(marketData.flow) : 'NULL');
    console.log('[AI Format] Flow stats keys:', marketData.flow?.stats ? Object.keys(marketData.flow.stats) : 'NULL');
    console.log('[AI Format] Dark Pool keys:', marketData.darkPool ? Object.keys(marketData.darkPool) : 'NULL');
    console.log('[AI Format] Pulse keys:', marketData.pulse ? Object.keys(marketData.pulse) : 'NULL');
    console.log('[AI Format] ===== END DATA FETCH =====');
    
    // ========================================
    // DEBUG: Log raw newsData immediately after fetch
    // ========================================
    if (templateType === 'symbol_thesis' && marketData.news !== undefined) {
      console.log('[AI Format] ===== RAW NEWS DATA DEBUG =====');
      console.log('[AI Format] 1. newsData type:', typeof marketData.news);
      console.log('[AI Format] 1. newsData is array?', Array.isArray(marketData.news));
      console.log('[AI Format] 1. newsData is null?', marketData.news === null);
      console.log('[AI Format] 1. newsData keys:', marketData.news && typeof marketData.news === 'object' ? Object.keys(marketData.news) : 'N/A');
      console.log('[AI Format] 1. newsData full object:', JSON.stringify(marketData.news, null, 2));
      
      if (marketData.news?.articles) {
        console.log('[AI Format] 2. newsData.articles exists');
        console.log('[AI Format] 2. newsData.articles is array?', Array.isArray(marketData.news.articles));
        console.log('[AI Format] 2. newsData.articles length:', marketData.news.articles.length);
        console.log('[AI Format] 2. First article:', marketData.news.articles[0] ? {
          title: marketData.news.articles[0].title,
          sentiment: marketData.news.articles[0].sentiment,
        } : 'N/A');
      } else {
        console.log('[AI Format] 2. newsData.articles does NOT exist');
      }
      
      if (Array.isArray(marketData.news)) {
        console.log('[AI Format] 2. newsData is direct array, length:', marketData.news.length);
        console.log('[AI Format] 2. First item:', marketData.news[0] ? {
          title: marketData.news[0].title,
          sentiment: marketData.news[0].sentiment,
        } : 'N/A');
      }
      console.log('[AI Format] ===== END RAW NEWS DATA DEBUG =====');
    }
    
    // ========================================
    // EXTRACT & FORMAT DATA (with correct paths)
    // ========================================
    
    // Flow data - handle both {stats: {...}} and direct {...} structures
    console.log('[AI Format] ===== FLOW EXTRACTION DEBUG =====');
    console.log('[AI Format] 3. Before extraction - marketData.flow:', {
      hasFlow: !!marketData.flow,
      hasStats: !!marketData.flow?.stats,
      flowKeys: marketData.flow ? Object.keys(marketData.flow) : [],
      flowStatsKeys: marketData.flow?.stats ? Object.keys(marketData.flow.stats) : [],
    });
    
    // Try multiple extraction paths based on API response structure
    // fetchInternal returns json.data, so if API is { success: true, data: { stats: {...} } }
    // then marketData.flow should be { stats: {...} } (data already extracted)
    // But if fetchInternal doesn't extract, it might be { data: { stats: {...} } }
    let flowStats: any = null;
    console.log('[AI Format] 3. Flow extraction - checking structure:', {
      hasFlow: !!marketData.flow,
      hasData: !!marketData.flow?.data,
      hasStats: !!marketData.flow?.stats,
      hasDataStats: !!marketData.flow?.data?.stats,
      flowType: typeof marketData.flow,
      flowKeys: marketData.flow ? Object.keys(marketData.flow) : [],
      dataKeys: marketData.flow?.data ? Object.keys(marketData.flow.data) : [],
      statsKeys: marketData.flow?.stats ? Object.keys(marketData.flow.stats) : [],
      dataStatsKeys: marketData.flow?.data?.stats ? Object.keys(marketData.flow.data.stats) : [],
      callRatioFromDataStats: marketData.flow?.data?.stats?.callRatio,
      callRatioFromStats: marketData.flow?.stats?.callRatio,
      callRatioDirect: marketData.flow?.callRatio,
    });
    
    // Try: flowData.data.stats (if fetchInternal didn't extract data wrapper)
    if (marketData.flow?.data?.stats) {
      flowStats = marketData.flow.data.stats;
      console.log('[AI Format] 3. Using marketData.flow.data.stats - SUCCESS');
      console.log('[AI Format] 3. flowStats contents:', JSON.stringify(flowStats, null, 2));
    }
    // Try: flowData.stats (if fetchInternal already extracted data)
    else if (marketData.flow?.stats) {
      flowStats = marketData.flow.stats;
      console.log('[AI Format] 3. Using marketData.flow.stats - SUCCESS');
      console.log('[AI Format] 3. flowStats contents:', JSON.stringify(flowStats, null, 2));
    }
    // Try: flowData directly (if stats is the root)
    else if (marketData.flow && typeof marketData.flow === 'object' && 'callRatio' in marketData.flow) {
      flowStats = marketData.flow;
      console.log('[AI Format] 3. Using marketData.flow directly (it is the stats object) - SUCCESS');
      console.log('[AI Format] 3. flowStats contents:', JSON.stringify(flowStats, null, 2));
    } else {
      flowStats = {};
      console.log('[AI Format] 3. Using empty object fallback - FAILED TO EXTRACT');
      console.log('[AI Format] 3. marketData.flow was:', JSON.stringify(marketData.flow, null, 2));
    }
    
    console.log('[AI Format] 3. After extraction - flowStats:', {
      flowStatsKeys: Object.keys(flowStats),
      flowStatsCallRatio: flowStats.callRatio,
      flowStatsPutRatio: flowStats.putRatio,
      flowStatsSweepRatio: flowStats.sweepRatio,
      flowStatsFull: JSON.stringify(flowStats, null, 2),
    });
    
    const netFlow = flowStats.netDeltaAdjustedFlow ?? 0;
    // CRITICAL: Use explicit checks to preserve actual values (40, 60) instead of defaulting to 50
    const callRatio = flowStats.callRatio !== undefined && flowStats.callRatio !== null ? flowStats.callRatio : 50;
    const putRatio = flowStats.putRatio !== undefined && flowStats.putRatio !== null ? flowStats.putRatio : 50;
    // sweepRatio is a decimal (0.0126), convert to percentage (1.26%)
    const sweepRatio = flowStats.sweepRatio !== undefined && flowStats.sweepRatio !== null ? (flowStats.sweepRatio * 100) : 0;
    const unusualCount = flowStats.unusualCount ?? 0;
    const flowRegime = flowStats.regime || 'UNKNOWN';
    
    console.log('[AI Format] 3. Final extracted values:', { 
      callRatio, 
      putRatio, 
      sweepRatio: sweepRatio.toFixed(2), 
      netFlow: (netFlow / 1000).toFixed(1) + 'K',
      unusualCount,
      flowRegime,
    });
    console.log('[AI Format] ===== END FLOW EXTRACTION DEBUG =====');
    
    // Dark pool data - handle both {stats: {...}} and direct {...} structures
    const dpStats = marketData.darkPool?.stats || marketData.darkPool || {};
    const dpVolume = dpStats.totalValue ?? 0;
    const dpBullishPct = dpStats.bullishPct ?? 0;
    const dpBearishPct = dpStats.bearishPct ?? 0;
    const dpRegime = dpStats.regime || 'UNKNOWN';
    const dpPrintCount = dpStats.printCount ?? 0;
    
    // News data - handle both {articles: [...]} and direct [...] structures
    console.log('[AI Format] ===== NEWS EXTRACTION DEBUG =====');
    console.log('[AI Format] 3. Before extraction - marketData.news:', {
      hasNews: !!marketData.news,
      isArray: Array.isArray(marketData.news),
      hasArticles: !!marketData.news?.articles,
      newsKeys: marketData.news && typeof marketData.news === 'object' ? Object.keys(marketData.news) : [],
      articlesLength: marketData.news?.articles?.length,
      directArrayLength: Array.isArray(marketData.news) ? marketData.news.length : 0,
    });
    
    // Try multiple extraction strategies based on API response structure
    // fetchInternal returns json.data, so if API is { success: true, data: { articles: [...] } }
    // then marketData.news should be { articles: [...] } (data already extracted)
    // But if fetchInternal doesn't extract, it might be { data: { articles: [...] } }
    let rawArticles: any[] = [];
    console.log('[AI Format] 3. News extraction - checking structure:', {
      hasNews: !!marketData.news,
      hasData: !!marketData.news?.data,
      hasArticles: !!marketData.news?.articles,
      hasDataArticles: !!marketData.news?.data?.articles,
      newsType: typeof marketData.news,
      newsKeys: marketData.news ? Object.keys(marketData.news) : [],
      dataKeys: marketData.news?.data ? Object.keys(marketData.news.data) : [],
      articlesLengthFromData: marketData.news?.data?.articles?.length,
      articlesLengthFromRoot: marketData.news?.articles?.length,
      isArray: Array.isArray(marketData.news),
    });
    
    // Try: newsData.data.articles (if fetchInternal didn't extract data wrapper)
    if (marketData.news?.data?.articles && Array.isArray(marketData.news.data.articles)) {
      rawArticles = marketData.news.data.articles;
      console.log('[AI Format] 3. Using marketData.news.data.articles - SUCCESS (found', rawArticles.length, 'articles)');
    }
    // Try: newsData.articles (if fetchInternal already extracted data)
    else if (marketData.news?.articles && Array.isArray(marketData.news.articles)) {
      rawArticles = marketData.news.articles;
      console.log('[AI Format] 3. Using marketData.news.articles - SUCCESS (found', rawArticles.length, 'articles)');
    }
    // Try: newsData directly (if it's an array)
    else if (Array.isArray(marketData.news)) {
      rawArticles = marketData.news;
      console.log('[AI Format] 3. Using marketData.news directly (it is an array) - SUCCESS (found', rawArticles.length, 'items)');
    }
    // Try: search for articles in any property
    else if (marketData.news && typeof marketData.news === 'object') {
      const searchObj = marketData.news.data || marketData.news;
      const possibleKeys = Object.keys(searchObj);
      console.log('[AI Format] 3. Searching for articles in keys:', possibleKeys);
      for (const key of possibleKeys) {
        if (Array.isArray(searchObj[key]) && searchObj[key].length > 0) {
          const firstItem = searchObj[key][0];
          if (firstItem && (firstItem.title || firstItem.headline || firstItem.description)) {
            rawArticles = searchObj[key];
            console.log('[AI Format] 3. Found articles in', key, '- SUCCESS (found', rawArticles.length, 'items)');
            break;
          }
        }
      }
      if (rawArticles.length === 0) {
        console.log('[AI Format] 3. Failed to find articles - NO ARTICLES EXTRACTED');
        console.log('[AI Format] 3. marketData.news was:', JSON.stringify(marketData.news, null, 2));
      }
    } else {
      console.log('[AI Format] 3. marketData.news is null/undefined/not object - NO ARTICLES EXTRACTED');
    }
    
    const articleCount = rawArticles.length;
    
    console.log('[AI Format] 3. After extraction - rawArticles:', {
      articleCount,
      firstArticleTitle: rawArticles[0]?.title || rawArticles[0]?.headline || 'N/A',
      firstArticleSentiment: rawArticles[0]?.sentiment || 'N/A',
    });
    console.log('[AI Format] ===== END NEWS EXTRACTION DEBUG =====');
    
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
    
    // Debug: Verify stored values BEFORE prompt building
    console.log('[AI Format] ===== STORED VALUES VERIFICATION =====');
    console.log('[AI Format] marketData.flow.callRatio:', marketData.flow?.callRatio);
    console.log('[AI Format] marketData.flow.putRatio:', marketData.flow?.putRatio);
    console.log('[AI Format] marketData.flow.sweepRatio:', marketData.flow?.sweepRatio);
    console.log('[AI Format] marketData.news.articles.length:', marketData.news?.articles?.length);
    console.log('[AI Format] marketData.prices structure:', {
      isArray: Array.isArray(marketData.prices),
      isObject: typeof marketData.prices === 'object' && !Array.isArray(marketData.prices),
      keys: marketData.prices && typeof marketData.prices === 'object' ? Object.keys(marketData.prices) : [],
      firstPriceVolume: Array.isArray(marketData.prices) ? marketData.prices[0]?.volume : marketData.prices?.[tickers[0]]?.volume,
    });
    
    // CRITICAL: Log final extracted values that will be used in prompt
    if (templateType === 'symbol_thesis') {
      console.log('[AI Format] FINAL EXTRACTED VALUES FOR PROMPT:', {
        callRatio: flowStats.callRatio,
        putRatio: flowStats.putRatio,
        sweepRatio: (flowStats.sweepRatio ?? 0) * 100,
        articleCount: rawArticles.length,
        volume: Array.isArray(marketData.prices) ? marketData.prices[0]?.volume : marketData.prices?.[tickers[0]]?.volume,
        vix: vix,
        fearGreed: fearGreed,
      });
    }
    console.log('[AI Format] ===== END STORED VALUES VERIFICATION =====');

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
    // STEP 3: Call Claude Haiku via Anthropic API
    // ========================================
    const startTime = Date.now();

    const haikuResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(15000), // 15s hard timeout
    });

    if (!haikuResponse.ok) {
      const errText = await haikuResponse.text();
      console.error('[Format API] Haiku error:', haikuResponse.status, errText);
      throw new Error(`Haiku API error: ${haikuResponse.status}`);
    }

    const haikuData = await haikuResponse.json();

    // Anthropic Messages API format:
    // { content: [{ type: "text", text: "..." }] }
    let narrative = '';
    if (haikuData.content && Array.isArray(haikuData.content)) {
      narrative = haikuData.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n\n');
    } else if (typeof haikuData.content === 'string') {
      narrative = haikuData.content;
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
      { success: false, error: "An error occurred" || 'Failed to format analysis' },
      { status: 500 }
    );
  }
}
