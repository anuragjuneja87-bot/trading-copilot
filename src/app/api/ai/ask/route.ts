import { NextRequest, NextResponse } from 'next/server';
import { validateText } from '@/lib/security';

// Anthropic API (direct — no Databricks needed for LLM)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are Yodha, the AI trading analyst powering TradeYodha's War Room. You have access to LIVE institutional-grade data that retail traders never see.

CRITICAL INSTRUCTIONS:
1. You MUST reference specific numbers from [WAR ROOM DATA] in EVERY response. Never give generic trading advice.
2. Cross-reference ALL available signals. If 4 of 6 panels are bearish, say "4 of 6 War Room signals are bearish: flow is X% calls, dark pool shows Y% bullish, RS is Z vs SPY, CVD is rising/falling."
3. Always compute risk/reward using the levels provided. Example: "Entry at VWAP ($X), target call wall ($Y) = Z% upside. Stop at put wall ($W) = A% risk. R:R is Z:A."
4. Be DECISIVE. Say "I'd be looking for shorts here" not "traders might consider." You're a senior desk analyst, not a compliance officer.
5. If signals conflict, explain the divergence: "Flow says bullish but dark pool says distribution — this means smart money is selling into retail call buying."

DATA INTERPRETATION GUIDE:
- Options Flow: Call ratio >60% = bullish, <40% = bearish. Net delta-adjusted flow positive = institutions positioning bullish.
- Dark Pool: Bullish% >55% = accumulation (institutional buying), <45% = distribution (selling). Large prints (>$5M) signal conviction.
- GEX/Gamma: Above GEX flip = positive gamma (mean-reversion, support holds). Below = negative gamma (trend extends, breakdowns accelerate).
- VWAP: Price above = buyers in control. Below = sellers in control. Bounces off VWAP are high-probability entries.
- Relative Strength: RS > 0 = outperforming SPY (own-strength). RS < 0 = lagging (avoid longs in weak names on market weakness).
- ML Model: Move probability >80% = high-confidence. Direction confidence >70% = actionable signal.
- Volume Pressure: >60% = heavy buying pressure. <40% = heavy selling pressure.

RESPONSE FORMAT:
- Lead with your directional call and WHY (1 sentence)
- Support with 2-3 specific data points from the War Room
- Give exact levels for entry/stop/target when asked
- Keep responses 3-8 sentences unless user asks for deep analysis
- Use bold for key prices and levels: **$180.05**, **call wall at $700**

Never give disclaimers. Never say "it depends" without following up with your actual read.`;

export async function POST(request: NextRequest) {
  try {
    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'AI service is not configured' },
        { status: 503 }
      );
    }

    const { question: rawQuestion, history } = await request.json();
    const question = validateText(rawQuestion, 5000);

    if (!question) {
      return NextResponse.json(
        { success: false, error: 'Question is required' },
        { status: 400 }
      );
    }

    // Build messages array for Anthropic Messages API
    const messages: { role: string; content: string }[] = [];

    // Add conversation history (last 10 turns)
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        messages.push({
          role: msg.role === 'assistant' ? 'assistant' : 'user',
          content: msg.content,
        });
      }
    }

    // Add current question
    messages.push({ role: 'user', content: question });

    const startTime = Date.now();

    // Call Anthropic API directly
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Ask] Anthropic error:', response.status, errorText);

      let errorMessage = 'AI service error';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || `HTTP ${response.status}`;
      } catch {
        errorMessage = `HTTP ${response.status}`;
      }

      return NextResponse.json(
        { success: false, error: errorMessage },
        { status: response.status >= 500 ? 500 : response.status }
      );
    }

    const data = await response.json();
    const elapsedMs = Date.now() - startTime;

    // Anthropic Messages API format:
    // { content: [{ type: "text", text: "..." }], ... }
    let message = '';

    if (data.content && Array.isArray(data.content)) {
      message = data.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('\n\n');
    } else if (typeof data.content === 'string') {
      message = data.content;
    }

    if (!message || message.trim() === '') {
      console.error('[AI Ask] Empty response:', JSON.stringify(data).substring(0, 500));
      return NextResponse.json(
        { success: false, error: 'Empty response from AI' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        message: message.trim(),
        latencyMs: elapsedMs,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error: any) {
    console.error('[AI Ask] Error:', error);

    if (error.name === 'AbortError' || error.name === 'TimeoutError') {
      return NextResponse.json(
        { success: false, error: 'Request timed out. Please try again.' },
        { status: 504 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'An error occurred' },
      { status: 500 }
    );
  }
}
