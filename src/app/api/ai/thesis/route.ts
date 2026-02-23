import { NextRequest, NextResponse } from 'next/server';

// Anthropic API (direct)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT || '30000', 10);

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

/** ML prediction shape from B→C pipeline */
interface MLPredictionContext {
  move_probability: number;
  has_signal: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  direction_confidence: number;
  signal_strength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

/* ──────────────────────────────────────────────────────────
   YODHA SYSTEM PROMPT — Unified persona
   ────────────────────────────────────────────────────────── */

const YODHA_SYSTEM_PROMPT = `You are Yodha, a senior trading analyst at an institutional desk. You analyze real-time market data and deliver clear, actionable trading theses. You never hedge with "this is not financial advice." You speak with conviction when the data supports it, and with appropriate caution when it doesn't.

Your analysis is grounded in:
1. ML model output (move probability, direction, confidence)
2. Options flow data (institutional positioning)
3. Dark pool activity (smart money accumulation/distribution)
4. Gamma exposure levels (key support/resistance)
5. Relative strength (sector context)
6. News sentiment (catalyst awareness)

Structure your response as:
- CONFIDENCE: One sentence summarizing signal strength and direction
- THESIS: 2-3 sentences explaining what the data is showing
- SETUP: Entry, targets, and stop levels based on key levels
- RISK: What would invalidate this thesis

Be specific. Use the actual price levels from the data. Never invent numbers. If data is missing, say so briefly and focus on what IS available.`;

// Helper: extract text from Databricks response
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
      if (texts.length > 0) return texts[texts.length - 1];
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
    if (typeof content === 'string' && content.trim()) return content.trim();
  }

  // Format 3: direct text field
  if (data && typeof data === 'object' && 'text' in data) {
    const text = (data as any).text;
    if (typeof text === 'string' && text.trim()) return text.trim();
  }

  // Format 4: choices array (OpenAI-like)
  if (data && typeof data === 'object' && 'choices' in data) {
    const choices = (data as any).choices;
    if (Array.isArray(choices) && choices[0]?.message?.content) {
      return choices[0].message.content;
    }
  }

  // Fallback
  if (typeof data === 'string') return data;
  try { return JSON.stringify(data); } catch { return ''; }
}

