import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a market news sentiment analyst. Analyze the provided news sentiment data and give a concise, actionable market mood summary.

## INTERPRETATION GUIDE

**Market Mood Score:**
- > 0.3: Strong risk-on sentiment
- 0.1 to 0.3: Mild bullish bias
- -0.1 to 0.1: Neutral/mixed
- -0.3 to -0.1: Mild bearish bias
- < -0.3: Strong risk-off sentiment

**Sentiment Distribution:**
- Skew toward bullish = risk appetite increasing
- Skew toward bearish = defensive positioning likely
- Heavy neutral = uncertainty, potential breakout either direction

**Ticker Sentiment:**
- Individual ticker sentiment extremes can signal opportunities
- Divergence from market = relative strength/weakness

## OUTPUT FORMAT
- 2-3 sentences maximum
- Highlight overall market bias
- Call out specific tickers with extreme sentiment
- Note any divergences or warning signs
- No disclaimers or hedging language`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { marketMood, tickerSentiments, articles } = await request.json();

    if (!marketMood) {
      return NextResponse.json({
        success: false,
        error: 'Market mood data required',
      }, { status: 400 });
    }

    // Build context from news data
    const context = buildNewsContext(marketMood, tickerSentiments, articles);

    // Call Databricks Claude Haiku
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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: context },
          ],
          max_tokens: 300,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Databricks API error:', errorText);
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.content?.[0]?.text || null;

    return NextResponse.json({
      success: true,
      data: {
        insight,
        processingTime: Date.now() - startTime,
        regime: marketMood.overall,
      },
    });

  } catch (error: any) {
    console.error('News insight error:', error);
    return NextResponse.json({
      success: false,
      error: "An error occurred" || 'Failed to generate insight',
    }, { status: 500 });
  }
}

function buildNewsContext(marketMood: any, tickerSentiments: any[], articles: any[]): string {
  const lines = [
    '## Market News Sentiment Analysis',
    '',
    '**Overall Market Mood:**',
    `- Regime: ${marketMood.overall}`,
    `- Sentiment Score: ${marketMood.score?.toFixed(2) || 'N/A'}`,
    `- SPY Sentiment: ${marketMood.spySentiment?.toFixed(2) || 'N/A'}`,
    `- QQQ Sentiment: ${marketMood.qqqSentiment?.toFixed(2) || 'N/A'}`,
    `- VIX Mentions: ${marketMood.vixMentions || 0}`,
    '',
    '**Sentiment Distribution:**',
    `- Bullish Articles: ${marketMood.distribution?.bullish || 0}`,
    `- Bearish Articles: ${marketMood.distribution?.bearish || 0}`,
    `- Neutral Articles: ${marketMood.distribution?.neutral || 0}`,
    `- Total Articles: ${marketMood.totalArticles || 0}`,
  ];

  // Add top bullish/bearish tickers
  if (marketMood.topBullish?.length > 0) {
    lines.push('', '**Most Bullish Tickers:** ' + marketMood.topBullish.join(', '));
  }
  if (marketMood.topBearish?.length > 0) {
    lines.push('**Most Bearish Tickers:** ' + marketMood.topBearish.join(', '));
  }

  // Add individual ticker sentiments
  if (tickerSentiments && tickerSentiments.length > 0) {
    lines.push('', '**Ticker Sentiment Breakdown:**');
    tickerSentiments.slice(0, 8).forEach((ts: any) => {
      lines.push(`- ${ts.ticker}: ${ts.sentimentLabel} (${ts.sentimentScore?.toFixed(2)}) - ${ts.articleCount} articles`);
    });
  }

  // Add recent headlines
  if (articles && articles.length > 0) {
    lines.push('', '**Recent Headlines:**');
    articles.slice(0, 5).forEach((article: any) => {
      const sentiment = article.sentimentLabel || article.sentiment || 'NEUTRAL';
      lines.push(`- [${sentiment}] ${article.title?.substring(0, 80)}...`);
    });
  }

  lines.push('', 'Provide your analysis:');

  return lines.join('\n');
}
