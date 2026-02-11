import { NextRequest, NextResponse } from 'next/server';

// System prompt for the Options Flow Analyst
const SYSTEM_PROMPT = `You are an expert Options Flow Analyst providing real-time trading insights for day traders.

## YOUR TASK
Analyze the provided options flow data and give a concise, actionable trading insight in 2-3 sentences.

## INTERPRETATION GUIDE

**Net Delta Flow (delta-adjusted premium):**
- > +$500K: Strong bullish bias
- +$100K to +$500K: Moderate bullish
- -$100K to +$100K: Neutral/balanced
- -$500K to -$100K: Moderate bearish
- < -$500K: Strong bearish bias

**Sweep Ratio (urgency indicator):**
- > 50%: Very high urgency, likely informed trading
- 30-50%: Elevated urgency
- < 30%: Normal activity

**Smart Money Patterns:**
- Repeated sweeps same direction = strong conviction
- Large ITM calls = stock replacement (bullish)
- OTM call sweeps = leveraged upside bet
- Put sweeps + call selling = bearish positioning
- Put buying alone = could be hedging, not necessarily bearish

**What to include in your response:**
1. Clear directional assessment (bullish/bearish/neutral) with conviction level
2. Key supporting evidence from the data
3. One specific level or trade to watch

**Rules:**
- Be direct and confident - no hedging language like "might" or "could"
- No disclaimers or financial advice warnings
- Reference specific numbers from the data
- Keep it to 2-3 sentences maximum`;

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { context } = await request.json();
    
    // Validate we have data to analyze
    if (!context || context.tradeCount === 0) {
      return NextResponse.json({ 
        insight: 'Waiting for flow data to accumulate...',
        cached: false,
        latencyMs: Date.now() - startTime,
      });
    }

    // Validate Databricks configuration
    const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
    const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
    const DATABRICKS_ENDPOINT = process.env.DATABRICKS_ENDPOINT || 'databricks-claude-haiku-4-5';

    if (!DATABRICKS_HOST || !DATABRICKS_TOKEN) {
      return NextResponse.json({ 
        insight: generateFallbackInsight(context),
        cached: false,
        latencyMs: Date.now() - startTime,
        error: 'Databricks not configured',
      });
    }

    // Format the flow data for the AI
    const flowSummary = formatFlowContext(context);

    // Call Databricks Claude Haiku endpoint
    // Try both formats: messages format (Foundation Model API) and input format (custom endpoint)
    let response;
    let data;
    
    try {
      // Try messages format first (Foundation Model API)
      response = await fetch(
        `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: SYSTEM_PROMPT,
              },
              {
                role: 'user',
                content: `Analyze this options flow data:\n\n${flowSummary}`,
              },
            ],
            max_tokens: 300,
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        // Try input format (custom endpoint)
        const inputResponse = await fetch(
          `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              input: [
                {
                  role: 'system',
                  content: SYSTEM_PROMPT,
                },
                {
                  role: 'user',
                  content: `Analyze this options flow data:\n\n${flowSummary}`,
                },
              ],
            }),
            signal: AbortSignal.timeout(30000),
          }
        );

        if (!inputResponse.ok) {
          throw new Error(`Databricks API error: ${inputResponse.status}`);
        }

        data = await inputResponse.json();
      } else {
        data = await response.json();
      }
    } catch (fetchError) {
      console.error('Databricks fetch error:', fetchError);
      throw fetchError;
    }

    // Extract insight from response
    let insight = '';
    
    // Try multiple response formats
    if (data.choices && Array.isArray(data.choices)) {
      // Foundation Model API format
      insight = data.choices[0]?.message?.content || '';
    } else if (data.output && Array.isArray(data.output)) {
      // Custom endpoint format
      for (const item of data.output) {
        if (item.type === 'message' && item.role === 'assistant') {
          if (Array.isArray(item.content)) {
            const textParts = item.content
              .filter((p: any) => p.type === 'text' && p.text)
              .map((p: any) => p.text.trim());
            if (textParts.length > 0) {
              insight = textParts.join('\n\n');
              break;
            }
          } else if (typeof item.content === 'string') {
            insight = item.content.trim();
            break;
          }
        }
      }
    } else if (typeof data === 'string') {
      insight = data;
    } else if (data.text) {
      insight = data.text;
    }

    if (!insight || insight.trim().length === 0) {
      throw new Error('No insight generated from AI');
    }

    const latencyMs = Date.now() - startTime;
    console.log(`Flow insight generated in ${latencyMs}ms, tokens: ${data.usage?.total_tokens || 'N/A'}`);

    return NextResponse.json({ 
      insight: insight.trim(),
      cached: false,
      latencyMs,
      usage: data.usage,
    });

  } catch (error) {
    console.error('Flow insight error:', error);
    const latencyMs = Date.now() - startTime;
    
    // Return a fallback rule-based insight
    return NextResponse.json({ 
      insight: context ? generateFallbackInsight(context) : 'AI analysis temporarily unavailable. Review the charts and top trades for manual analysis.',
      cached: false,
      latencyMs,
      error: true,
    });
  }
}

