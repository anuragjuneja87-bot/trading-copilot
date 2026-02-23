import { NextRequest, NextResponse } from 'next/server';

const SYSTEM_PROMPT = `You are an elite options flow analyst. Analyze the provided options flow data and give a concise, actionable insight.

## INTERPRETATION GUIDE

**Net Delta-Adjusted Flow (CDAF):**
- > +$1M: Strong bullish institutional positioning
- > +$500K: Moderate bullish bias
- < -$500K: Moderate bearish bias
- < -$1M: Strong bearish institutional positioning

**Sweep Ratio:**
- > 40%: High urgency, institutions sweeping across exchanges
- 20-40%: Normal institutional activity
- < 20%: Passive positioning, less conviction

**Call/Put Ratio:**
- > 70% calls: Extremely bullish
- 55-70% calls: Bullish lean
- 45-55%: Balanced/neutral
- < 45% calls: Bearish lean

**Smart Money Score:**
- 7-10: Very high conviction trades
- 5-7: Solid institutional interest
- < 5: Retail-dominated flow

## OUTPUT FORMAT
- 2-3 sentences maximum
- Be specific with numbers and strikes
- Include actionable levels (support/resistance from flow)
- No disclaimers or hedging language
- End with a clear directional bias or key level to watch`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { stats, topTrades, ticker } = await request.json();

    if (!stats) {
      return NextResponse.json({
        success: false,
        error: 'Flow stats required',
      }, { status: 400 });
    }

    // Build context from flow data
    const context = buildFlowContext(stats, topTrades, ticker);

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
    console.error('Flow insight error:', error);
    return NextResponse.json({
      success: false,
      error: "An error occurred" || 'Failed to generate insight',
    }, { status: 500 });
  }
}

function buildFlowContext(stats: any, topTrades: any[], ticker?: string): string {
  const lines = [
    `## Options Flow Analysis${ticker ? ` for ${ticker}` : ''}`,
    '',
    '**Key Metrics:**',
    `- Net Delta-Adjusted Flow (CDAF): $${(stats.netDeltaAdjustedFlow / 1e6).toFixed(2)}M`,
    `- Total Premium: $${(stats.totalPremium / 1e6).toFixed(2)}M`,
    `- Call/Put Ratio: ${stats.callRatio}% calls / ${stats.putRatio}% puts`,
    `- Sweep Ratio: ${(stats.sweepRatio * 100).toFixed(0)}%`,
    `- Unusual Trade Count: ${stats.unusualCount}`,
    `- Average Smart Money Score: ${stats.avgSmartMoneyScore?.toFixed(1) || 'N/A'}/10`,
    `- Flow Momentum: ${stats.momentumDirection}`,
    `- Current Regime: ${stats.regime}`,
  ];

  // Add top trades if available
  if (topTrades && topTrades.length > 0) {
    lines.push('', '**Top Smart Money Trades:**');
    topTrades.slice(0, 5).forEach((trade: any, i: number) => {
      lines.push(`${i + 1}. ${trade.ticker} ${trade.callPut === 'C' ? 'CALL' : 'PUT'} $${trade.strike} exp ${trade.expiry} - $${(trade.premium / 1000).toFixed(0)}K premium (Score: ${trade.smartMoneyScore}/10)`);
    });
  }

  // Add key strikes if available
  if (stats.gexByStrike && stats.gexByStrike.length > 0) {
    lines.push('', '**Key Strikes by Premium:**');
    stats.gexByStrike.slice(0, 5).forEach((strike: any) => {
      const callPct = strike.callPremium / (strike.callPremium + strike.putPremium) * 100;
      lines.push(`- $${strike.strike}: $${((strike.callPremium + strike.putPremium) / 1000).toFixed(0)}K total (${callPct.toFixed(0)}% calls)`);
    });
  }

  lines.push('', 'Provide your analysis:');

  return lines.join('\n');
}
