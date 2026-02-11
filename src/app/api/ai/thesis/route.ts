import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';

// Databricks configuration
const DATABRICKS_HOST = process.env.DATABRICKS_HOST;
const DATABRICKS_TOKEN = process.env.DATABRICKS_TOKEN;
const DATABRICKS_ENDPOINT = process.env.DATABRICKS_ENDPOINT || 'mas-7ab7b2ce-endpoint';
const DATABRICKS_TIMEOUT = parseInt(process.env.DATABRICKS_TIMEOUT || '300000', 10);

interface ThesisData {
  ticker: string;
  verdict?: 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  support?: string;
  resistance?: string;
  entry?: string;
  target?: string;
  stop?: string;
  reasoning?: string;
  fullResponse: string;
  error?: string;
}

// Helper: extract text from Databricks response (same logic as /api/ai/ask)
function extractTextFromDatabricksResponse(data: unknown): string {
  const TEXT_TYPES = ['text', 'output_text'];

  function isTextPart(p: any): boolean {
    return p && TEXT_TYPES.includes(p.type) && p.text && p.text.trim();
  }

  function extractFromContentArray(arr: any[]): string {
    if (!Array.isArray(arr)) return '';
    return arr
      .filter(isTextPart)
      .map((p) => p.text.trim())
      .filter((t) => t.length > 0)
      .join('\n\n');
  }

  // Format 0: { output: [...] }
  if (data && typeof data === 'object' && 'output' in data) {
    const output = (data as any).output;
    if (Array.isArray(output)) {
      const texts: string[] = [];
      for (const item of output) {
        if (item.type === 'message' && item.role === 'assistant') {
          if (Array.isArray(item.content)) {
            const text = extractFromContentArray(item.content);
            if (text) texts.push(text);
          } else if (typeof item.content === 'string' && item.content.trim()) {
            texts.push(item.content.trim());
          }
        }
      }
      if (texts.length > 0) {
        return texts[texts.length - 1];
      }
    }
  }

  // Format 1: array of message objects
  if (Array.isArray(data)) {
    const texts: string[] = [];
    for (const item of data) {
      if (item.content && Array.isArray(item.content)) {
        const t = extractFromContentArray(item.content);
        if (t) texts.push(t);
      } else if (isTextPart(item)) {
        texts.push(item.text.trim());
      }
    }
    if (texts.length > 0) return texts.join('\n\n');
  }

  // Format 2: single object with content array/string
  if (data && typeof data === 'object' && 'content' in data) {
    const content = (data as any).content;
    if (Array.isArray(content)) {
      const t = extractFromContentArray(content);
      if (t) return t;
    }
    if (typeof content === 'string' && content.trim()) {
      return content.trim();
    }
  }

  // Format 3: direct text field
  if (data && typeof data === 'object' && 'text' in data) {
    const text = (data as any).text;
    if (typeof text === 'string' && text.trim()) {
      return text.trim();
    }
  }

  // Format 4: choices array (OpenAI-like)
  if (data && typeof data === 'object' && 'choices' in data) {
    const choices = (data as any).choices;
    if (Array.isArray(choices) && choices[0]?.message?.content) {
      return choices[0].message.content;
    }
  }

  // Fallback: stringify
  if (typeof data === 'string') return data;
  try {
    return JSON.stringify(data);
  } catch {
    return '';
  }
}

