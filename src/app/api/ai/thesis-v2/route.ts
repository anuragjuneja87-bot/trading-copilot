import { NextRequest, NextResponse } from 'next/server';

// Allow longer execution for Claude API calls
export const maxDuration = 30;

/* ══════════════════════════════════════════════════════════════
   THESIS V2 API — AI-powered thesis generation with structured output
   
   Takes all 7 signal states + price data + levels, sends to Claude,
   returns structured JSON thesis for the YodhaThesis component.
   
   v2.1: ATR-aware gap classification — normalizes gap % against
         the ticker's typical daily range so indices like SPY are
         not incorrectly classified as "flat" on meaningful gaps.
   ══════════════════════════════════════════════════════════════ */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const AI_TIMEOUT = parseInt(process.env.AI_TIMEOUT || '25000', 10);

// ── Types ──────────────────────────────────────────────────

export interface ThesisV2Request {
  ticker: string;
  price: number;
  changePercent: number;
  prevClose: number;
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';

  // 7 traffic light signals
  signals: {
    flow: { status: string; value: string; callRatio?: number; sweepRatio?: number };
    volume: { status: string; value: string; pressure?: number };
    darkPool: { status: string; value: string; bullishPct?: number };
    gex: { status: string; value: string };
    vwap: { status: string; value: string; vwapPrice?: number };
    rs: { status: string; value: string; rsVsSpy?: number };
    ml: { status: string; value: string; probability?: number; direction?: string };
  };

  // Key levels
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
    vwap: number | null;
    maxPain?: number | null;
    camR3?: number | null;
    camR4?: number | null;
    camS3?: number | null;
    camS4?: number | null;
    prevHigh?: number | null;
    prevLow?: number | null;
    prevClose?: number | null;
  };
}

export interface ThesisV2Response {
  marketState: 'rth_bullish' | 'rth_bearish' | 'rth_mixed' | 'pre_gap_up' | 'pre_gap_down' | 'pre_flat' | 'after_hours' | 'closed';
  bias: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL';
  gapLabel?: string; // e.g. "GAP UP +1.8%"
  mlConfidence?: string; // e.g. "ML 68% · 5/7 bull"
  thesis: string; // Main narrative paragraph(s)
  
  // Setups
  bullSetup?: {
    label: string; // e.g. "Hold above VWAP"
    entry: { price: string; context: string };
    targets: { price: string; context: string }[];
    stop: { price: string; context: string };
  };
  bearSetup?: {
    label: string;
    entry: { price: string; context: string };
    targets: { price: string; context: string }[];
    stop: { price: string; context: string };
  };
  
  // For closed/after-hours states
  sessionRecap?: string;
  stats?: { label: string; value: string; color?: string }[];
  tomorrowPlan?: string;
  afterHoursNote?: string;

  // Risk warning
  risk?: { icon: string; text: string }; // icon: ⚠️, ⏳, 🔴, 💤

  // Footer metadata
  footer: string;
  
  // Signal snapshot for gating comparison
  signalSnapshot: string; // serialized signal states for diffing

  generatedAt: string;
}

// ── ATR Proxy Computation ─────────────────────────────────
// Uses previous day's high-low range as a single-day ATR proxy.
// Falls back to known typical ATR percentages for major instruments.

/** Known typical daily ATR as % of price (approximate, conservative) */
const KNOWN_ATR_PCT: Record<string, number> = {
  // Major indices — tight daily ranges
  SPY: 0.85, QQQ: 1.1, IWM: 1.2, DIA: 0.75,
  // Leveraged ETFs
  TQQQ: 3.3, SQQQ: 3.3, SPXL: 2.5, SPXS: 2.5,
  UPRO: 2.5, SDS: 1.7, QLD: 2.2, TNA: 3.5, TZA: 3.5,
  // Sector ETFs
  XLF: 0.9, XLE: 1.3, XLK: 1.0, XLV: 0.8, XBI: 1.5,
  ARKK: 2.0, SMH: 1.5, XLC: 0.9, XLI: 0.8, XLP: 0.6,
  XLU: 0.7, XLRE: 0.9,
  // Mega-caps (approximate)
  AAPL: 1.5, MSFT: 1.4, GOOGL: 1.6, AMZN: 1.8, META: 2.0,
  NVDA: 3.0, TSLA: 3.0, AMD: 2.5, NFLX: 2.2, CRM: 1.8,
};

