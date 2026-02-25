import { NextRequest, NextResponse } from 'next/server';

// Allow longer execution for Claude API calls
export const maxDuration = 30;

/* ══════════════════════════════════════════════════════════════
   THESIS V2 API — AI-powered thesis generation with structured output
   
   v2.2 Changes:
   - ATR-aware gap classification (no more "flat" on meaningful index gaps)
   - Intraday target logic: Cam pivots + VWAP as day trade targets,
     call/put wall as multi-session context only
   - Signal quality assessment: thin data = downgraded conviction
   - LLM bias override: Claude can override pre-computed bias when
     data quality is low or signals are contradictory
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

  // 7 traffic light signals (with optional quality metadata)
  signals: {
    flow: { status: string; value: string; callRatio?: number; sweepRatio?: number; tradeCount?: number; totalPremium?: number; netDelta?: number };
    volume: { status: string; value: string; pressure?: number };
    darkPool: { status: string; value: string; bullishPct?: number; printCount?: number; totalValue?: number };
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
  gapLabel?: string;
  mlConfidence?: string;
  thesis: string;
  bullSetup?: {
    label: string;
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
  sessionRecap?: string;
  stats?: { label: string; value: string; color?: string }[];
  tomorrowPlan?: string;
  afterHoursNote?: string;
  risk?: { icon: string; text: string };
  footer: string;
  signalSnapshot: string;
  generatedAt: string;
}

// ── ATR Proxy ──────────────────────────────────────────────

const KNOWN_ATR_PCT: Record<string, number> = {
  SPY: 0.85, QQQ: 1.1, IWM: 1.2, DIA: 0.75,
  TQQQ: 3.3, SQQQ: 3.3, SPXL: 2.5, SPXS: 2.5, UPRO: 2.5,
  SDS: 1.7, QLD: 2.2, TNA: 3.5, TZA: 3.5,
  XLF: 0.9, XLE: 1.3, XLK: 1.0, XLV: 0.8, XBI: 1.5,
  ARKK: 2.0, SMH: 1.5, XLC: 0.9, XLI: 0.8, XLP: 0.6, XLU: 0.7, XLRE: 0.9,
  AAPL: 1.5, MSFT: 1.4, GOOGL: 1.6, AMZN: 1.8, META: 2.0,
  NVDA: 3.0, TSLA: 3.0, AMD: 2.5, NFLX: 2.2, CRM: 1.8,
};

interface ATRContext { atrPct: number; gapAsAtrRatio: number; source: 'prevDay' | 'known' | 'default'; }

function computeATRContext(ticker: string, changePercent: number, price: number, levels: ThesisV2Request['levels']): ATRContext {
  const abs = Math.abs(changePercent);
  if (levels.prevHigh && levels.prevLow && levels.prevHigh > levels.prevLow) {
    const atrPct = ((levels.prevHigh - levels.prevLow) / ((levels.prevHigh + levels.prevLow) / 2)) * 100;
    if (atrPct >= 0.1 && atrPct <= 15) return { atrPct, gapAsAtrRatio: abs / atrPct, source: 'prevDay' };
  }
  const known = KNOWN_ATR_PCT[ticker.toUpperCase()];
  if (known) return { atrPct: known, gapAsAtrRatio: abs / known, source: 'known' };
  return { atrPct: 1.5, gapAsAtrRatio: abs / 1.5, source: 'default' };
}

// ── Signal Quality Assessment ──────────────────────────────

interface SignalQuality {
  overallQuality: 'high' | 'medium' | 'low' | 'insufficient';
  flowQuality: 'high' | 'low' | 'none';
  dpQuality: 'high' | 'low' | 'none';
  qualityNotes: string[];
  highQualityBulls: number;
  highQualityBears: number;
}

function assessSignalQuality(signals: ThesisV2Request['signals']): SignalQuality {
  const notes: string[] = [];

  // Flow quality
  const flowTrades = signals.flow.tradeCount ?? 0;
  const flowPremium = signals.flow.totalPremium ?? 0;
  let flowQuality: 'high' | 'low' | 'none' = 'none';
  if (signals.flow.status !== 'no_data') {
    if (flowTrades >= 20 && flowPremium >= 500000) flowQuality = 'high';
    else if (flowTrades >= 5 && flowPremium >= 50000) {
      flowQuality = 'low';
      notes.push(`Flow data is thin (${flowTrades} trades, $${(flowPremium / 1000).toFixed(0)}K premium) — low conviction`);
    } else {
      flowQuality = 'none';
      notes.push(`Flow data is noise-level (${flowTrades} trades, $${(flowPremium / 1000).toFixed(0)}K premium) — ignore for directional view`);
    }
  }

  // Dark pool quality
  const dpPrints = signals.darkPool.printCount ?? 0;
  const dpValue = signals.darkPool.totalValue ?? 0;
  let dpQuality: 'high' | 'low' | 'none' = 'none';
  if (signals.darkPool.status !== 'no_data') {
    if (dpPrints >= 10 && dpValue >= 5000000) dpQuality = 'high';
    else if (dpPrints >= 5) {
      dpQuality = 'low';
      notes.push(`Dark pool has only ${dpPrints} prints ($${(dpValue / 1000000).toFixed(1)}M) — suggestive but not conclusive`);
    } else {
      dpQuality = 'none';
      notes.push(`Dark pool has ${dpPrints} print(s) ($${(dpValue / 1000).toFixed(0)}K) — statistically meaningless, ignore`);
    }
  }

  // Quality-weighted directional count
  let hqBulls = 0, hqBears = 0;
  if (flowQuality !== 'none') {
    if (signals.flow.status === 'bullish') hqBulls++;
    if (signals.flow.status === 'bearish') hqBears++;
  }
  if (dpQuality !== 'none') {
    if (signals.darkPool.status === 'bullish') hqBulls++;
    if (signals.darkPool.status === 'bearish') hqBears++;
  }
  // Volume, VWAP, RS, ML, GEX — always count (price-derived, inherently valid)
  for (const sig of [signals.volume, signals.vwap, signals.rs, signals.ml, signals.gex]) {
    if (sig.status === 'bullish') hqBulls++;
    if (sig.status === 'bearish') hqBears++;
  }

  const hq = (flowQuality === 'high' ? 1 : 0) + (dpQuality === 'high' ? 1 : 0);
  const lq = (flowQuality === 'low' ? 1 : 0) + (dpQuality === 'low' ? 1 : 0);
  let overallQuality: 'high' | 'medium' | 'low' | 'insufficient';
  if (hq >= 2) overallQuality = 'high';
  else if (hq >= 1 || lq >= 2) overallQuality = 'medium';
  else if (lq >= 1) overallQuality = 'low';
  else overallQuality = 'insufficient';

  return { overallQuality, flowQuality, dpQuality, qualityNotes: notes, highQualityBulls: hqBulls, highQualityBears: hqBears };
}

// ── Market State Detection ─────────────────────────────────

function detectMarketState(
  session: string, changePercent: number, signals: ThesisV2Request['signals'], atrContext: ATRContext,
): ThesisV2Response['marketState'] {
  if (session === 'closed') return 'closed';
  if (session === 'after-hours') return 'after_hours';
  if (session === 'pre-market') {
    const ratio = atrContext.gapAsAtrRatio;
    if (changePercent > 0 && ratio >= 0.20) return 'pre_gap_up';
    if (changePercent < 0 && ratio >= 0.20) return 'pre_gap_down';
    if (changePercent >= 0.8) return 'pre_gap_up';
    if (changePercent <= -0.8) return 'pre_gap_down';
    return 'pre_flat';
  }
  const signalList = [signals.flow, signals.volume, signals.darkPool, signals.gex, signals.vwap, signals.rs, signals.ml];
  const active = signalList.filter(s => s.status !== 'no_data');
  const bulls = active.filter(s => s.status === 'bullish').length;
  const bears = active.filter(s => s.status === 'bearish').length;
  if (bulls > 0 && bears > 0 && Math.abs(bulls - bears) <= 2) return 'rth_mixed';
  if (bulls >= bears) return 'rth_bullish';
  return 'rth_bearish';
}

function buildSignalSnapshot(signals: ThesisV2Request['signals']): string {
  return JSON.stringify([signals.flow.status, signals.volume.status, signals.darkPool.status, signals.gex.status, signals.vwap.status, signals.rs.status, signals.ml.status]);
}

// ── Intraday Level Classifier ──────────────────────────────

function buildIntradayLevels(price: number, levels: ThesisV2Request['levels']): string {
  const items: { name: string; price: number; dist: number; above: boolean }[] = [];
  const add = (name: string, val: number | null | undefined) => {
    if (!val || val <= 0) return;
    items.push({ name, price: val, dist: ((val - price) / price) * 100, above: val > price });
  };
  add('VWAP', levels.vwap);
  add('Camarilla R3', levels.camR3);
  add('Camarilla R4', levels.camR4);
  add('Camarilla S3', levels.camS3);
  add('Camarilla S4', levels.camS4);
  add('Previous High', levels.prevHigh);
  add('Previous Low', levels.prevLow);
  add('Previous Close', levels.prevClose);
  add('Max Pain', levels.maxPain);
  add('GEX Flip', levels.gexFlip);
  items.sort((a, b) => Math.abs(a.dist) - Math.abs(b.dist));

  if (items.length === 0) return '';

  const nearest = items.slice(0, 8);
  const above = nearest.filter(l => l.above).map(l => `  ${l.name}: $${l.price.toFixed(2)} (${l.dist >= 0 ? '+' : ''}${l.dist.toFixed(2)}%)`);
  const below = nearest.filter(l => !l.above).map(l => `  ${l.name}: $${l.price.toFixed(2)} (${l.dist.toFixed(2)}%)`);

  let result = '\nINTRADAY LEVELS (use THESE for day trade entries/targets/stops):';
  if (above.length) result += '\n Resistance:\n' + above.join('\n');
  if (below.length) result += '\n Support:\n' + below.join('\n');

  const swingLevels: string[] = [];
  if (levels.callWall) swingLevels.push(`  Call Wall: $${levels.callWall.toFixed(2)} (${(((levels.callWall - price) / price) * 100).toFixed(1)}% away — NOT a day trade target)`);
  if (levels.putWall) swingLevels.push(`  Put Wall: $${levels.putWall.toFixed(2)} (${(((levels.putWall - price) / price) * 100).toFixed(1)}% away — NOT a day trade target)`);
  if (swingLevels.length) result += '\n Multi-session context (gamma magnets — days/weeks):\n' + swingLevels.join('\n');

  return result;
}

// ── Prompt Builder ──────────────────────────────────────────

function buildPrompt(req: ThesisV2Request, marketState: ThesisV2Response['marketState'], atrContext: ATRContext, quality: SignalQuality): string {
  const { ticker, price, changePercent, prevClose, signals, levels } = req;
  const signalList = [signals.flow, signals.volume, signals.darkPool, signals.gex, signals.vwap, signals.rs, signals.ml];
  const active = signalList.filter(s => s.status !== 'no_data');
  const bulls = active.filter(s => s.status === 'bullish').length;
  const bears = active.filter(s => s.status === 'bearish').length;
  const neutrals = active.filter(s => s.status === 'neutral').length;

  const fqTag = quality.flowQuality === 'none' ? ' ⚠️ NOISE-LEVEL' : quality.flowQuality === 'low' ? ' ⚠️ THIN' : '';
  const dqTag = quality.dpQuality === 'none' ? ' ⚠️ MEANINGLESS' : quality.dpQuality === 'low' ? ' ⚠️ THIN' : '';

  const signalBlock = `
SIGNAL DATA:
1. Options Flow: ${signals.flow.status} — ${signals.flow.value}${signals.flow.callRatio != null ? ` (${signals.flow.callRatio.toFixed(0)}% calls)` : ''}${signals.flow.tradeCount != null ? ` [${signals.flow.tradeCount} trades, $${((signals.flow.totalPremium || 0) / 1000).toFixed(0)}K prem, δ $${((signals.flow.netDelta || 0) / 1000).toFixed(0)}K]` : ''}${fqTag}
2. Volume: ${signals.volume.status} — ${signals.volume.value}
3. Dark Pool: ${signals.darkPool.status} — ${signals.darkPool.value}${signals.darkPool.printCount != null ? ` [${signals.darkPool.printCount} prints, $${((signals.darkPool.totalValue || 0) / 1000).toFixed(0)}K]` : ''}${dqTag}
4. GEX: ${signals.gex.status} — ${signals.gex.value} (flip $${levels.gexFlip?.toFixed(2) || 'N/A'})
5. VWAP: ${signals.vwap.status} — ${signals.vwap.value} (at $${levels.vwap?.toFixed(2) || 'N/A'})
6. RS: ${signals.rs.status} — ${signals.rs.value}
7. ML: ${signals.ml.status} — ${signals.ml.value}${signals.ml.probability != null ? ` (${signals.ml.probability.toFixed(0)}%)` : ''}

Raw count: ${bulls}B/${bears}R/${neutrals}N/${7 - active.length} no_data
Quality-adjusted: ${quality.highQualityBulls}B/${quality.highQualityBears}R (quality: ${quality.overallQuality})`;

  const qualityBlock = quality.qualityNotes.length > 0
    ? `\n⚠️ DATA QUALITY WARNINGS:\n${quality.qualityNotes.map(n => `• ${n}`).join('\n')}` : '';

  const atrBlock = `\nATR: ${atrContext.atrPct.toFixed(2)}% daily (${atrContext.source}) · Move = ${(atrContext.gapAsAtrRatio * 100).toFixed(0)}% of ATR`;

  const base = `
TICKER: ${ticker} · $${price.toFixed(2)} · ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% vs prev close $${prevClose.toFixed(2)}
STATE: ${marketState}${atrBlock}
${signalBlock}${qualityBlock}
${buildIntradayLevels(price, levels)}`;

  let instructions = '';
  switch (marketState) {
    case 'rth_bullish':
    case 'rth_bearish':
    case 'rth_mixed':
      instructions = buildRTHInstructions(marketState, quality);
      break;
    case 'pre_gap_up':
    case 'pre_gap_down':
      instructions = buildPreGapInstructions(marketState, changePercent, atrContext, ticker);
      break;
    case 'pre_flat':
      instructions = buildPreFlatInstructions(changePercent, atrContext);
      break;
    case 'after_hours':
      instructions = `After-hours. Write: sessionRecap, stats [{label,value,color}], afterHoursNote, tomorrowPlan, one setup for tomorrow. Include risk.`;
      break;
    case 'closed':
      instructions = `Closed. Write: sessionRecap, stats [{label,value,color}], tomorrowPlan, setup grid (breakout/target/support/risk).`;
      break;
  }

  return base + '\n\n' + instructions;
}

function buildRTHInstructions(marketState: string, quality: SignalQuality): string {
  const isMixed = marketState === 'rth_mixed';
  const direction = marketState === 'rth_bullish' ? 'bullish' : 'bearish';

  let qualityWarning = '';
  if (quality.overallQuality === 'insufficient' || quality.overallQuality === 'low') {
    qualityWarning = `\n⚠️ DATA QUALITY IS ${quality.overallQuality.toUpperCase()}: Do NOT present high-conviction. Acknowledge thin data. Frame as "developing" not "decisive." Recommend waiting for more volume/prints.`;
  } else if (quality.overallQuality === 'medium') {
    qualityWarning = `\nNOTE: Medium data quality — some signals are thin. Distinguish strong vs tentative signals.`;
  }

  if (isMixed) {
    return `RTH — MIXED SIGNALS.${qualityWarning}

2-3 paragraph thesis: (1) Which signals disagree and WHY. (2) If thin data, say "too thin to trust." (3) VWAP as pivot. (4) "Trade the reaction, not the prediction."

DAY TRADE RULES: Use INTRADAY LEVELS for entry/target/stop. Targets = next Cam pivot, VWAP, prevHigh/Low (0.3-2% from entry). Stop at specific technical level (0.3-0.8% risk). NEVER use call/put wall as targets.

Return BOTH bullSetup + bearSetup. Include risk warning.`;
  }

  return `RTH — Raw lean: ${direction}. Quality: ${quality.overallQuality}.${qualityWarning}

YOU CAN OVERRIDE THE BIAS. If data quality is poor or price action contradicts signals, say so honestly. Don't write a blind ${direction} thesis from noisy data.

2-3 paragraph thesis: (1) Lead with strongest, most trustworthy signal. (2) Honestly assess signal quality — if flow/DP is noise-level, say "ignore until more data." (3) Specific entry/target/stop. (4) What invalidates.

DAY TRADE RULES: Use INTRADAY LEVELS for targets (Cam R3/R4/S3/S4, VWAP, prevHigh/Low). Target 1 = next nearest level (0.3-1.5% away). Stop = below/above nearest support/resistance (0.3-0.8% risk). NEVER use call/put wall as day trade target — mention only as "multi-session context." R:R should be 1:1.5 to 1:3.

Return ${direction === 'bullish' ? 'bullSetup' : 'bearSetup'}. If data doesn't support a trade, return NO setup and explain why. Include specific risk warning.`;
}

function buildPreGapInstructions(marketState: string, changePercent: number, atrContext: ATRContext, ticker: string): string {
  const isUp = marketState === 'pre_gap_up';
  return `PRE-MARKET: ${isUp ? 'GAP UP' : 'GAP DOWN'} ${changePercent.toFixed(2)}% = ${(atrContext.gapAsAtrRatio * 100).toFixed(0)}% of ${ticker} daily ATR (${atrContext.atrPct.toFixed(2)}%).${
    atrContext.gapAsAtrRatio >= 0.30 ? ' Significant move — treat with conviction.' : atrContext.gapAsAtrRatio >= 0.20 ? ' Meaningful move despite small %.' : ''}

2-3 paragraph thesis: (1) Gap + ATR significance. (2) Signal context. (3) Key intraday levels for open. (4) Two scenarios: "gap holds" vs "gap fades."

Use Cam pivots + VWAP + prevHigh/Low for targets — NOT call/put wall.
Return BOTH bullSetup + bearSetup. Risk warning about thin pre-market data.`;
}

function buildPreFlatInstructions(changePercent: number, atrContext: ATRContext): string {
  return `PRE-MARKET FLAT: ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}% = ${(atrContext.gapAsAtrRatio * 100).toFixed(0)}% of ATR — negligible.

1-2 paragraphs: Flat, no catalyst, no edge. List key levels. Wait for first signal. No setups. Risk warning about flat opens.`;
}

// ── System Prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are Yodha, a senior institutional DAY TRADING analyst. You generate structured trading theses optimized for intraday setups.

Rules:
- Use ONLY provided price levels. Never invent numbers.
- Direct trader-to-trader tone. No generic disclaimers.
- When signals conflict, explain WHY (distribution, accumulation, divergence).
- Reference specific values ("96% call ratio", "62% sell-side prints").
- GEX: Above flip = mean-reversion (capped). Below = trend-amplification (extends).

DAY TRADE TARGETING:
- Entries/targets/stops use: VWAP, Camarilla R3/R4/S3/S4, prevHigh/Low, prevClose.
- NEVER use call wall or put wall as day trade targets. They are multi-session gamma magnets (days/weeks).
- If call wall is 7% away, it is NOT a day trade target. Day trade targets are 0.3-2% from entry.
- Stop at a specific technical level. R:R = 1:1.5 to 1:3.

DATA QUALITY:
- <5 trades or <$50K premium in flow = noise. Say so, don't rely on it.
- <5 dark pool prints = statistically meaningless. 1 print at 100% bullish is NOT a signal.
- You CAN override pre-computed bias if data quality doesn't support it.
- Distinguish "data supports X" from "data is insufficient to conclude."
- ATR-relative framing: 0.3% on SPY ≠ 0.3% on NVDA.

Respond ONLY with valid JSON:
{
  "thesis": "string (2-3 paragraphs, \\n\\n between)",
  "bullSetup": { "label": "string", "entry": { "price": "$X.XX", "context": "string" }, "targets": [{ "price": "$X.XX", "context": "string" }], "stop": { "price": "$X.XX", "context": "string" } } | null,
  "bearSetup": { ... same shape ... } | null,
  "sessionRecap": "string | null",
  "stats": [{ "label": "string", "value": "string", "color": "green|red|cyan|neutral" }] | null,
  "tomorrowPlan": "string | null",
  "afterHoursNote": "string | null",
  "risk": { "icon": "⚠️|⏳|🔴|💤", "text": "string" } | null
}`;

// ── Claude API Call ──────────────────────────────────────────

async function callClaude(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT);
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY || '', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1500, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Claude API ${response.status}: ${await response.text().catch(() => 'Unknown')}`);
    const data = await response.json();
    return (data.content?.[0]?.text || '').trim();
  } finally { clearTimeout(timeout); }
}

function parseClaudeResponse(text: string): Partial<ThesisV2Response> {
  let cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch { /* fall through */ } }
    console.error('Failed to parse:', cleaned.substring(0, 200));
    return { thesis: cleaned.substring(0, 500) };
  }
}

