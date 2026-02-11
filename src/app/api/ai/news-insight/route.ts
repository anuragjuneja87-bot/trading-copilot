import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are a Market News Analyst providing sentiment insights for day traders.

## YOUR TASK
Analyze the news sentiment data and provide a concise market mood assessment in 2-3 sentences.

## INTERPRETATION GUIDE

**Overall Mood:**
- RISK_ON: Bullish sentiment dominates, market favors buying
- RISK_OFF: Bearish sentiment dominates, market favors caution/selling
- NEUTRAL: Mixed signals, no clear direction

**Key Indicators:**
- SPY/QQQ sentiment: Broad market direction
- VIX mentions: High mentions often indicate fear/volatility
- Sector concentration: Is sentiment concentrated or broad?

**What to highlight:**
1. Overall market bias with conviction level
2. Notable ticker(s) driving sentiment (bullish or bearish leaders)
3. Any warning signs or opportunities to watch

## OUTPUT REQUIREMENTS
- 2-3 sentences maximum
- Be specific about tickers and sentiment
- State actionable insight (what to watch, potential opportunities)
- No disclaimers or hedge words`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { context } = await request.json();
    
    if (!context || context.totalArticles === 0) {
      return NextResponse.json({ 
        insight: 'Waiting for news data...',
        cached: false,
        latencyMs: Date.now() - startTime,
      });
    }

    const summary = formatNewsContext(context);

    const response = await fetch(
      `${process.env.DATABRICKS_HOST}/serving-endpoints/databricks-claude-haiku-4-5/invocations`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DATABRICKS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Analyze this news sentiment data:\n\n${summary}` },
          ],
          max_tokens: 300,
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`Databricks API error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content || 'Unable to generate insight.';
    const latencyMs = Date.now() - startTime;

    console.log(`News insight generated in ${latencyMs}ms`);

    return NextResponse.json({ 
      insight,
      cached: false,
      latencyMs,
      usage: data.usage,
    });

  } catch (error) {
    console.error('News insight error:', error);
    return NextResponse.json({ 
      insight: 'AI analysis temporarily unavailable. Review the sentiment scores below.',
      cached: false,
      latencyMs: Date.now() - startTime,
      error: true,
    });
  }
}

function formatNewsContext(context: any): string {
  const lines: string[] = [];
  
  lines.push(`Total Articles Analyzed: ${context.totalArticles}`);
  lines.push(`Overall Market Mood: ${context.overall} (score: ${context.score})`);
  
  lines.push(`\nSentiment Distribution:`);
  lines.push(`  Bullish articles: ${context.distribution.bullish}`);
  lines.push(`  Bearish articles: ${context.distribution.bearish}`);
  lines.push(`  Neutral articles: ${context.distribution.neutral}`);
  
  lines.push(`\nMarket Index Sentiment:`);
  lines.push(`  SPY: ${context.spySentiment > 0 ? '+' : ''}${context.spySentiment.toFixed(2)}`);
  lines.push(`  QQQ: ${context.qqqSentiment > 0 ? '+' : ''}${context.qqqSentiment.toFixed(2)}`);
  lines.push(`  VIX mentions: ${context.vixMentions} articles`);
  
  if (context.topBullish?.length > 0) {
    lines.push(`\nTop Bullish Tickers: ${context.topBullish.join(', ')}`);
  }
  
  if (context.topBearish?.length > 0) {
    lines.push(`Top Bearish Tickers: ${context.topBearish.join(', ')}`);
  }
  
  if (context.tickerSentiments?.length > 0) {
    lines.push(`\nTicker Sentiment Details:`);
    context.tickerSentiments.slice(0, 8).forEach((t: any) => {
      const scoreStr = t.sentimentScore > 0 ? `+${t.sentimentScore.toFixed(2)}` : t.sentimentScore.toFixed(2);
      lines.push(`  ${t.ticker}: ${scoreStr} (${t.sentimentLabel}) - ${t.articleCount} articles`);
      if (t.latestHeadline) {
        lines.push(`    Latest: "${t.latestHeadline.slice(0, 60)}..."`);
      }
    });
  }
  
  return lines.join('\n');
}
