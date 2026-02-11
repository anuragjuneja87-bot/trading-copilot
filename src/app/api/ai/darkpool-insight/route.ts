import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are an expert Dark Pool Analyst providing institutional flow insights for day traders.

## YOUR TASK
Analyze dark pool print data and provide a concise, actionable insight in 2-3 sentences.

## INTERPRETATION GUIDE

**Trade Location (Side):**
- BULLISH (Above Ask): Aggressive buying, institutions paying up
- BEARISH (Below Bid): Aggressive selling, institutions hitting bids
- NEUTRAL (At Mid): Could be crossing or hedging, less directional

**Print Size Significance:**
- >$10M (Mega): Whale activity, highest significance
- $1-10M (Large): Institutional block, high significance
- $500K-$1M (Medium): Could be institutional or large retail
- <$500K: Lower significance for dark pool analysis

**Key Patterns:**
- Multiple prints at same price level = Accumulation/Distribution zone
- Large prints above ask = Strong institutional demand, potential support
- Large prints below bid = Institutional supply, potential resistance
- Cluster of mega prints = Major institutional repositioning

**Regime:**
- ACCUMULATION: Bullish bias, institutions building positions
- DISTRIBUTION: Bearish bias, institutions reducing positions
- NEUTRAL: Mixed flow, no clear direction

## OUTPUT REQUIREMENTS
- 2-3 sentences maximum
- Be specific about price levels and values
- State the direction with conviction level
- Identify key levels to watch
- No disclaimers or hedge words`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { context } = await request.json();
    
    if (!context || context.printCount === 0) {
      return NextResponse.json({ 
        insight: 'Waiting for dark pool data...',
        cached: false,
        latencyMs: Date.now() - startTime,
      });
    }

    const summary = formatDarkPoolContext(context);

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
            { role: 'user', content: `Analyze this dark pool data:\n\n${summary}` },
          ],
          max_tokens: 300,
        }),
        signal: AbortSignal.timeout(30000),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Databricks API error:', response.status, errorText);
      throw new Error(`Databricks API error: ${response.status}`);
    }

    const data = await response.json();
    const insight = data.choices?.[0]?.message?.content || 'Unable to generate insight.';
    const latencyMs = Date.now() - startTime;

    console.log(`Dark pool insight generated in ${latencyMs}ms`);

    return NextResponse.json({ 
      insight,
      cached: false,
      latencyMs,
      usage: data.usage,
    });

  } catch (error) {
    console.error('Dark pool insight error:', error);
    return NextResponse.json({ 
      insight: 'AI analysis temporarily unavailable. Review the price levels and largest prints manually.',
      cached: false,
      latencyMs: Date.now() - startTime,
      error: true,
    });
  }
}

function formatDarkPoolContext(context: any): string {
  const lines: string[] = [];
  
  // Ticker focus
  if (context.ticker && context.ticker !== 'All') {
    lines.push(`Focus: ${context.ticker}`);
  } else {
    lines.push(`Scope: Broad market (SPY, QQQ, NVDA, TSLA, etc.)`);
  }
  
  // Overall stats
  lines.push(`Total Dark Pool Value: ${formatValue(context.totalValue)}`);
  lines.push(`Print Count: ${context.printCount}`);
  lines.push(`Bullish vs Bearish: ${context.bullishPct}% / ${context.bearishPct}%`);
  lines.push(`Regime: ${context.regime}`);
  
  // Largest print
  if (context.largestPrint) {
    const lp = context.largestPrint;
    lines.push(`\nLargest Print: ${lp.ticker} @ $${lp.price.toFixed(2)} - ${formatValue(lp.value)} (${lp.side})`);
  }
  
  // Key price levels
  if (context.priceLevels && context.priceLevels.length > 0) {
    lines.push(`\nKey Price Levels (by value):`);
    context.priceLevels.slice(0, 5).forEach((level: any, i: number) => {
      const bullishPct = level.totalValue > 0 
        ? Math.round((level.bullishValue / level.totalValue) * 100) 
        : 0;
      lines.push(`  ${i + 1}. ${level.ticker} $${level.price.toFixed(2)}: ${formatValue(level.totalValue)} (${level.printCount} prints, ${bullishPct}% bullish)`);
    });
  }
  
  // Size distribution
  if (context.sizeDistribution) {
    const sd = context.sizeDistribution;
    lines.push(`\nPrint Size Distribution:`);
    lines.push(`  Mega ($10M+): ${sd.mega} prints`);
    lines.push(`  Large ($1M-$10M): ${sd.large} prints`);
    lines.push(`  Medium ($500K-$1M): ${sd.medium} prints`);
  }
  
  // Top prints
  if (context.topPrints && context.topPrints.length > 0) {
    lines.push(`\nTop Prints:`);
    context.topPrints.slice(0, 3).forEach((print: any, i: number) => {
      lines.push(`  ${i + 1}. ${print.ticker} $${print.price.toFixed(2)} - ${formatValue(print.value)} - ${print.side}`);
    });
  }
  
  return lines.join('\n');
}

function formatValue(value: number): string {
  if (value >= 1000000000) return `$${(value / 1000000000).toFixed(1)}B`;
  if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}
