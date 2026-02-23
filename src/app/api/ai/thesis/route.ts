import { NextRequest, NextResponse } from 'next/server';

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

/** ML prediction shape from B→C pipeline (same as /api/ml/predict) */
interface MLPredictionContext {
  move_probability: number;
  has_signal: boolean;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  direction_confidence: number;
  signal_strength: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
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

function parseThesisResponse(text: string, ticker?: string): Partial<ThesisData> {
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

  // Extract Entry - more flexible patterns
  const entryPatterns = [
    /(?:entry|Entry|ENTRY|buy zone|entry zone|buy around|enter at|enter near|entry price|entry level)[:\s-]*\$?(\d+\.?\d*)/i,
    /entry[:\s]*\$?(\d+\.?\d*)/i,
    /(?:^|\n)\s*3\.?\s*(?:entry|Entry)[:\s-]*\$?(\d+\.?\d*)/i,
    /entry[:\s]*\$(\d+\.?\d*)/i,
    /entry\s+at\s+\$?(\d+\.?\d*)/i,
    /entry\s+around\s+\$?(\d+\.?\d*)/i,
  ];
  for (const pattern of entryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      parsed.entry = `$${match[1]}`;
      break;
    }
  }

  // Extract Target - more flexible patterns
  const targetPatterns = [
    /(?:target|Target|TARGET|pt\b|price target|take profit|tp\b|target price|target level)[:\s-]*\$?(\d+\.?\d*)/i,
    /target[:\s]*\$?(\d+\.?\d*)/i,
    /(?:^|\n)\s*4\.?\s*(?:target|Target)[:\s-]*\$?(\d+\.?\d*)/i,
    /target[:\s]*\$(\d+\.?\d*)/i,
    /target\s+at\s+\$?(\d+\.?\d*)/i,
    /target\s+of\s+\$?(\d+\.?\d*)/i,
  ];
  for (const pattern of targetPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      parsed.target = `$${match[1]}`;
      break;
    }
  }

  // Extract Stop - more flexible patterns
  const stopPatterns = [
    /(?:stop|Stop|STOP|stop loss|Stop Loss|\bsl\b|stop at|stop below|stop above|stop price|stop level)[:\s-]*\$?(\d+\.?\d*)/i,
    /stop[:\s]*\$?(\d+\.?\d*)/i,
    /(?:^|\n)\s*5\.?\s*(?:stop|Stop|stop loss)[:\s-]*\$?(\d+\.?\d*)/i,
    /stop[:\s]*\$(\d+\.?\d*)/i,
    /stop\s+at\s+\$?(\d+\.?\d*)/i,
    /stop\s+below\s+\$?(\d+\.?\d*)/i,
    /stop\s+above\s+\$?(\d+\.?\d*)/i,
  ];
  for (const pattern of stopPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      parsed.stop = `$${match[1]}`;
      break;
    }
  }

  // Fallback: Try to extract from structured format (Entry: $X, Target: $Y, Stop: $Z)
  if (!parsed.entry || !parsed.target || !parsed.stop) {
    // Look for patterns like "Entry: $190, Target: $195, Stop: $185"
    const structuredMatch = text.match(/(?:entry|Entry)[:\s]*\$?(\d+\.?\d*).*?(?:target|Target)[:\s]*\$?(\d+\.?\d*).*?(?:stop|Stop)[:\s]*\$?(\d+\.?\d*)/i);
    if (structuredMatch) {
      if (!parsed.entry) parsed.entry = `$${structuredMatch[1]}`;
      if (!parsed.target) parsed.target = `$${structuredMatch[2]}`;
      if (!parsed.stop) parsed.stop = `$${structuredMatch[3]}`;
    }
  }

  // Additional fallback: Find dollar amounts near keywords (within 30 characters)
  if (!parsed.entry || !parsed.target || !parsed.stop) {
    const lines = text.split(/\n/);
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      
      // Check for entry
      if (!parsed.entry && (lowerLine.includes('entry') || lowerLine.includes('enter'))) {
        const dollarMatch = line.match(/\$(\d+\.?\d*)/);
        if (dollarMatch) {
          parsed.entry = `$${dollarMatch[1]}`;
        }
      }
      
      // Check for target
      if (!parsed.target && (lowerLine.includes('target') || lowerLine.includes('take profit') || lowerLine.includes('tp'))) {
        const dollarMatch = line.match(/\$(\d+\.?\d*)/);
        if (dollarMatch) {
          parsed.target = `$${dollarMatch[1]}`;
        }
      }
      
      // Check for stop
      if (!parsed.stop && (lowerLine.includes('stop') || lowerLine.includes('stop loss') || lowerLine.includes('sl'))) {
        const dollarMatch = line.match(/\$(\d+\.?\d*)/);
        if (dollarMatch) {
          parsed.stop = `$${dollarMatch[1]}`;
        }
      }
    }
  }

  // Debug logging (can be removed in production)
  if (!parsed.entry || !parsed.target || !parsed.stop) {
    console.log(`[Thesis Parse] Missing values for ${ticker || 'unknown'}:`, {
      entry: parsed.entry,
      target: parsed.target,
      stop: parsed.stop,
      support: parsed.support,
      resistance: parsed.resistance,
      textPreview: text.substring(0, 200),
    });
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

VERDICT: [BUY/SELL/WAIT]
Support: $[price]
Resistance: $[price]
Entry: $[price]
Target: $[price]
Stop: $[price]
Reasoning: [one sentence explanation]

IMPORTANT: You must provide Entry, Target, and Stop prices. If VERDICT is BUY, Entry should be near support, Target should be near resistance, and Stop should be below support. If VERDICT is SELL, Entry should be near resistance, Target should be near support, and Stop should be above resistance. If VERDICT is WAIT, provide reasonable levels based on current price action.

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
    const parsed = parseThesisResponse(fullText, ticker);

    // Fallback: If Entry/Target/Stop are missing but Support/Resistance exist, calculate them
    if ((!parsed.entry || !parsed.target || !parsed.stop) && parsed.support && parsed.resistance) {
      const supportNum = parseFloat(parsed.support.replace('$', ''));
      const resistanceNum = parseFloat(parsed.resistance.replace('$', ''));
      
      if (!isNaN(supportNum) && !isNaN(resistanceNum)) {
        const verdict = parsed.verdict || 'WAIT';
        
        if (verdict === 'BUY') {
          // For BUY: Entry near support, Target near resistance, Stop below support
          if (!parsed.entry) parsed.entry = `$${(supportNum + (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
          if (!parsed.target) parsed.target = `$${(resistanceNum - (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
          if (!parsed.stop) parsed.stop = `$${(supportNum - (resistanceNum - supportNum) * 0.05).toFixed(2)}`;
        } else if (verdict === 'SELL') {
          // For SELL: Entry near resistance, Target near support, Stop above resistance
          if (!parsed.entry) parsed.entry = `$${(resistanceNum - (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
          if (!parsed.target) parsed.target = `$${(supportNum + (resistanceNum - supportNum) * 0.1).toFixed(2)}`;
          if (!parsed.stop) parsed.stop = `$${(resistanceNum + (resistanceNum - supportNum) * 0.05).toFixed(2)}`;
        } else {
          // For WAIT/HOLD: Use midpoint logic
          const midpoint = (supportNum + resistanceNum) / 2;
          if (!parsed.entry) parsed.entry = `$${midpoint.toFixed(2)}`;
          if (!parsed.target) parsed.target = `$${resistanceNum.toFixed(2)}`;
          if (!parsed.stop) parsed.stop = `$${supportNum.toFixed(2)}`;
        }
      }
    }

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
    // No auth required for personal use

    const body = await request.json();
    const { tickers, warRoomData, prediction } = body as {
      tickers: string[];
      warRoomData?: any;
      prediction?: MLPredictionContext | null;
    };

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

    // Generate thesis for each ticker; pass prediction/warRoomData for single-ticker context
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
