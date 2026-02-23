import { NextRequest, NextResponse } from 'next/server';
import { QueryClassification, TickerData, QueryResponse } from '@/types/query-router';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const POLYGON_BASE_URL = 'https://api.polygon.io';

// Classification prompt for Haiku
const CLASSIFIER_PROMPT = `You are a query classifier for a trading platform. Classify the user's query and extract key information.

## CATEGORIES

**SIMPLE_LOOKUP** - Direct data retrieval, no analysis needed:
- Current price, last close, open, high, low
- Today's levels (support/resistance from price action)
- Volume, market cap, basic stats
- "What is X trading at?"
- "Show me Y's price"
- "SPY levels today"

**QUICK_ANALYSIS** - Brief insight using data + single LLM response:
- "Is X bullish or bearish?"
- "Summarize X news"
- "What's the sentiment on X?"
- "Should I watch X today?"
- "Quick take on X"
- Any question requiring opinion/interpretation of data

**COMPLEX_ANALYSIS** - Multi-step research, comparisons, deep dives:
- "Build a thesis on X"
- "Compare X vs Y"
- "Full analysis of X"
- "What's the trade setup for X?"
- "Analyze X options flow and dark pool together"
- Multi-ticker analysis
- Strategy recommendations
- Anything requiring multiple data sources combined with reasoning

## INSTRUCTIONS
1. Classify the query into one of the three categories
2. Extract all stock ticker symbols mentioned (uppercase, e.g., SPY, TSLA, NVDA)
3. Identify what data is needed
4. Identify the timeframe if mentioned

## RESPOND IN JSON ONLY - NO MARKDOWN, NO EXPLANATION
{
  "category": "SIMPLE_LOOKUP" | "QUICK_ANALYSIS" | "COMPLEX_ANALYSIS",
  "tickers": ["SPY", "TSLA"],
  "dataNeeded": ["price", "levels", "volume", "options", "news", "darkpool"],
  "timeframe": "today" | "week" | "month" | "realtime" | "unspecified",
  "confidence": 0.0-1.0
}`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { query, watchlist = [] } = await request.json();
    
    if (!query || query.trim().length === 0) {
      return NextResponse.json({ 
        success: false, 
        error: 'Query is required' 
      }, { status: 400 });
    }

    console.log('=== QUERY ROUTER START ===');
    console.log('Query:', query);

    // Step 1: Classify the query using Haiku (fast)
    const classification = await classifyQuery(query);
    console.log('Classification:', classification);

    // Step 2: Route to appropriate handler
    let response;
    
    switch (classification.category) {
      case 'SIMPLE_LOOKUP':
        response = await handleSimpleLookup(query, classification);
        break;
      case 'QUICK_ANALYSIS':
        response = await handleQuickAnalysis(query, classification, watchlist);
        break;
      case 'COMPLEX_ANALYSIS':
        // Return routing info - let frontend call Supervisor
        response = {
          routedTo: 'SUPERVISOR',
          classification,
          message: 'This query requires deep analysis. Routing to Supervisor agent...',
          answer: '',
          data: null,
        };
        break;
      default:
        response = await handleQuickAnalysis(query, classification, watchlist);
    }

    const totalTime = Date.now() - startTime;
    console.log(`=== QUERY ROUTER END (${totalTime}ms) ===`);

    return NextResponse.json({
      success: true,
      data: {
        ...response,
        classification,
        processingTime: totalTime,
      },
    });

  } catch (error) {
    console.error('Query router error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to process query',
      fallbackToSupervisor: true,
    }, { status: 500 });
  }
}

// Classify query using Haiku
async function classifyQuery(query: string): Promise<QueryClassification> {
  try {
    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          messages: [
            { role: 'system', content: CLASSIFIER_PROMPT },
            { role: 'user', content: query },
          ],
          max_tokens: 200,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Classification API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || '{}';
    
    // Parse JSON response (handle potential markdown wrapping)
    const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
    const classification = JSON.parse(jsonStr);
    
    return {
      category: classification.category || 'QUICK_ANALYSIS',
      tickers: classification.tickers || [],
      dataNeeded: classification.dataNeeded || ['price'],
      timeframe: classification.timeframe || 'today',
      confidence: classification.confidence || 0.8,
    };
  } catch (error) {
    console.error('Classification error:', error);
    // Default to quick analysis if classification fails
    return {
      category: 'QUICK_ANALYSIS',
      tickers: extractTickersFromQuery(query),
      dataNeeded: ['price'],
      timeframe: 'today',
      confidence: 0.5,
    };
  }
}