interface ATRContext {
  atrPct: number;        // Estimated daily ATR as % of price
  gapAsAtrRatio: number; // How much of the ATR the gap consumes (0-1+)
  source: 'prevDay' | 'known' | 'default';
}

function computeATRContext(
  ticker: string,
  changePercent: number,
  price: number,
  levels: ThesisV2Request['levels'],
): ATRContext {
  const absPctChange = Math.abs(changePercent);

  // 1. Try computing from previous day's high-low range
  if (levels.prevHigh && levels.prevLow && levels.prevHigh > levels.prevLow) {
    const prevRange = levels.prevHigh - levels.prevLow;
    const midPrice = (levels.prevHigh + levels.prevLow) / 2;
    const atrPct = (prevRange / midPrice) * 100;

    // Sanity check: ATR should be between 0.1% and 15%
    if (atrPct >= 0.1 && atrPct <= 15) {
      return {
        atrPct,
        gapAsAtrRatio: atrPct > 0 ? absPctChange / atrPct : 0,
        source: 'prevDay',
      };
    }
  }

  // 2. Use known ATR table
  const knownAtr = KNOWN_ATR_PCT[ticker.toUpperCase()];
  if (knownAtr) {
    return {
      atrPct: knownAtr,
      gapAsAtrRatio: knownAtr > 0 ? absPctChange / knownAtr : 0,
      source: 'known',
    };
  }

  // 3. Default fallback: assume ~1.5% daily ATR (midcap stock average)
  const defaultAtr = 1.5;
  return {
    atrPct: defaultAtr,
    gapAsAtrRatio: defaultAtr > 0 ? absPctChange / defaultAtr : 0,
    source: 'default',
  };
}

// ── Market State Detection (ATR-aware) ──────────────────────

function detectMarketState(
  session: string,
  changePercent: number,
  signals: ThesisV2Request['signals'],
  atrContext: ATRContext,
): ThesisV2Response['marketState'] {
  if (session === 'closed') return 'closed';
  if (session === 'after-hours') return 'after_hours';
  
  if (session === 'pre-market') {
    // ── ATR-relative thresholds ──
    // A gap consuming ≥20% of the daily ATR is directionally meaningful
    // Example: SPY +0.34% with ATR 0.85% → ratio 0.40 → gap UP (not flat)
    // Example: NVDA +0.34% with ATR 3.0% → ratio 0.11 → flat (correctly)
    const ratio = atrContext.gapAsAtrRatio;

    if (changePercent > 0 && ratio >= 0.20) return 'pre_gap_up';
    if (changePercent < 0 && ratio >= 0.20) return 'pre_gap_down';

    // Also catch absolute large moves (>0.8%) regardless of ATR
    // Handles tickers where we lack ATR data but the move is clearly large
    if (changePercent >= 0.8) return 'pre_gap_up';
    if (changePercent <= -0.8) return 'pre_gap_down';

    return 'pre_flat';
  }

  // RTH — count signal alignment
  const signalList = [signals.flow, signals.volume, signals.darkPool, signals.gex, signals.vwap, signals.rs, signals.ml];
  const active = signalList.filter(s => s.status !== 'no_data');
  const bulls = active.filter(s => s.status === 'bullish').length;
  const bears = active.filter(s => s.status === 'bearish').length;

  if (bulls > 0 && bears > 0 && Math.abs(bulls - bears) <= 2) return 'rth_mixed';
  if (bulls >= bears) return 'rth_bullish';
  return 'rth_bearish';
}

// ── Signal Snapshot (for gating) ──────────────────────────────

function buildSignalSnapshot(signals: ThesisV2Request['signals']): string {
  return JSON.stringify([
    signals.flow.status,
    signals.volume.status,
    signals.darkPool.status,
    signals.gex.status,
    signals.vwap.status,
    signals.rs.status,
    signals.ml.status,
  ]);
}

// ── Prompt Builder ──────────────────────────────────────────

