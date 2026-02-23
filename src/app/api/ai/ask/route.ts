import { NextRequest, NextResponse } from 'next/server';
import { validateText } from '@/lib/security';

// Databricks configuration
const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
// Foundation Model endpoint (NOT the old supervisor agent)
const HAIKU_ENDPOINT = 'databricks-claude-haiku-4-5';

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
    if (!DATABRICKS_HOST || DATABRICKS_HOST.includes('your-workspace')) {
      return NextResponse.json(
        { success: false, error: 'AI service is not configured' },
        { status: 503 }
      );
    }

    if (!DATABRICKS_TOKEN || DATABRICKS_TOKEN.includes('your-personal-access-token')) {
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

    // Build messages array for Foundation Model API (OpenAI-compatible)
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: SYSTEM_PROMPT },
    ];

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

    // Call Claude Haiku via Databricks Foundation Model API
    const response = await fetch(
      `${DATABRICKS_HOST}/serving-endpoints/${HAIKU_ENDPOINT}/invocations`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        },
        body: JSON.stringify({
          messages,
          max_tokens: 1000,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout (Haiku is fast)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Ask] Haiku error:', response.status, errorText);

      let errorMessage = 'AI service error';
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorJson.message || `HTTP ${response.status}`;
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

    // Databricks Foundation Model API returns OpenAI-compatible format:
    // { choices: [{ message: { content: "..." } }] }
    let message = '';

    if (data.choices?.[0]?.message?.content) {
      message = data.choices[0].message.content;
    } else if (data.content) {
      // Fallback: direct content format
      message = Array.isArray(data.content)
        ? data.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n\n')
        : typeof data.content === 'string' ? data.content : '';
    }

    if (!message || message.trim() === '') {
      console.error('[AI Ask] Empty response from Haiku:', JSON.stringify(data).substring(0, 500));
      return NextResponse.json(
        { success: false, error: 'Empty response from AI service' },
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