// Extract tickers using regex fallback
function extractTickersFromQuery(query: string): string[] {
  const commonTickers = ['SPY', 'QQQ', 'TSLA', 'NVDA', 'AAPL', 'MSFT', 'AMD', 'META', 'AMZN', 'GOOGL', 'VIX', 'IWM', 'DIA'];
  const found: string[] = [];
  
  const upperQuery = query.toUpperCase();
  commonTickers.forEach(ticker => {
    if (upperQuery.includes(ticker)) {
      found.push(ticker);
    }
  });
  
  // Also look for $TICKER pattern
  const dollarMatches = query.match(/\$([A-Z]{1,5})/g);
  if (dollarMatches) {
    dollarMatches.forEach(match => {
      found.push(match.replace('$', ''));
    });
  }
  
  return [...new Set(found)];
}

// Handle simple lookups directly via Polygon API
async function handleSimpleLookup(
  query: string, 
  classification: QueryClassification
): Promise<QueryResponse> {
  const tickers = classification.tickers;
  
  if (tickers.length === 0) {
    return {
      routedTo: 'SIMPLE_LOOKUP',
      answer: "I couldn't identify a ticker symbol in your query. Please specify a stock symbol like SPY, TSLA, or NVDA.",
      data: null,
    };
  }

  // Fetch data for all tickers
  const tickerData = await Promise.all(
    tickers.map(ticker => fetchTickerData(ticker, classification.dataNeeded))
  );

  // Format response
  const formattedResponse = formatSimpleLookupResponse(query, tickers, tickerData, classification);

  return {
    routedTo: 'SIMPLE_LOOKUP',
    answer: formattedResponse.answer,
    data: formattedResponse.data,
  };
}

// Fetch ticker data from Polygon
async function fetchTickerData(ticker: string, dataNeeded: string[]): Promise<TickerData> {
  const data: TickerData = {
    ticker,
    price: null,
    change: null,
    changePercent: null,
    open: null,
    high: null,
    low: null,
    close: null,
    volume: null,
    vwap: null,
    previousClose: null,
    levels: null,
    timestamp: new Date().toISOString(),
  };

  try {
    // Fetch previous day data (most reliable for current levels)
    const prevDayUrl = `${POLYGON_BASE_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`;
    const prevDayResponse = await fetch(prevDayUrl, {
      next: { revalidate: 5 },
    });
    
    if (prevDayResponse.ok) {
      const prevDayData = await prevDayResponse.json();
      const result = prevDayData.results?.[0];
      
      if (result) {
        data.previousClose = result.c;
        data.open = result.o;
        data.high = result.h;
        data.low = result.l;
        data.close = result.c;
        data.volume = result.v;
        data.vwap = result.vw;
      }
    }

    // Fetch current/latest trade
    const snapshotUrl = `${POLYGON_BASE_URL}/v2/snapshot/locale/us/markets/stocks/tickers/${ticker}?apiKey=${POLYGON_API_KEY}`;
    const snapshotResponse = await fetch(snapshotUrl, {
      next: { revalidate: 5 },
    });
    
    if (snapshotResponse.ok) {
      const snapshotData = await snapshotResponse.json();
      const tickerSnapshot = snapshotData.ticker;
      
      if (tickerSnapshot) {
        data.price = tickerSnapshot.lastTrade?.p || tickerSnapshot.day?.c || data.close;
        data.change = tickerSnapshot.todaysChange;
        data.changePercent = tickerSnapshot.todaysChangePerc;
        
        // Today's data if available
        if (tickerSnapshot.day) {
          data.open = tickerSnapshot.day.o || data.open;
          data.high = tickerSnapshot.day.h || data.high;
          data.low = tickerSnapshot.day.l || data.low;
          data.volume = tickerSnapshot.day.v || data.volume;
          data.vwap = tickerSnapshot.day.vw || data.vwap;
        }
        
        // Previous day for reference
        if (tickerSnapshot.prevDay) {
          data.previousClose = tickerSnapshot.prevDay.c;
        }
      }
    }

    // Calculate key levels
    if (data.high && data.low && data.close) {
      const pivot = (data.high + data.low + data.close) / 3;
      const r1 = 2 * pivot - data.low;
      const s1 = 2 * pivot - data.high;
      const r2 = pivot + (data.high - data.low);
      const s2 = pivot - (data.high - data.low);
      
      data.levels = {
        pivot: Math.round(pivot * 100) / 100,
        r1: Math.round(r1 * 100) / 100,
        r2: Math.round(r2 * 100) / 100,
        s1: Math.round(s1 * 100) / 100,
        s2: Math.round(s2 * 100) / 100,
        high: data.high,
        low: data.low,
        vwap: data.vwap,
      };
    }

  } catch (error) {
    console.error(`Error fetching data for ${ticker}:`, error);
  }

  return data;
}