// ── POST Handler ──────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body: ThesisV2Request = await request.json();
    const { ticker, price, changePercent, signals, levels, marketSession, prevClose } = body;

    if (!ticker || (price == null && prevClose == null))
      return NextResponse.json({ success: false, error: 'ticker and price (or prevClose) required' }, { status: 400 });

    const effectivePrice = (price != null && price > 0) ? price : (prevClose != null && prevClose > 0 ? prevClose : 0);
    if (effectivePrice <= 0)
      return NextResponse.json({ success: false, error: 'ticker and price required' }, { status: 400 });
    (body as { price: number }).price = effectivePrice;

    if (!ANTHROPIC_API_KEY)
      return NextResponse.json({ success: false, error: 'AI service not configured' }, { status: 503 });

    const atrContext = computeATRContext(ticker, changePercent, effectivePrice, levels);
    const quality = assessSignalQuality(signals);
    const marketState = detectMarketState(marketSession, changePercent, signals, atrContext);
    const signalSnapshot = buildSignalSnapshot(signals);
    const prompt = buildPrompt(body, marketState, atrContext, quality);
    const rawResponse = await callClaude(prompt);
    const parsed = parseClaudeResponse(rawResponse);

    const signalList = [signals.flow, signals.volume, signals.darkPool, signals.gex, signals.vwap, signals.rs, signals.ml];
    const active = signalList.filter(s => s.status !== 'no_data');
    const bulls = active.filter(s => s.status === 'bullish').length;
    const bears = active.filter(s => s.status === 'bearish').length;
    const neutrals = active.filter(s => s.status === 'neutral').length;

    const mlTag = signals.ml.status !== 'no_data' && signals.ml.probability
      ? `ML ${signals.ml.probability.toFixed(0)}% · ${quality.highQualityBulls}/${active.length} bull`
      : `${quality.highQualityBulls}/${active.length} bull`;

    const qualityTag = quality.overallQuality === 'insufficient' ? ' · ⚠️ Low data' : quality.overallQuality === 'low' ? ' · ⚠️ Thin data' : '';
    let footer: string;
    switch (marketState) {
      case 'rth_bullish': case 'rth_bearish': case 'rth_mixed':
        footer = `Claude Haiku 4.5 + Databricks ML · ${active.length} signals · ${quality.highQualityBulls} quality bull · ${quality.highQualityBears} quality bear${qualityTag}`;
        break;
      case 'pre_gap_up': case 'pre_gap_down': case 'pre_flat':
        footer = 'Pre-market analysis · Based on levels + price action · Full thesis at 9:30 open'; break;
      case 'after_hours':
        footer = 'After-hours recap · Pre-market thesis at 4:00 AM'; break;
      case 'closed':
        footer = 'End-of-day recap · Generated at close · Refreshes at next open'; break;
    }

    // Quality-adjusted bias
    let bias: ThesisV2Response['bias'] = 'NEUTRAL';
    if (marketState === 'pre_gap_up') bias = 'BULLISH';
    else if (marketState === 'pre_gap_down') bias = 'BEARISH';
    else if (marketState === 'rth_bullish') bias = quality.overallQuality === 'insufficient' ? 'NEUTRAL' : quality.overallQuality === 'low' ? 'MIXED' : 'BULLISH';
    else if (marketState === 'rth_bearish') bias = quality.overallQuality === 'insufficient' ? 'NEUTRAL' : quality.overallQuality === 'low' ? 'MIXED' : 'BEARISH';
    else if (marketState === 'rth_mixed') bias = 'MIXED';

    let gapLabel: string | undefined;
    if (marketState === 'pre_gap_up') gapLabel = `GAP UP +${changePercent.toFixed(1)}%`;
    else if (marketState === 'pre_gap_down') gapLabel = `GAP DOWN ${changePercent.toFixed(1)}%`;
    else if (marketState === 'pre_flat') gapLabel = `FLAT ${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%`;

    return NextResponse.json({ success: true, data: {
      marketState, bias, gapLabel, mlConfidence: mlTag,
      thesis: parsed.thesis || `${ticker} at $${effectivePrice.toFixed(2)} — analysis generating...`,
      bullSetup: parsed.bullSetup || undefined, bearSetup: parsed.bearSetup || undefined,
      sessionRecap: parsed.sessionRecap || undefined, stats: parsed.stats || undefined,
      tomorrowPlan: parsed.tomorrowPlan || undefined, afterHoursNote: parsed.afterHoursNote || undefined,
      risk: parsed.risk || undefined, footer, signalSnapshot, generatedAt: new Date().toISOString(),
    } as ThesisV2Response });

  } catch (error: any) {
    console.error('Thesis V2 API error:', error);
    if (error.name === 'AbortError')
      return NextResponse.json({ success: false, error: 'Thesis generation timed out' }, { status: 504 });
    return NextResponse.json({ success: false, error: error.message || 'Failed to generate thesis' }, { status: 500 });
  }
}