// Format the context into a readable summary for the AI
function formatFlowContext(context: any): string {
  const lines: string[] = [];
  
  // Ticker focus
  if (context.ticker && context.ticker !== 'Market') {
    lines.push(`Ticker: ${context.ticker}`);
  } else {
    lines.push(`Scope: Broad market flow (SPY, QQQ, TSLA, NVDA, AAPL)`);
  }
  
  // Net delta flow
  const netFlowFormatted = formatPremium(context.netDeltaFlow || 0);
  const direction = context.netDeltaFlow > 0 ? 'bullish' : context.netDeltaFlow < 0 ? 'bearish' : 'neutral';
  lines.push(`Net Delta Flow: ${netFlowFormatted} (${direction})`);
  
  // Call/Put breakdown
  lines.push(`Call/Put Ratio: ${context.callPutRatio || '50% / 50%'}`);
  lines.push(`Total Premium: ${formatPremium(context.totalPremium || 0)}`);
  
  // Momentum
  lines.push(`Momentum: ${context.momentum || 'neutral'}`);
  
  // Urgency
  const sweepPct = Math.round((context.sweepRatio || 0) * 100);
  lines.push(`Sweep Urgency: ${sweepPct}% of premium via sweeps`);
  
  // Unusual activity
  lines.push(`Unusual Trades Flagged: ${context.unusualCount || 0}`);
  
  // Top trades
  if (context.topTrades && context.topTrades.length > 0) {
    lines.push(`\nTop Trades by Conviction:`);
    context.topTrades.slice(0, 3).forEach((trade: any, i: number) => {
      const type = trade.callPut === 'C' ? 'call' : 'put';
      const tradeType = trade.tradeType || 'regular';
      lines.push(`  ${i + 1}. ${trade.ticker} $${trade.strike} ${type} - ${formatPremium(trade.premium)} (${tradeType})`);
    });
  }
  
  // Key strikes
  if (context.keyStrikes && context.keyStrikes.length > 0) {
    lines.push(`\nKey Strikes by Premium:`);
    context.keyStrikes.slice(0, 3).forEach((strike: any) => {
      const callPrem = formatPremium(strike.callPremium || 0);
      const putPrem = formatPremium(strike.putPremium || 0);
      lines.push(`  $${strike.strike}: ${callPrem} calls, ${putPrem} puts`);
    });
  }
  
  return lines.join('\n');
}

function formatPremium(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : value > 0 ? '+' : '';
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(1)}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// Fallback when AI is unavailable
function generateFallbackInsight(context: any): string {
  if (!context || !context.netDeltaFlow) {
    return 'AI analysis temporarily unavailable. Review the charts and top trades for manual analysis.';
  }

  const direction = context.netDeltaFlow > 0 ? 'bullish' : context.netDeltaFlow < 0 ? 'bearish' : 'neutral';
  const flowFormatted = formatPremium(Math.abs(context.netDeltaFlow));
  const sweepPct = Math.round((context.sweepRatio || 0) * 100);
  
  let insight = `${direction.charAt(0).toUpperCase() + direction.slice(1)} flow detected (${flowFormatted} delta-adjusted). `;
  
  if (sweepPct > 30) {
    insight += `High urgency with ${sweepPct}% sweep activity. `;
  }
  
  if (context.topTrades && context.topTrades.length > 0) {
    const top = context.topTrades[0];
    insight += `Watch ${top.ticker} $${top.strike}${top.callPut === 'C' ? ' call' : ' put'} (${formatPremium(top.premium)}).`;
  }
  
  return insight;
}