// Format simple lookup response
function formatSimpleLookupResponse(
  query: string,
  tickers: string[],
  tickerData: TickerData[],
  classification: QueryClassification
): { answer: string; data: any } {
  const queryLower = query.toLowerCase();
  
  // Check what kind of simple lookup this is
  const wantsLevels = queryLower.includes('level') || queryLower.includes('support') || queryLower.includes('resistance') || queryLower.includes('pivot');
  const wantsPrice = queryLower.includes('price') || queryLower.includes('trading at') || queryLower.includes('quote');
  const wantsVolume = queryLower.includes('volume');
  
  let answer = '';
  
  tickerData.forEach((data, index) => {
    if (index > 0) answer += '\n\n';
    
    const priceStr = data.price ? `$${data.price.toFixed(2)}` : 'N/A';
    const changeStr = data.change !== null && data.changePercent !== null
      ? `${data.change >= 0 ? '+' : ''}$${data.change.toFixed(2)} (${data.changePercent >= 0 ? '+' : ''}${data.changePercent.toFixed(2)}%)`
      : '';
    
    if (wantsLevels && data.levels) {
      answer += `**${data.ticker} Key Levels:**\n`;
      answer += `• Current Price: ${priceStr} ${changeStr}\n`;
      answer += `• R2 (Resistance 2): $${data.levels.r2.toFixed(2)}\n`;
      answer += `• R1 (Resistance 1): $${data.levels.r1.toFixed(2)}\n`;
      answer += `• Pivot: $${data.levels.pivot.toFixed(2)}\n`;
      answer += `• S1 (Support 1): $${data.levels.s1.toFixed(2)}\n`;
      answer += `• S2 (Support 2): $${data.levels.s2.toFixed(2)}\n`;
      answer += `• Day High: $${data.levels.high.toFixed(2)}\n`;
      answer += `• Day Low: $${data.levels.low.toFixed(2)}\n`;
      if (data.levels.vwap) {
        answer += `• VWAP: $${data.levels.vwap.toFixed(2)}`;
      }
    } else if (wantsVolume) {
      answer += `**${data.ticker}:** ${priceStr} ${changeStr}\n`;
      answer += `• Volume: ${data.volume ? formatNumber(data.volume) : 'N/A'}\n`;
      if (data.vwap) answer += `• VWAP: $${data.vwap.toFixed(2)}`;
    } else {
      // Default price response
      answer += `**${data.ticker}:** ${priceStr} ${changeStr}\n`;
      answer += `• Open: $${data.open?.toFixed(2) || 'N/A'} | High: $${data.high?.toFixed(2) || 'N/A'} | Low: $${data.low?.toFixed(2) || 'N/A'}\n`;
      answer += `• Volume: ${data.volume ? formatNumber(data.volume) : 'N/A'}`;
      if (data.vwap) answer += ` | VWAP: $${data.vwap.toFixed(2)}`;
    }
  });

  return {
    answer,
    data: tickerData,
  };
}

