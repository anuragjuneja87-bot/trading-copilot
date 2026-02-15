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
    ? `SPY Levels — Call Wall: $${marketData.levels.callWall}, Put Wall: $${marketData.levels.putWall}, Max Gamma: $${marketData.levels.maxGamma}, Price: $${marketData.levels.currentPrice?.toFixed(2)}`
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
      return `You are a professional trading floor analyst. Provide a concise real-time thesis for ${tickerStr}.

MARKET DATA:
${pricesSummary}

${levelsSummary}
${regimeSummary}

ADDITIONAL CONTEXT PROVIDED BY THE SYSTEM:
Flow Regime: ${context?.flowRegime || 'Unknown'}
Dark Pool Regime: ${context?.darkPoolRegime || 'Unknown'}
${context?.stats ? `Flow Stats — Net CDAF: $${((context.stats.netDeltaAdjustedFlow || 0) / 1e6).toFixed(1)}M, Sweep Ratio: ${((context.stats.sweepRatio || 0) * 100).toFixed(0)}%, Unusual Count: ${context.stats.unusualCount || 0}` : ''}
${context?.levels ? `Gamma Levels — Call Wall: $${context.levels.callWall}, Put Wall: $${context.levels.putWall}, Max Gamma: $${context.levels.maxGamma}` : ''}

INSTRUCTIONS:
- Write a 3-5 sentence thesis summarizing the current state of ${tickerStr}
- Lead with the most important signal (flow direction, dark pool regime, or gamma positioning)
- Mention key price levels and what they mean
- End with a clear directional bias: BULLISH, BEARISH, or NEUTRAL
- Write in the present tense, as if briefing a trading desk RIGHT NOW
- Do NOT recommend buying or selling. Only describe what the data shows.

Respond with plain text only. No JSON, no markdown, no formatting.`;

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

    // Build fetch promises based on what this template needs
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

    // Await all in parallel
    const dataKeys = Object.keys(dataFetches);
    const dataValues = await Promise.all(Object.values(dataFetches));
    const marketData: Record<string, any> = {};
    dataKeys.forEach((key, i) => {
      marketData[key] = dataValues[i];
    });

    // Validation log after all fetches
    console.log('[Format API] Data fetch results:', {
      pricesCount: Object.keys(marketData.prices || {}).length,
      priceTickers: Object.keys(marketData.prices || {}),
      hasLevels: !!marketData.levels,
      levelsPrice: marketData.levels?.currentPrice,
      regime: marketData.regime?.status,
      flowAvailable: marketData.flow?.available,
      newsCount: marketData.news?.length || 0,
    });

    // ========================================
    // STEP 2: Build template-specific prompt
    // ========================================
    const prompt = buildPrompt(templateType, tickers, marketData, context);

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
