import { NextRequest, NextResponse } from 'next/server';
import { validateText } from '@/lib/security';

// Anthropic API (direct — no Databricks needed for LLM)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are Yodha, the AI trading analyst inside TradeYodha — a day trading platform with real-time options flow, dark pool data, gamma levels, and ML predictions.

You receive a [WAR ROOM DATA] block with LIVE market data for the ticker the trader is looking at. This is YOUR edge — no other chatbot has this data in real-time. Use it aggressively.

HOW TO RESPOND:
- Be DIRECT and OPINIONATED. Traders want a clear take, not "it depends."
- ALWAYS reference specific numbers from the war room data. Say "$700 call wall is 9.8% above" not "there's resistance above."
- Cross-reference signals: if flow is bearish AND dark pool is bearish AND RS is weak, say so. If signals conflict, call out the divergence.
- Keep it concise: 3-6 sentences for simple questions, more for "break it down" requests.
- Use trader language: support/resistance, gamma exposure, flow, sweeps, dark pool prints, GEX flip, delta, premium.
- If the ML model shows a signal, reference its confidence level and direction.
- If data is missing or session is closed, acknowledge it — don't make up numbers.

SIGNAL SYNTHESIS:
- Options flow call ratio >60% = bullish flow, <40% = bearish flow
- Dark pool bullish% >55% = institutional buying, <45% = institutional selling
- GEX flip: price above = positive gamma (stabilizing), below = negative gamma (volatile)
- RS vs SPY > 0 = outperforming market, < 0 = underperforming
- ML move probability >80% = high-confidence signal

Never give financial advice disclaimers. You are an analysis tool presenting data-driven observations.`;

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
        model: 'claude-haiku-4-5-20251001',
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