// Handle quick analysis using Haiku + API data
async function handleQuickAnalysis(
  query: string,
  classification: QueryClassification,
  watchlist: string[]
): Promise<QueryResponse> {
  const tickers = classification.tickers.length > 0 
    ? classification.tickers 
    : watchlist.slice(0, 3); // Use first 3 watchlist tickers if none specified

  if (tickers.length === 0) {
    return {
      routedTo: 'QUICK_ANALYSIS',
      answer: "I need a ticker symbol to analyze. Please specify a stock like SPY, TSLA, or NVDA.",
      data: null,
    };
  }

  // Fetch relevant data based on what's needed
  const dataPromises: Promise<any>[] = [];
  const dataTypes: string[] = [];

  // Always fetch price data
  dataPromises.push(Promise.all(tickers.map(t => fetchTickerData(t, ['price']))));
  dataTypes.push('price');

  // Fetch additional data if needed
  if (classification.dataNeeded.includes('news')) {
    dataPromises.push(fetchNewsForTickers(tickers));
    dataTypes.push('news');
  }

  if (classification.dataNeeded.includes('options')) {
    dataPromises.push(fetchOptionsSnapshot(tickers[0])); // Primary ticker only
    dataTypes.push('options');
  }

  const results = await Promise.all(dataPromises);
  
  // Build context for Haiku
  let context = `User Query: "${query}"\n\n`;
  
  results.forEach((result, index) => {
    const dataType = dataTypes[index];
    if (dataType === 'price') {
      context += `Price Data:\n${JSON.stringify(result, null, 2)}\n\n`;
    } else if (dataType === 'news') {
      context += `Recent News:\n${JSON.stringify(result?.slice(0, 5), null, 2)}\n\n`;
    } else if (dataType === 'options') {
      context += `Options Snapshot:\n${JSON.stringify(result, null, 2)}\n\n`;
    }
  });

  // Get quick analysis from Haiku
  const analysis = await getQuickAnalysis(query, context, tickers);

  return {
    routedTo: 'QUICK_ANALYSIS',
    answer: analysis,
    data: {
      tickers,
      priceData: results[0],
    },
  };
}

// Get quick analysis from Haiku
async function getQuickAnalysis(query: string, context: string, tickers: string[]): Promise<string> {
  const ANALYSIS_PROMPT = `You are a concise trading analyst. Answer the user's question directly using the provided data.

Rules:
- Be direct and specific
- Reference actual numbers from the data
- Keep response to 2-4 sentences for simple questions
- Include actionable insight when relevant
- Don't add disclaimers or caveats
- Format prices with $ and percentages with %

${context}

Answer the question concisely:`;

  try {
    const response = await fetch(
      'https://api.anthropic.com/v1/messages',
      {
        method: 'POST',
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          messages: [
            { role: 'system', content: ANALYSIS_PROMPT },
            { role: 'user', content: query },
          ],
          max_tokens: 500,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Analysis API error: ${response.status}`);
    }

    const data = await response.json();
    return data.content?.[0]?.text || 'Unable to generate analysis.';
  } catch (error) {
    console.error('Quick analysis error:', error);
    return 'Unable to complete analysis. Please try again.';
  }
}

// Fetch news for tickers
async function fetchNewsForTickers(tickers: string[]): Promise<any[]> {
  try {
    const tickerQuery = tickers.join(',');
    const newsUrl = `${POLYGON_BASE_URL}/v2/reference/news?ticker=${tickerQuery}&limit=10&order=desc&apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(newsUrl, {
      next: { revalidate: 60 },
    });
    
    if (response.ok) {
      const data = await response.json();
      return data.results || [];
    }
  } catch (error) {
    console.error('News fetch error:', error);
  }
  return [];
}

// Fetch options snapshot for a ticker
async function fetchOptionsSnapshot(ticker: string): Promise<any> {
  try {
    const url = `${POLYGON_BASE_URL}/v3/snapshot/options/${ticker}?limit=20&apiKey=${POLYGON_API_KEY}`;
    const response = await fetch(url, {
      next: { revalidate: 10 },
    });
    
    if (response.ok) {
      const data = await response.json();
      const contracts = data.results || [];
      
      // Summarize options data
      const calls = contracts.filter((c: any) => c.details?.contract_type === 'call');
      const puts = contracts.filter((c: any) => c.details?.contract_type === 'put');
      
      const totalCallVolume = calls.reduce((sum: number, c: any) => sum + (c.day?.volume || 0), 0);
      const totalPutVolume = puts.reduce((sum: number, c: any) => sum + (c.day?.volume || 0), 0);
      
      return {
        ticker,
        callCount: calls.length,
        putCount: puts.length,
        callVolume: totalCallVolume,
        putVolume: totalPutVolume,
        putCallRatio: totalCallVolume > 0 ? (totalPutVolume / totalCallVolume).toFixed(2) : 'N/A',
      };
    }
  } catch (error) {
    console.error('Options fetch error:', error);
  }
  return null;
}

// Helper function to format large numbers
function formatNumber(num: number): string {
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(2)}B`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}