function parseThesisResponse(text: string, ticker?: string): Partial<ThesisData> {
  const parsed: Partial<ThesisData> = {};

  // Extract VERDICT
  const verdictMatch = text.match(/\b(VERDICT|Verdict|VERDICT:)\s*:?\s*(BUY|SELL|WAIT|HOLD)\b/i);
  if (verdictMatch) {
    parsed.verdict = verdictMatch[2].toUpperCase() as 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  } else {
    const verdictFallback = text.match(/\b(BUY|SELL|WAIT|HOLD)\b/);
    if (verdictFallback) parsed.verdict = verdictFallback[1].toUpperCase() as 'BUY' | 'SELL' | 'WAIT' | 'HOLD';
  }

  // Extract levels
  const supportMatch = text.match(/(?:support|sup\b|S:)[^0-9$]{0,20}\$?(\d+\.?\d*)/i);
  if (supportMatch) parsed.support = `$${supportMatch[1]}`;

  const resistanceMatch = text.match(/(?:resistance|res\b|R:)[^0-9$]{0,20}\$?(\d+\.?\d*)/i);
  if (resistanceMatch) parsed.resistance = `$${resistanceMatch[1]}`;

  // Entry
  const entryPatterns = [
    /(?:entry|Entry|ENTRY|buy zone|entry zone|buy around|enter at|enter near|entry price|entry level)[:\s-]*\$?(\d+\.?\d*)/i,
    /entry[:\s]*\$(\d+\.?\d*)/i,
    /entry\s+at\s+\$?(\d+\.?\d*)/i,
    /entry\s+around\s+\$?(\d+\.?\d*)/i,
  ];
  for (const pattern of entryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) { parsed.entry = `$${match[1]}`; break; }
  }

  // Target
  const targetPatterns = [
    /(?:target|Target|TARGET|pt\b|price target|take profit|tp\b|target price|target level)[:\s-]*\$?(\d+\.?\d*)/i,
    /target[:\s]*\$(\d+\.?\d*)/i,
    /target\s+at\s+\$?(\d+\.?\d*)/i,
    /target\s+of\s+\$?(\d+\.?\d*)/i,
  ];
  for (const pattern of targetPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) { parsed.target = `$${match[1]}`; break; }
  }

  // Stop
  const stopPatterns = [
    /(?:stop|Stop|STOP|stop loss|Stop Loss|\bsl\b|stop at|stop below|stop above|stop price|stop level)[:\s-]*\$?(\d+\.?\d*)/i,
    /stop[:\s]*\$(\d+\.?\d*)/i,
    /stop\s+at\s+\$?(\d+\.?\d*)/i,
    /stop\s+below\s+\$?(\d+\.?\d*)/i,
    /stop\s+above\s+\$?(\d+\.?\d*)/i,
  ];
  for (const pattern of stopPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) { parsed.stop = `$${match[1]}`; break; }
  }

  // Fallback structured
  if (!parsed.entry || !parsed.target || !parsed.stop) {
    const structuredMatch = text.match(/(?:entry|Entry)[:\s]*\$?(\d+\.?\d*).*?(?:target|Target)[:\s]*\$?(\d+\.?\d*).*?(?:stop|Stop)[:\s]*\$?(\d+\.?\d*)/i);
    if (structuredMatch) {
      if (!parsed.entry) parsed.entry = `$${structuredMatch[1]}`;
      if (!parsed.target) parsed.target = `$${structuredMatch[2]}`;
      if (!parsed.stop) parsed.stop = `$${structuredMatch[3]}`;
    }
  }

  // Line-by-line fallback
  if (!parsed.entry || !parsed.target || !parsed.stop) {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      if (!parsed.entry && (lowerLine.includes('entry') || lowerLine.includes('enter'))) {
        const dollarMatch = line.match(/\$(\d+\.?\d*)/);
        if (dollarMatch) parsed.entry = `$${dollarMatch[1]}`;
      }
      if (!parsed.target && (lowerLine.includes('target') || lowerLine.includes('take profit') || lowerLine.includes('tp'))) {
        const dollarMatch = line.match(/\$(\d+\.?\d*)/);
        if (dollarMatch) parsed.target = `$${dollarMatch[1]}`;
      }
      if (!parsed.stop && (lowerLine.includes('stop') || lowerLine.includes('stop loss') || lowerLine.includes('sl'))) {
        const dollarMatch = line.match(/\$(\d+\.?\d*)/);
        if (dollarMatch) parsed.stop = `$${dollarMatch[1]}`;
      }
    }
  }

  // Support/Resistance fallback for entry/target/stop
  if ((!parsed.entry || !parsed.target || !parsed.stop) && parsed.support && parsed.resistance) {
    const supportNum = parseFloat(parsed.support.replace('$', ''));
    const resistanceNum = parseFloat(parsed.resistance.replace('$', ''));
    if (!isNaN(supportNum) && !isNaN(resistanceNum)) {
      const verdict = parsed.verdict || 'WAIT';
      if (verdict === 'BUY') {
        if (!parsed.entry) parsed.entry = `$${(supportNum + (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
        if (!parsed.target) parsed.target = `$${(resistanceNum - (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
        if (!parsed.stop) parsed.stop = `$${(supportNum - (resistanceNum - supportNum) * 0.05).toFixed(2)}`;
      } else if (verdict === 'SELL') {
        if (!parsed.entry) parsed.entry = `$${(resistanceNum - (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
        if (!parsed.target) parsed.target = `$${(supportNum + (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
        if (!parsed.stop) parsed.stop = `$${(resistanceNum + (resistanceNum - supportNum) * 0.05).toFixed(2)}`;
      } else {
        const midpoint = (supportNum + resistanceNum) / 2;
        if (!parsed.entry) parsed.entry = `$${midpoint.toFixed(2)}`;
        if (!parsed.target) parsed.target = `$${resistanceNum.toFixed(2)}`;
        if (!parsed.stop) parsed.stop = `$${supportNum.toFixed(2)}`;
      }
    }
  }

  // Reasoning
  const reasoningMatch = text.match(/(?:reasoning|Reasoning|REASONING|because|Because)[:\s]*(.+?)(?:\n|$)/i);
  if (reasoningMatch) {
    parsed.reasoning = reasoningMatch[1].trim().substring(0, 150);
  } else {
    const sentences = text.split(/[.!?]\s+/);
    if (sentences.length > 0) parsed.reasoning = sentences[0].substring(0, 150);
  }

  return parsed;
}

function buildMLContext(prediction: MLPredictionContext): string {
  const movePct = (prediction.move_probability * 100).toFixed(1);
  const signalLine = prediction.has_signal
    ? `${prediction.signal_strength} ${prediction.direction}`
    : 'NO SIGNAL (below 80% threshold)';
  const dirConfPct = (prediction.direction_confidence * 100).toFixed(0);
  const instruction = prediction.has_signal
    ? `The ML model detects a ${prediction.signal_strength.toLowerCase()}-confidence ${prediction.direction.toLowerCase()} signal. Factor this into your analysis but also consider whether the flow data, dark pool activity, and options positioning confirm or contradict this signal.`
    : `The ML model does not detect a significant move. Focus your analysis on the current flow data and positioning without asserting strong directional conviction.`;
  return `
ML MODEL SIGNAL (LightGBM B→C Pipeline):
- Move Probability: ${movePct}%
- Signal: ${signalLine}
- Direction Confidence: ${dirConfPct}%
${instruction}
`;
}

async function generateThesisForTicker(
  ticker: string,
  prediction?: MLPredictionContext | null,
  _warRoomData?: any
): Promise<ThesisData> {
  const mlContext = prediction ? buildMLContext(prediction) : '';
  const prompt = `${mlContext}Give me a concise day trading thesis for ${ticker} today. You MUST format your response exactly as follows:

CONFIDENCE: [one sentence summarizing signal strength and direction]
THESIS: [2-3 sentences explaining what the data is showing]
SETUP:
  Entry: $[price]
  Target 1: $[price] (level name)
  Target 2: $[price] (level name)
  Stop: $[price] (level name)
RISK: [what would invalidate this thesis]

VERDICT: [BUY/SELL/WAIT]
Support: $[price]
Resistance: $[price]

IMPORTANT: You must provide Entry, Target, and Stop prices. Be specific. Use actual price levels. Never invent numbers. If data is missing, say so briefly.

Keep it under 150 words.`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1000,
        system: YODHA_SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const fullTextRaw = data.content?.[0]?.text || '';
    const fullText = fullTextRaw.trim().toLowerCase() !== 'null'
      ? fullTextRaw.trim()
      : '';

    if (!fullText) throw new Error('Empty response from AI service for this ticker');

    const parsed = parseThesisResponse(fullText, ticker);

    return { ticker, ...parsed, fullResponse: fullText };
  } catch (error: any) {
    console.error(`Error generating thesis for ${ticker}:`, error);
    return { ticker, fullResponse: '', error: "An error occurred" || 'Failed to generate thesis' };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers, warRoomData, prediction } = body as {
      tickers: string[];
      warRoomData?: any;
      prediction?: MLPredictionContext | null;
    };

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json({ success: false, error: 'Tickers array is required' }, { status: 400 });
    }

    if (tickers.length > 20) {
      return NextResponse.json({ success: false, error: 'Maximum 20 tickers allowed' }, { status: 400 });
    }

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'AI service is not configured' }, { status: 503 });
    }

    const theses: ThesisData[] = [];
    const useContext = tickers.length === 1 && (prediction != null || warRoomData != null);

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i].toUpperCase();
      const thesis = await generateThesisForTicker(
        ticker,
        useContext ? prediction ?? null : undefined,
        useContext ? warRoomData : undefined
      );
      theses.push(thesis);
    }

    return NextResponse.json({
      success: true,
      data: { generatedAt: new Date().toISOString(), theses },
    });
  } catch (error: any) {
    console.error('Thesis API error:', error);
    return NextResponse.json({ success: false, error: "An error occurred" || 'Failed to generate thesis report' }, { status: 500 });
  }
}
