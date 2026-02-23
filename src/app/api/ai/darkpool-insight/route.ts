import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are an institutional dark pool analyst. Analyze the provided dark pool data and give a concise, actionable insight.

## INTERPRETATION GUIDE

**Trade Location vs Quote:**
- Price >= Ask: Aggressive buying (BULLISH)
- Price <= Bid: Aggressive selling (BEARISH)
- Price at Mid: Neutral/passive

**Print Size Significance:**
- $50M+: Whale activity, major institutional move
- $10M-$50M: Large institutional block
- $1M-$10M: Standard institutional flow
- <$1M: Smaller institutional or retail

**Regime Detection:**
- ACCUMULATION: >55% bullish value + largest print bullish
- DISTRIBUTION: >55% bearish value + largest print bearish
- NEUTRAL: Mixed signals

**Price Level Analysis:**
- Multiple prints at same level = institutional support/resistance
- Size distribution skew indicates institutional vs retail mix

## OUTPUT FORMAT
- 2-3 sentences maximum
- Highlight the largest prints and their implication
- Note key price levels with heavy institutional activity
- No disclaimers or hedging language
- End with clear accumulation/distribution bias`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { stats, prints, ticker } = await request.json();

    if (!stats) {
      return NextResponse.json({
        success: false,
        error: 'Dark pool stats required',
      }, { status: 400 });
    }

    // Build context from dark pool data
    const context = buildDarkPoolContext(stats, prints, ticker);

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
        regime: stats.regime,
      },
    });

  } catch (error: any) {
    console.error('Dark pool insight error:', error);
    return NextResponse.json({
      success: false,
      error: "An error occurred" || 'Failed to generate insight',
    }, { status: 500 });
  }
}

function buildDarkPoolContext(stats: any, prints: any[], ticker?: string): string {
  const lines = [
    `## Dark Pool Analysis${ticker ? ` for ${ticker}` : ''}`,
    '',
    '**Key Metrics:**',
    `- Total Value: $${(stats.totalValue / 1e6).toFixed(2)}M`,
    `- Total Prints: ${stats.printCount}`,
    `- Bullish Value: $${(stats.bullishValue / 1e6).toFixed(2)}M (${stats.bullishPct}%)`,
    `- Bearish Value: $${(stats.bearishValue / 1e6).toFixed(2)}M (${stats.bearishPct}%)`,
    `- Current Regime: ${stats.regime}`,
  ];

  // Add largest print
  if (stats.largestPrint) {
    lines.push('', '**Largest Print:**');
    lines.push(`- ${stats.largestPrint.ticker} at $${stats.largestPrint.price?.toFixed(2)} - $${(stats.largestPrint.value / 1e6).toFixed(2)}M (${stats.largestPrint.side})`);
  }

  // Add size distribution
  if (stats.sizeDistribution) {
    lines.push('', '**Size Distribution:**');
    lines.push(`- Mega ($10M+): ${stats.sizeDistribution.mega} prints`);
    lines.push(`- Large ($1M-$10M): ${stats.sizeDistribution.large} prints`);
    lines.push(`- Medium ($500K-$1M): ${stats.sizeDistribution.medium} prints`);
    lines.push(`- Small (<$500K): ${stats.sizeDistribution.small} prints`);
  }

  // Add key price levels
  if (stats.priceLevels && stats.priceLevels.length > 0) {
    lines.push('', '**Key Price Levels:**');
    stats.priceLevels.slice(0, 5).forEach((level: any) => {
      const bullishPct = level.totalValue > 0 ? ((level.bullishValue / level.totalValue) * 100).toFixed(0) : 0;
      lines.push(`- $${level.price.toFixed(2)}: $${(level.totalValue / 1e6).toFixed(2)}M across ${level.printCount} prints (${bullishPct}% bullish)`);
    });
  }

  // Add recent large prints
  if (prints && prints.length > 0) {
    const largePrints = prints.filter((p: any) => p.value >= 1000000).slice(0, 5);
    if (largePrints.length > 0) {
      lines.push('', '**Recent Large Prints ($1M+):**');
      largePrints.forEach((print: any) => {
        lines.push(`- ${print.ticker} $${print.price?.toFixed(2)} - $${(print.value / 1e6).toFixed(2)}M (${print.side})`);
      });
    }
  }

  lines.push('', 'Provide your analysis:');

  return lines.join('\n');
}
