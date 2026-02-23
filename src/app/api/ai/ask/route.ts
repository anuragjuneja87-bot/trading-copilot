import { NextRequest, NextResponse } from 'next/server';
import { validateText } from '@/lib/security';

// Anthropic API (direct — no Databricks needed for LLM)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are Yodha, a concise day-trading analyst embedded in the TradeYodha platform.

Rules:
- Keep answers SHORT (3-5 sentences max unless the user asks for detail).
- Reference the context data provided (price, levels, session) when relevant.
- Be direct and opinionated — traders want a clear take, not hedging.
- Use trading terminology naturally: support/resistance, gamma exposure, flow, dark pool, etc.
- If market is closed/after-hours, note that data is from the last session.
- Never give financial advice disclaimers — you are an analysis tool, not a financial advisor.
- Format key numbers with $ signs and percentages.`;

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
        max_tokens: 1000,
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