function buildPrompt(
  req: ThesisV2Request,
  marketState: ThesisV2Response['marketState'],
  atrContext: ATRContext,
): string {
  const { ticker, price, changePercent, prevClose, signals, levels } = req;
  
  // Count signals
  const signalList = [signals.flow, signals.volume, signals.darkPool, signals.gex, signals.vwap, signals.rs, signals.ml];
  const active = signalList.filter(s => s.status !== 'no_data');
  const bulls = active.filter(s => s.status === 'bullish').length;
  const bears = active.filter(s => s.status === 'bearish').length;
  const neutrals = active.filter(s => s.status === 'neutral').length;

  const signalSummary = `
SIGNAL DATA (7 traffic light signals):
1. Options Flow: ${signals.flow.status} — ${signals.flow.value}${signals.flow.callRatio != null ? ` (${signals.flow.callRatio.toFixed(0)}% call ratio)` : ''}
2. Volume Pressure: ${signals.volume.status} — ${signals.volume.value}
3. Dark Pool: ${signals.darkPool.status} — ${signals.darkPool.value}${signals.darkPool.bullishPct != null ? ` (${signals.darkPool.bullishPct.toFixed(0)}% buy-side)` : ''}
4. GEX Position: ${signals.gex.status} — ${signals.gex.value} (flip at $${levels.gexFlip?.toFixed(2) || 'N/A'})
5. VWAP: ${signals.vwap.status} — ${signals.vwap.value} (VWAP at $${levels.vwap?.toFixed(2) || 'N/A'})
6. Relative Strength: ${signals.rs.status} — ${signals.rs.value}
7. ML Model: ${signals.ml.status} — ${signals.ml.value}${signals.ml.probability != null ? ` (${signals.ml.probability.toFixed(0)}% probability)` : ''}

Signal count: ${bulls} bullish, ${bears} bearish, ${neutrals} neutral, ${7 - active.length} no_data`;

  const levelsSummary = `
KEY LEVELS:
- Call Wall: ${levels.callWall ? '$' + levels.callWall.toFixed(2) : 'N/A'}
- Put Wall: ${levels.putWall ? '$' + levels.putWall.toFixed(2) : 'N/A'}
- GEX Flip: ${levels.gexFlip ? '$' + levels.gexFlip.toFixed(2) : 'N/A'}
- VWAP: ${levels.vwap ? '$' + levels.vwap.toFixed(2) : 'N/A'}
- Max Pain: ${levels.maxPain ? '$' + levels.maxPain.toFixed(2) : 'N/A'}
${levels.camR3 ? `- Camarilla R3: $${levels.camR3.toFixed(2)}` : ''}
${levels.camR4 ? `- Camarilla R4: $${levels.camR4.toFixed(2)}` : ''}
${levels.camS3 ? `- Camarilla S3: $${levels.camS3.toFixed(2)}` : ''}
${levels.camS4 ? `- Camarilla S4: $${levels.camS4.toFixed(2)}` : ''}
${levels.prevHigh ? `- Previous High: $${levels.prevHigh.toFixed(2)}` : ''}
${levels.prevLow ? `- Previous Low: $${levels.prevLow.toFixed(2)}` : ''}
- Previous Close: $${prevClose.toFixed(2)}`;

  // ATR context block — gives the LLM instrument-awareness
  const atrBlock = `
ATR CONTEXT (instrument-relative move sizing):
- Estimated daily ATR: ${atrContext.atrPct.toFixed(2)}% (source: ${atrContext.source === 'prevDay' ? 'previous day range' : atrContext.source === 'known' ? 'known instrument profile' : 'default estimate'})
- Pre-market gap as % of ATR: ${(atrContext.gapAsAtrRatio * 100).toFixed(0)}%
- Interpretation: ${
  atrContext.gapAsAtrRatio >= 0.50 ? 'LARGE gap — more than half the typical daily range is already consumed' :
  atrContext.gapAsAtrRatio >= 0.30 ? 'MEANINGFUL gap — roughly a third of the typical daily range' :
  atrContext.gapAsAtrRatio >= 0.20 ? 'MODERATE gap — noticeable relative to this instrument\'s normal movement' :
  atrContext.gapAsAtrRatio >= 0.10 ? 'SMALL gap — minor move relative to typical daily range' :
  'NEGLIGIBLE — well within normal noise for this instrument'
}`;

  const baseContext = `
TICKER: ${ticker}
PRICE: $${price.toFixed(2)}
CHANGE: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% from previous close ($${prevClose.toFixed(2)})
MARKET STATE: ${marketState}
${atrBlock}
${signalSummary}
${levelsSummary}`;

  // State-specific instructions
  let stateInstructions = '';

  switch (marketState) {
    case 'rth_bullish':
    case 'rth_bearish':
      stateInstructions = `
This is regular trading hours with ${marketState === 'rth_bullish' ? 'bullish' : 'bearish'} signal alignment.

Write a 2-3 paragraph thesis that:
1. Opens with the key observation (VWAP position, dominant signal)
2. Weaves in supporting data (flow ratios, dark pool prints, GEX context, ML probability)
3. Identifies specific entry, target, and stop levels using the KEY LEVELS data
4. Mentions what would invalidate the thesis

Return a single directional setup (${marketState === 'rth_bullish' ? 'bull' : 'bear'}Setup).
Include a risk warning that's specific to the current setup — not generic.`;
      break;

    case 'rth_mixed':
      stateInstructions = `
This is regular trading hours with MIXED/CONFLICTING signals.

Write a 2-3 paragraph thesis that:
1. Opens with the conflict (e.g. "call flow is bullish but dark pool is selling")
2. Explains WHY signals might conflict (distribution, accumulation, etc.)
3. Identifies VWAP as the pivot level
4. Says "trade the reaction, not the prediction"

Return BOTH bullSetup (for hold above VWAP) AND bearSetup (for break below VWAP).
Include a risk warning about the conflicting signals.`;
      break;

    case 'pre_gap_up':
    case 'pre_gap_down':
      stateInstructions = `
This is PRE-MARKET with a ${marketState === 'pre_gap_up' ? `gap UP of +${changePercent.toFixed(2)}%` : `gap DOWN of ${changePercent.toFixed(2)}%`}.

IMPORTANT — ATR CONTEXT: This gap represents ${(atrContext.gapAsAtrRatio * 100).toFixed(0)}% of the ticker's typical daily range (ATR ~${atrContext.atrPct.toFixed(2)}%).${
  atrContext.gapAsAtrRatio >= 0.30
    ? ` This is a significant move for ${ticker} — treat it with conviction, not dismissal.`
    : atrContext.gapAsAtrRatio >= 0.20
      ? ` This is a meaningful directional move for ${ticker} even though the absolute percentage may look small.`
      : ''
}

Write a 2-3 paragraph thesis that:
1. Opens with the gap direction, magnitude, AND its significance relative to this ticker's typical daily range
2. Provides context (any overnight catalysts if inferable from price action, supporting signals)
3. Identifies key levels that will matter at the open
4. Presents TWO scenarios: "If gap holds" and "If gap fades"

Return BOTH bullSetup AND bearSetup as the two scenarios.
Include a risk warning about pre-market data being thin and waiting for open confirmation.
${marketState === 'pre_gap_down' && Math.abs(changePercent) > 2 ? 'Note if this is a large gap, mention trend amplification below GEX flip.' : ''}`;
      break;

    case 'pre_flat':
      stateInstructions = `
This is PRE-MARKET with the stock essentially FLAT (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%).
The gap represents only ${(atrContext.gapAsAtrRatio * 100).toFixed(0)}% of the typical daily ATR — genuinely minimal movement.

Write a SHORT thesis (1-2 paragraphs) that:
1. States the stock is flat with no overnight catalyst
2. Honestly says "no edge yet" — don't force a directional view
3. Lists key levels to watch at the open
4. Advises waiting for the first signal to fire

Do NOT return any setup (no bullSetup, no bearSetup) — only levels to watch.
Include a risk warning about flat opens trapping both sides.`;
      break;

    case 'after_hours':
      stateInstructions = `
This is AFTER-HOURS. Write:

1. "sessionRecap": A paragraph summarizing today's session (use the signal data to infer what happened)
2. "stats": An array of key stat chips: [{label: "Close", value: "$X.XX", color: "green/red/neutral"}, ...]
   Include: Close, VWAP, Change, Flow summary, Dark Pool summary
3. "afterHoursNote": Brief note on AH price action if any
4. "tomorrowPlan": A paragraph with tomorrow's key levels and what to watch
5. A single directional setup for tomorrow's key levels (breakout/support/target/risk)

Include relevant risk context.`;
      break;

    case 'closed':
      stateInstructions = `
Market is CLOSED. Write:

1. "sessionRecap": A paragraph summarizing today's session
2. "stats": Key stat chips array [{label: "Close", value: "$X.XX", color: "green/red/neutral"}, ...]
   Include: Close, VWAP, Change, Flow summary, Dark Pool summary  
3. "tomorrowPlan": Tomorrow's game plan — key levels, breakout/breakdown triggers
4. A setup grid with: Breakout level, Upside target, Support level, Risk level

No risk warning needed for closed state.`;
      break;
  }

  return baseContext + '\n' + stateInstructions;
}

// ── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are Yodha, a senior institutional trading analyst. You generate structured trading theses from real-time market data. You speak with conviction when data supports it, and with honest uncertainty when it doesn't.

Rules:
- Use ONLY the price levels provided in the data. Never invent numbers.
- Write like a trader talks to another trader — direct, specific, no hedging with disclaimers.
- When signals conflict, explain WHY they might conflict (distribution, accumulation patterns).
- Reference specific signal values (e.g. "96% call ratio", "62% sell-side dark pool prints").
- GEX context: Above GEX flip = mean-reversion zone (moves get capped). Below = trend-amplification zone (moves extend).
- If ML model has a signal, mention its probability and direction.
- CRITICAL: Use the ATR CONTEXT to correctly assess the significance of price moves. A 0.3% gap on SPY (an index with ~0.85% daily ATR) is NOT the same as 0.3% on NVDA (with ~3% daily ATR). Always frame the gap relative to the instrument's typical daily range. Never call a move "flat" or "dead" if it consumes >20% of the daily ATR.

CRITICAL: Respond ONLY with valid JSON matching this schema. No markdown, no backticks, no text outside the JSON:

{
  "thesis": "string — main narrative (2-3 paragraphs, use \\n\\n between them)",
  "bullSetup": { "label": "string", "entry": { "price": "$X.XX", "context": "string" }, "targets": [{ "price": "$X.XX", "context": "string" }], "stop": { "price": "$X.XX", "context": "string" } } | null,
  "bearSetup": { "label": "string", "entry": { "price": "$X.XX", "context": "string" }, "targets": [{ "price": "$X.XX", "context": "string" }], "stop": { "price": "$X.XX", "context": "string" } } | null,
  "sessionRecap": "string | null — for after-hours/closed only",
  "stats": [{ "label": "string", "value": "string", "color": "green|red|cyan|neutral" }] | null,
  "tomorrowPlan": "string | null — for after-hours/closed only",
  "afterHoursNote": "string | null — for after-hours only",
  "risk": { "icon": "⚠️|⏳|🔴|💤", "text": "string" } | null
}`;

// ── Claude API Call ──────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);

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
        max_tokens: 1500,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Claude API ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return text.trim();
  } finally {
    clearTimeout(timeout);
  }
}

// ── Parse Claude Response ──────────────────────────────────

function parseClaudeResponse(text: string): Partial<ThesisV2Response> {
  // Strip markdown fences if present
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  
  try {
    const parsed = JSON.parse(cleaned);
    return parsed;
  } catch (e) {
    // Try to extract JSON from within the text
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch {
        // Fall through
      }
    }
    console.error('Failed to parse Claude response:', cleaned.substring(0, 200));
    return { thesis: cleaned.substring(0, 500) };
  }
}

// ── POST Handler ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: ThesisV2Request = await request.json();
    const { ticker, price, changePercent, signals, levels, marketSession, prevClose } = body;

    if (!ticker || (price == null && prevClose == null)) {
      return NextResponse.json({ success: false, error: 'ticker and price (or prevClose) are required' }, { status: 400 });
    }
    const effectivePrice = (price != null && price > 0) ? price : (prevClose != null && prevClose > 0 ? prevClose : 0);
    if (effectivePrice <= 0) {
      return NextResponse.json({ success: false, error: 'ticker and price are required' }, { status: 400 });
    }
    (body as { price: number }).price = effectivePrice;

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ success: false, error: 'AI service not configured' }, { status: 503 });
    }

    // 1. Compute ATR context for instrument-relative gap sizing
    const atrContext = computeATRContext(ticker, changePercent, effectivePrice, levels);

    // 2. Detect market state (now ATR-aware)
    const marketState = detectMarketState(marketSession, changePercent, signals, atrContext);

    // 3. Build signal snapshot for gating
    const signalSnapshot = buildSignalSnapshot(signals);

    // 4. Build prompt & call Claude (with ATR context)
    const prompt = buildPrompt(body, marketState, atrContext);
    const rawResponse = await callClaude(prompt);

    // 5. Parse response
    const parsed = parseClaudeResponse(rawResponse);

    // 6. Build signal count summary
    const signalList = [signals.flow, signals.volume, signals.darkPool, signals.gex, signals.vwap, signals.rs, signals.ml];
    const active = signalList.filter(s => s.status !== 'no_data');
    const bulls = active.filter(s => s.status === 'bullish').length;
    const bears = active.filter(s => s.status === 'bearish').length;
    const neutrals = active.filter(s => s.status === 'neutral').length;

    // 7. Build ML confidence tag
    const mlTag = signals.ml.status !== 'no_data' && signals.ml.probability
      ? `ML ${signals.ml.probability.toFixed(0)}% · ${bulls}/${active.length} bull`
      : `${bulls}/${active.length} bull`;

    // 8. Build footer based on state
    let footer: string;
    switch (marketState) {
      case 'rth_bullish':
      case 'rth_bearish':
      case 'rth_mixed':
        footer = `Claude Haiku 4.5 + Databricks ML · ${active.length} signals · ${bulls} bull · ${bears} bear · ${neutrals} neutral`;
        break;
      case 'pre_gap_up':
      case 'pre_gap_down':
      case 'pre_flat':
        footer = 'Pre-market analysis · Based on levels + price action · Full thesis at 9:30 open';
        break;
      case 'after_hours':
        footer = 'After-hours recap · Pre-market thesis at 4:00 AM';
        break;
      case 'closed':
        footer = 'End-of-day recap · Generated at close · Refreshes at next open';
        break;
    }

    // 9. Build bias
    let bias: ThesisV2Response['bias'] = 'NEUTRAL';
    if (marketState === 'rth_bullish' || marketState === 'pre_gap_up') bias = 'BULLISH';
    else if (marketState === 'rth_bearish' || marketState === 'pre_gap_down') bias = 'BEARISH';
    else if (marketState === 'rth_mixed') bias = 'MIXED';

    // 10. Gap label for pre-market (now ATR-contextualized)
    let gapLabel: string | undefined;
    if (marketState === 'pre_gap_up') gapLabel = `GAP UP +${changePercent.toFixed(1)}%`;
    else if (marketState === 'pre_gap_down') gapLabel = `GAP DOWN ${changePercent.toFixed(1)}%`;
    else if (marketState === 'pre_flat') gapLabel = `FLAT ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;

    const result: ThesisV2Response = {
      marketState,
      bias,
      gapLabel,
      mlConfidence: mlTag,
      thesis: parsed.thesis || `${ticker} at $${effectivePrice.toFixed(2)} — analysis generating...`,
      bullSetup: parsed.bullSetup || undefined,
      bearSetup: parsed.bearSetup || undefined,
      sessionRecap: parsed.sessionRecap || undefined,
      stats: parsed.stats || undefined,
      tomorrowPlan: parsed.tomorrowPlan || undefined,
      afterHoursNote: parsed.afterHoursNote || undefined,
      risk: parsed.risk || undefined,
      footer,
      signalSnapshot,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json({ success: true, data: result });

  } catch (error: any) {
    console.error('Thesis V2 API error:', error);
    
    if (error.name === 'AbortError') {
      return NextResponse.json({ success: false, error: 'Thesis generation timed out' }, { status: 504 });
    }
    
    return NextResponse.json({ success: false, error: error.message || 'Failed to generate thesis' }, { status: 500 });
  }
}