function parseThesisResponse(text: string): Partial<ThesisData> {
  const parsed: Partial<ThesisData> = {};

  // Extract VERDICT
  const verdictMatch = text.match(/\b(VERDICT|Verdict|VERDICT:)\s*:?\s*(BUY|SELL|WAIT|HOLD)\b/i);
  if (verdictMatch) {
    parsed.verdict = verdictMatch[2].toUpperCase() as 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  } else {
    // Fallback: look for BUY/SELL/WAIT in bold or caps
    const verdictFallback = text.match(/\b(BUY|SELL|WAIT|HOLD)\b/);
    if (verdictFallback) {
      parsed.verdict = verdictFallback[1].toUpperCase() as 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
    }
  }

  // Extract levels - look for dollar amounts with context
  const dollarPattern = /\$(\d+\.?\d*)/g;
  const matches = [...text.matchAll(dollarPattern)];
  
  // Look for keywords near dollar amounts
  const supportMatch = text.match(
    /(?:support|sup\b|S:)[^0-9$]{0,20}\$?(\d+\.?\d*)/i
  );
  if (supportMatch) {
    parsed.support = `$${supportMatch[1]}`;
  }

  const resistanceMatch = text.match(
    /(?:resistance|res\b|R:)[^0-9$]{0,20}\$?(\d+\.?\d*)/i
  );
  if (resistanceMatch) {
    parsed.resistance = `$${resistanceMatch[1]}`;
  }

  const entryMatch = text.match(
    /(?:entry|buy zone|entry zone|buy around|Entry|ENTRY)[:\s-]*\$?(\d+\.?\d*)/i
  );
  if (entryMatch) {
    parsed.entry = `$${entryMatch[1]}`;
  }

  const targetMatch = text.match(
    /(?:target|Target|TARGET|pt\b|price target)[:\s-]*\$?(\d+\.?\d*)/i
  );
  if (targetMatch) {
    parsed.target = `$${targetMatch[1]}`;
  }

  const stopMatch = text.match(
    /(?:stop|Stop|STOP|stop loss|Stop Loss|\bsl\b)[:\s-]*\$?(\d+\.?\d*)/i
  );
  if (stopMatch) {
    parsed.stop = `$${stopMatch[1]}`;
  }

  // Extract reasoning - look for "reasoning", "because", or take first sentence
  const reasoningMatch = text.match(/(?:reasoning|Reasoning|REASONING|because|Because)[:\s]*(.+?)(?:\n|$)/i);
  if (reasoningMatch) {
    parsed.reasoning = reasoningMatch[1].trim().substring(0, 150);
  } else {
    // Fallback: take first sentence after verdict
    const sentences = text.split(/[.!?]\s+/);
    if (sentences.length > 0) {
      parsed.reasoning = sentences[0].substring(0, 150);
    }
  }

  return parsed;
}

async function generateThesisForTicker(ticker: string): Promise<ThesisData> {
  const prompt = `Give me a concise day trading thesis for ${ticker} today. Include: 
1. VERDICT (BUY/SELL/WAIT)
2. Key levels (support/resistance)
3. Entry zone
4. Target
5. Stop loss
6. One-line reasoning
Keep it under 100 words.`;

  try {
    // Call Databricks endpoint
    const endpointUrl = `${DATABRICKS_HOST}/serving-endpoints/${DATABRICKS_ENDPOINT}/invocations`;
    
    const response = await fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${DATABRICKS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(DATABRICKS_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Databricks API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();

    // Reuse the same robust extraction logic as /api/ai/ask
    const fullTextRaw = extractTextFromDatabricksResponse(data);

    // Treat null / empty as an error so UI shows a clear message instead of "null"
    const fullText = fullTextRaw && fullTextRaw.trim().toLowerCase() !== 'null'
      ? fullTextRaw.trim()
      : '';

    if (!fullText) {
      throw new Error('Empty response from AI service for this ticker');
    }

    // Parse the response
    const parsed = parseThesisResponse(fullText);

    return {
      ticker,
      ...parsed,
      fullResponse: fullText,
    };
  } catch (error: any) {
    console.error(`Error generating thesis for ${ticker}:`, error);
    return {
      ticker,
      fullResponse: '',
      error: error.message || 'Failed to generate thesis',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { tickers } = await request.json();

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Tickers array is required' },
        { status: 400 }
      );
    }

    if (tickers.length > 20) {
      return NextResponse.json(
        { success: false, error: 'Maximum 20 tickers allowed' },
        { status: 400 }
      );
    }

    // Validate Databricks configuration
    if (!DATABRICKS_HOST || DATABRICKS_HOST.includes('your-workspace')) {
      return NextResponse.json(
        { success: false, error: 'Databricks configuration is missing' },
        { status: 500 }
      );
    }

    if (!DATABRICKS_TOKEN || DATABRICKS_TOKEN.includes('your-personal-access-token')) {
      return NextResponse.json(
        { success: false, error: 'Databricks token is missing' },
        { status: 500 }
      );
    }

    // Generate thesis for each ticker
    const theses: ThesisData[] = [];
    
    for (const ticker of tickers) {
      const thesis = await generateThesisForTicker(ticker.toUpperCase());
      theses.push(thesis);
    }

    return NextResponse.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        theses,
      },
    });
  } catch (error: any) {
    console.error('Thesis API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to generate thesis report' },
      { status: 500 }
    );
  }
}
