import { NextRequest, NextResponse } from 'next/server';
import type { EnhancedOptionTrade, EnhancedFlowStats, GexStrike, FlowTimeSeries } from '@/types/flow';
import { validateTickers, validateInt, safeError } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const DEFAULT_TICKERS = ['SPY', 'QQQ', 'NVDA', 'AAPL', 'TSLA'];

// Reliable ET time formatter (works on UTC-based servers like Vercel)
function formatTimeET(timestampMs: number): string {
  const d = new Date(timestampMs);
  // Determine if Eastern Daylight Time is in effect
  // EDT: 2nd Sunday of March to 1st Sunday of November
  const year = d.getUTCFullYear();
  const marchStart = new Date(Date.UTC(year, 2, 1));
  const marchSecondSun = new Date(Date.UTC(year, 2, 8 + (7 - marchStart.getUTCDay()) % 7, 7)); // 2am ET = 7am UTC
  const novStart = new Date(Date.UTC(year, 10, 1));
  const novFirstSun = new Date(Date.UTC(year, 10, 1 + (7 - novStart.getUTCDay()) % 7, 6)); // 2am ET = 6am UTC
  const isEDT = d.getTime() >= marchSecondSun.getTime() && d.getTime() < novFirstSun.getTime();
  const etOffsetHours = isEDT ? -4 : -5;
  const etMs = timestampMs + etOffsetHours * 3600000;
  const et = new Date(etMs);
  const hh = et.getUTCHours().toString().padStart(2, '0');
  const mm = et.getUTCMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

// Exchange ID to name mapping (common ones)
const EXCHANGE_MAP: Record<number, string> = {
  300: 'NYSE',
  301: 'AMEX', 
  302: 'ARCA',
  303: 'BATS',
  304: 'BX',
  305: 'C2',
  306: 'CBOE',
  307: 'EDGX',
  308: 'EMERALD',
  309: 'GEMX',
  312: 'ISE',
  313: 'MCRY',
  314: 'MIAX',
  315: 'MPRL',
  316: 'NOMX',
  318: 'OPRA',
  319: 'PHLX',
  320: 'PSX',
  322: 'MEMX',
  323: 'BOX',
};

// Condition code mappings for trade type
const CONDITION_MAP: Record<number, string> = {
  209: 'REGULAR',
  219: 'INTERMARKET_SWEEP',
  227: 'QUALIFIED_CONTINGENT',
  232: 'SINGLE_LEG_AUCTION',
  233: 'SINGLE_LEG_CROSS',
  12: 'SINGLE_LEG_AUCTION',
};

// Parse trade type from conditions
function parseTradeType(conditions: number[]): string {
  if (conditions.includes(219)) return 'INTERMARKET_SWEEP';
  if (conditions.includes(227)) return 'BLOCK';
  if (conditions.includes(232) || conditions.includes(12)) return 'SINGLE_LEG_AUCTION';
  if (conditions.includes(233)) return 'SINGLE_LEG_CROSS';
  return 'REGULAR';
}

// Helper functions for enhanced calculations

// Detect trade aggression based on price vs bid/ask
function detectAggression(tradePrice: number, bid: number, ask: number): {
  aggression: 'ABOVE_ASK' | 'AT_ASK' | 'AT_MID' | 'AT_BID' | 'BELOW_BID' | 'UNKNOWN';
  aggressionScore: number;
} {
  if (!bid || !ask || bid >= ask) {
    return { aggression: 'UNKNOWN', aggressionScore: 0 };
  }
  
  const spread = ask - bid;
  const mid = (bid + ask) / 2;
  
  if (tradePrice >= ask) {
    return { aggression: 'ABOVE_ASK', aggressionScore: 100 };
  }
  if (tradePrice >= ask - spread * 0.1) {
    return { aggression: 'AT_ASK', aggressionScore: 75 };
  }
  if (tradePrice <= bid) {
    return { aggression: 'BELOW_BID', aggressionScore: -100 };
  }
  if (tradePrice <= bid + spread * 0.1) {
    return { aggression: 'AT_BID', aggressionScore: -75 };
  }
  
  return { aggression: 'AT_MID', aggressionScore: tradePrice > mid ? 25 : -25 };
}

function getMoneyness(strike: number, underlyingPrice: number, callPut: 'C' | 'P'): 'ITM' | 'ATM' | 'OTM' {
  if (!underlyingPrice || !strike) return 'OTM';
  const pctFromSpot = Math.abs(strike - underlyingPrice) / underlyingPrice;
  if (pctFromSpot < 0.02) return 'ATM'; // Within 2%
  
  if (callPut === 'C') {
    return strike < underlyingPrice ? 'ITM' : 'OTM';
  } else {
    return strike > underlyingPrice ? 'ITM' : 'OTM';
  }
}

function calculateDeltaAdjustedPremium(
  premium: number,
  delta: number,
  callPut: 'C' | 'P',
  side: 'BUY' | 'SELL' | 'UNKNOWN',
  tradeType: string
): number {
  // Direction: 
  // +1 for bullish (buying calls OR selling puts)
  // -1 for bearish (buying puts OR selling calls)
  
  let direction = 0;
  
  // Determine direction based on trade side and option type
  if (side === 'BUY') {
    direction = callPut === 'C' ? 1 : -1; // Buy call = bullish, buy put = bearish
  } else if (side === 'SELL') {
    direction = callPut === 'C' ? -1 : 1; // Sell call = bearish, sell put = bullish
  } else {
    // Side unknown - use trade type as proxy
    // Sweeps are typically aggressive buys
    const tradeTypeUpper = tradeType.toUpperCase();
    if (tradeTypeUpper.includes('SWEEP')) {
      direction = callPut === 'C' ? 1 : -1;
    } else {
      // Conservative: assume neutral if we can't determine
      direction = 0;
    }
  }
  
  // Delta should be:
  // - Positive for calls (0 to 1)
  // - Negative for puts (-1 to 0)
  // We use absolute value of delta
  const absDelta = Math.abs(delta);
  
  // Delta-adjusted premium = premium × |delta| × direction
  return premium * absDelta * direction;
}

function calculateSmartMoneyScore(
  trade: {
    premium: number;
    tradeType: string;
    side: 'BUY' | 'SELL' | 'UNKNOWN';
    moneyness: 'ITM' | 'ATM' | 'OTM';
    daysToExpiry: number;
    isUnusual?: boolean;
  },
  avgPremium: number,
  avgSize: number
): number {
  let score = 0;
  
  // 1. SIZE SCORE (0-3 points) - premium relative to average
  const sizeRatio = trade.premium / Math.max(avgPremium, 10000);
  if (sizeRatio > 10) score += 3;      // 10x average = 3 points
  else if (sizeRatio > 5) score += 2;  // 5x average = 2 points
  else if (sizeRatio > 2) score += 1;  // 2x average = 1 point
  
  // 2. URGENCY SCORE (0-3 points) - trade type
  const tradeType = trade.tradeType.toUpperCase();
  if (tradeType.includes('SWEEP')) score += 3;
  else if (tradeType === 'BLOCK' || tradeType === 'SINGLE_LEG_AUCTION') score += 2;
  else if (trade.side === 'BUY') score += 1;
  
  // 3. OTM SCORE (0-2 points) - bold bets
  if (trade.moneyness === 'OTM' && trade.premium > 50000) score += 2;
  else if (trade.moneyness === 'OTM' && trade.premium > 10000) score += 1;
  
  // 4. TIMING SCORE (0-2 points) - near expiry = conviction
  if (trade.daysToExpiry <= 3) score += 2;
  else if (trade.daysToExpiry <= 14) score += 1;
  
  // 5. UNUSUAL BONUS (0-1 point)
  if (trade.isUnusual) score += 1;
  
  return Math.min(score, 10);
}

// Fix unusual detection
function isUnusualTrade(
  trade: {
    premium: number;
    size: number;
    openInterest: number;
  },
  avgPremium: number
): boolean {
  // A trade is unusual if:
  // 1. Premium > 5x daily average premium (min $50K), OR
  // 2. Size > Open Interest (new position larger than existing), OR
  // 3. Premium > $100K for any single trade
  
  const premiumThreshold = Math.max(avgPremium * 5, 50000); // At least $50K
  const isHighPremium = trade.premium > premiumThreshold;
  const isLargerThanOI = trade.openInterest > 0 && trade.size > trade.openInterest;
  const isBlockSize = trade.premium > 100000;
  
  return isHighPremium || isLargerThanOI || isBlockSize;
}

function calculateDaysToExpiry(expiry: string): number {
  if (!expiry) return 365;
  try {
    const expiryDate = new Date(expiry).getTime();
    const now = Date.now();
    return Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
  } catch {
    return 365;
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get('tickers');
  const minPremium = parseInt(searchParams.get('minPremium') || '0');
  const callPut = searchParams.get('callPut') || 'all';
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 200);
  const filterUnusual = searchParams.get('unusual') === 'true';
  const filterSweeps = searchParams.get('sweeps') === 'true';
  const fullSession = searchParams.get('fullSession') === 'true';
  
  // Date range filtering
  const from = searchParams.get('from'); // YYYY-MM-DD format
  const to = searchParams.get('to'); // YYYY-MM-DD format
  let timestampGte: number | null = null;
  let timestampLte: number | null = null;
  
  if (from) {
    const fromDate = new Date(from + 'T00:00:00Z');
    timestampGte = fromDate.getTime();
  }
  if (to) {
    const toDate = new Date(to + 'T23:59:59Z');
    timestampLte = toDate.getTime();
  }

  if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
    return NextResponse.json(
      { success: false, error: 'Market data service not configured' },
      { status: 500 }
    );
  }

  const tickers = tickersParam 
    ? validateTickers(tickersParam, 10)
    : DEFAULT_TICKERS;
  
  if (tickersParam && tickers.length === 0) {
    return NextResponse.json({ success: false, error: 'Invalid ticker symbols' }, { status: 400 });
  }

  let allTrades: EnhancedOptionTrade[] = [];
  const errors: string[] = [];
  const seenSequences = new Set<string>();
  const quoteCache = new Map<string, { bid: number; ask: number }>();

  // Fetch quotes for each underlying (for aggression detection)
  for (const underlying of tickers.slice(0, 5)) {
    try {
      const quoteUrl = `https://api.polygon.io/v2/last/nbbo/${underlying}?apiKey=${POLYGON_API_KEY}`;
      const quoteRes = await fetch(quoteUrl, {
        next: { revalidate: 5 },
        signal: AbortSignal.timeout(5000),
      });
      
      if (quoteRes.ok) {
        const quoteData = await quoteRes.json();
        const result = quoteData.results?.[0];
        if (result) {
          const bid = parseFloat(result.bid || result.P || 0);
          const ask = parseFloat(result.ask || result.p || 0);
          if (bid > 0 && ask > 0 && bid < ask) {
            quoteCache.set(underlying, { bid, ask });
          }
        }
      }
    } catch (e) {
      // Quote fetch failed, continue without it
    }
  }

  try {

    // Collect snapshot contracts for full-session aggregates
    const snapshotContracts = new Map<string, 'C' | 'P'>();

    // Step 1: Get active contracts for each underlying
    for (const underlying of tickers.slice(0, 5)) {
      try {
        // BUG 5 FIX: When callPut === 'all', fetch calls and puts separately
        // Polygon API sometimes only returns calls when filtering by ticker
        let snapshotData: any = { results: [] };
        
        if (callPut === 'all') {
          // Fetch calls and puts separately, then combine
          let callsRes: Response | null = null;
          let putsRes: Response | null = null;
          
          try {
            [callsRes, putsRes] = await Promise.all([
              fetch(`https://api.polygon.io/v3/snapshot/options/${underlying}?limit=100&contract_type=call&apiKey=${POLYGON_API_KEY}`, {
                next: { revalidate: 10 },
                signal: AbortSignal.timeout(15000), // Reduced to 15s
              }),
              fetch(`https://api.polygon.io/v3/snapshot/options/${underlying}?limit=100&contract_type=put&apiKey=${POLYGON_API_KEY}`, {
                next: { revalidate: 10 },
                signal: AbortSignal.timeout(15000), // Reduced to 15s
              }),
            ]);
          } catch (fetchError: any) {
            if (fetchError.name === 'AbortError' || fetchError.code === 'UND_ERR_CONNECT_TIMEOUT') {
              errors.push(`${underlying}: Connection timeout - API may be unavailable`);
            } else {
              errors.push(`${underlying}: Fetch error - ${fetchError.message?.substring(0, 100) || 'Unknown error'}`);
            }
            continue;
          }
          
          if (!callsRes?.ok && !putsRes?.ok) {
            const errorText = callsRes?.ok ? (await putsRes?.text().catch(() => 'Unknown')) : (await callsRes?.text().catch(() => 'Unknown'));
            errors.push(`${underlying}: Both snapshots failed - ${errorText.substring(0, 100)}`);
            continue;
          }
          
          const callsData = callsRes?.ok ? await callsRes.json().catch(() => ({ results: [] })) : { results: [] };
          const putsData = putsRes?.ok ? await putsRes.json().catch(() => ({ results: [] })) : { results: [] };
          
          // Combine results
          snapshotData = {
            results: [
              ...(callsData.results || []),
              ...(putsData.results || []),
            ],
          };
          
          console.log(`[Flow API] ${underlying}: Fetched ${callsData.results?.length || 0} calls + ${putsData.results?.length || 0} puts = ${snapshotData.results.length} total`);
        } else {
          // Fetch single type
          const snapshotUrl = new URL(`https://api.polygon.io/v3/snapshot/options/${underlying}`);
          snapshotUrl.searchParams.set('limit', '100');
          snapshotUrl.searchParams.set('apiKey', POLYGON_API_KEY);
          
          if (callPut === 'call' || callPut === 'C') {
            snapshotUrl.searchParams.set('contract_type', 'call');
          } else if (callPut === 'put' || callPut === 'P') {
            snapshotUrl.searchParams.set('contract_type', 'put');
          }

          let snapshotRes: Response;
          try {
            snapshotRes = await fetch(snapshotUrl.toString(), { 
              next: { revalidate: 10 },
              signal: AbortSignal.timeout(15000), // Reduced to 15s
            });
          } catch (fetchError: any) {
            if (fetchError.name === 'AbortError' || fetchError.code === 'UND_ERR_CONNECT_TIMEOUT') {
              errors.push(`${underlying}: Connection timeout - API may be unavailable`);
            } else {
              errors.push(`${underlying}: Fetch error - ${fetchError.message?.substring(0, 100) || 'Unknown error'}`);
            }
            continue;
          }
          
          if (!snapshotRes.ok) {
            const errorText = await snapshotRes.text().catch(() => 'Unknown error');
            errors.push(`${underlying}: Snapshot failed ${snapshotRes.status} - ${errorText.substring(0, 100)}`);
            continue;
          }
          
          snapshotData = await snapshotRes.json().catch(() => ({ results: [] }));
        }
        
        if (!snapshotData.results || !Array.isArray(snapshotData.results)) {
          continue;
        }

        // Log snapshot data for debugging - BUG 5 FIX: Enhanced logging
        const callsCount = snapshotData.results.filter((r: any) => {
          const ct = (r.details?.contract_type || '').toLowerCase();
          return ct === 'call' || ct === 'c';
        }).length;
        const putsCount = snapshotData.results.filter((r: any) => {
          const ct = (r.details?.contract_type || '').toLowerCase();
          return ct === 'put' || ct === 'p';
        }).length;
        const unknownCount = snapshotData.results.length - callsCount - putsCount;
        console.log(`[Flow API] ${underlying}: Snapshot has ${callsCount} calls, ${putsCount} puts, ${unknownCount} unknown (total: ${snapshotData.results.length})`);
        
        // Log sample contract types to debug
        if (snapshotData.results.length > 0) {
          const sampleTypes = snapshotData.results.slice(0, 5).map((r: any) => ({
            ticker: r.details?.ticker || r.ticker,
            contract_type: r.details?.contract_type,
            volume: r.day?.volume || 0,
          }));
          console.log(`[Flow API] ${underlying}: Sample contracts:`, JSON.stringify(sampleTypes, null, 2));
        }

        // Filter to contracts with volume > 0 (active today)
        // BUT: If date range is provided, include all contracts (for historical data)
        const allActiveContracts = snapshotData.results.filter((r: any) => {
          // If we have a date range, include all contracts (we'll filter trades by date)
          if (timestampGte !== null || timestampLte !== null) {
            return true; // Include all contracts for historical queries
          }
          // Otherwise, only include contracts with volume today
          const vol = r.day?.volume || 0;
          return vol > 0;
        });
        
        console.log(`[Flow API] ${underlying}: ${allActiveContracts.length} contracts ${timestampGte !== null || timestampLte !== null ? '(historical mode - all contracts)' : '(active today with volume > 0)'}`);

        // BUG 5 FIX: Split into calls and puts, then take top from each
        // Use case-insensitive matching for contract_type
        const activeCalls = allActiveContracts
          .filter((r: any) => {
            const ct = (r.details?.contract_type || '').toLowerCase();
            return ct === 'call' || ct === 'c';
          })
          .sort((a: any, b: any) => (b.day?.volume || 0) - (a.day?.volume || 0))
          .slice(0, 15); // Top 15 calls
        
        const activePuts = allActiveContracts
          .filter((r: any) => {
            const ct = (r.details?.contract_type || '').toLowerCase();
            return ct === 'put' || ct === 'p';
          })
          .sort((a: any, b: any) => (b.day?.volume || 0) - (a.day?.volume || 0))
          .slice(0, 15); // Top 15 puts
        
        // Also check for contracts where contract_type might be missing but we can infer from ticker
        const activeUnknown = allActiveContracts.filter((r: any) => {
          const ct = (r.details?.contract_type || '').toLowerCase();
          return ct !== 'call' && ct !== 'c' && ct !== 'put' && ct !== 'p';
        });
        
        if (activeUnknown.length > 0) {
          console.log(`[Flow API] ${underlying}: Found ${activeUnknown.length} contracts with unknown type, attempting to infer from ticker`);
          // Try to infer from ticker format (O:SPY250210C00590000 or O:SPY250210P00590000)
          activeUnknown.forEach((contract: any) => {
            const ticker = contract.details?.ticker || contract.ticker || '';
            const cpMatch = ticker.match(/\d{6}([CP])\d{8}/);
            if (cpMatch && cpMatch[1] === 'P') {
              console.log(`[Flow API] ${underlying}: Inferred PUT from ticker: ${ticker}`);
              activePuts.push(contract);
            } else if (cpMatch && cpMatch[1] === 'C') {
              console.log(`[Flow API] ${underlying}: Inferred CALL from ticker: ${ticker}`);
              activeCalls.push(contract);
            }
          });
        }

        // Combine calls and puts, ensuring both are represented
        const activeContracts = [...activeCalls, ...activePuts];

        // Store snapshot contracts for full-session use
        for (const contract of activeContracts) {
          const optTicker = contract.details?.ticker || contract.ticker;
          if (!optTicker) continue;
          const ct = (contract.details?.contract_type || '').toLowerCase();
          const type: 'C' | 'P' = (ct === 'put' || ct === 'p') ? 'P' : 'C';
          snapshotContracts.set(optTicker, type);
        }

        console.log(`[Flow API] ${underlying}: Found ${activeContracts.length} active contracts (${activeCalls.length} calls, ${activePuts.length} puts)`);
        
        // Additional validation logging
        if (activeCalls.length === 0 && activePuts.length === 0) {
          console.warn(`[Flow API] ${underlying}: No active contracts found!`);
        } else if (activeCalls.length === 0) {
          console.warn(`[Flow API] ${underlying}: No active CALL contracts found!`);
        } else if (activePuts.length === 0) {
          console.warn(`[Flow API] ${underlying}: No active PUT contracts found!`);
        }

        // Step 2: Fetch recent trades for each active contract
        for (const contract of activeContracts) {
          const optionTicker = contract.details?.ticker || contract.ticker;
          if (!optionTicker) continue;

          // BUG 5 FIX: Parse contract type BEFORE fetching trades (use snapshot data)
          const details = contract.details || {};
          const contractTypeFromSnapshot = (details.contract_type || '').toLowerCase();
          let contractType: 'C' | 'P';
          
          if (contractTypeFromSnapshot === 'call' || contractTypeFromSnapshot === 'c') {
            contractType = 'C';
          } else if (contractTypeFromSnapshot === 'put' || contractTypeFromSnapshot === 'p') {
            contractType = 'P';
          } else {
            // Fallback: try to infer from option ticker (e.g., O:SPY250210C00590000 or O:SPY250210P00590000)
            // Look for C or P in the ticker (usually after the date YYMMDD)
            const cpMatch = optionTicker.match(/\d{6}([CP])\d{8}/);
            if (cpMatch && cpMatch[1]) {
              contractType = cpMatch[1] as 'C' | 'P';
            } else {
              // Last resort: default to call, but log warning
              contractType = 'C';
              console.warn(`[Flow API] Could not determine contract type for ${optionTicker} (snapshot type: ${contractTypeFromSnapshot}), defaulting to CALL`);
            }
          }

          // Debug logging for puts
          if (contractType === 'P') {
            console.log(`[Flow API] Processing PUT contract: ${optionTicker}, snapshot type: ${contractTypeFromSnapshot}`);
          }

          try {
            const tradesUrl = new URL(`https://api.polygon.io/v3/trades/${optionTicker}`);
            tradesUrl.searchParams.set('limit', '30');
            tradesUrl.searchParams.set('order', 'desc');
            tradesUrl.searchParams.set('apiKey', POLYGON_API_KEY);

            const tradesRes = await fetch(tradesUrl.toString(), {
              next: { revalidate: 5 },
              signal: AbortSignal.timeout(10000),
            });

            if (!tradesRes.ok) {
              // Silent fail for individual contract trades
              continue;
            }

            const tradesData = await tradesRes.json();
            
            if (!tradesData.results || !Array.isArray(tradesData.results)) {
              if (contractType === 'P') {
                console.log(`[Flow API] No trades found for PUT ${optionTicker}`);
              }
              continue;
            }

            // Log when we find trades for puts
            if (contractType === 'P' && tradesData.results.length > 0) {
              console.log(`[Flow API] Found ${tradesData.results.length} trades for PUT ${optionTicker}`);
            }

            // Parse contract details from snapshot
            const underlying_asset = contract.underlying_asset || {};
            const strike = parseFloat(details.strike_price) || 0;
            const expiry = details.expiration_date || '';
            
            const spotPrice = parseFloat(underlying_asset.price) || 0;
            const oi = parseInt(contract.open_interest || '0') || 0;
            
            // Extract Greeks from snapshot - BUG 1 FIX
            const greeks = contract.greeks || {};
            let delta = parseFloat(greeks.delta);
            const gamma = parseFloat(greeks.gamma) || 0;
            
            // If delta is NaN or missing, use default based on contract type
            if (isNaN(delta)) {
              delta = contractType === 'C' ? 0.5 : -0.5;
            }
            
            // Ensure delta sign is correct: calls positive, puts negative
            if (contractType === 'C' && delta < 0) delta = Math.abs(delta);
            if (contractType === 'P' && delta > 0) delta = -Math.abs(delta);

            // Process each trade
            for (const trade of tradesData.results) {
              const sequenceKey = `${optionTicker}-${trade.sequence_number || trade.sip_timestamp || Date.now()}`;
              
              // Skip duplicates
              if (seenSequences.has(sequenceKey)) continue;
              seenSequences.add(sequenceKey);

              const price = parseFloat(trade.price) || 0;
              const size = parseInt(trade.size) || 0;
              const premium = price * size * 100;

              // Skip if below min premium
              if (premium < minPremium) continue;

              // Parse timestamp (nanoseconds to ms)
              const timestampNs = trade.sip_timestamp || trade.participant_timestamp || 0;
              const timestampMs = Math.floor(timestampNs / 1000000);
              const timestamp = new Date(timestampMs).toISOString();

              // Determine trade type from conditions - BUG 2 FIX
              const conditions = trade.conditions || [];
              const tradeType = parseTradeType(conditions);
              
              // Check if sweep (case-insensitive)
              const isSweep = tradeType.toUpperCase().includes('SWEEP');
              
              // Infer side (this is approximate - would need quote data for accuracy)
              // Sweeps are typically aggressive buys
              const side: 'BUY' | 'SELL' | 'UNKNOWN' = isSweep ? 'BUY' : 'UNKNOWN';
              
              // Detect aggression (for options, use underlying quote)
              const quote = quoteCache.get(underlying);
              const { aggression, aggressionScore } = detectAggression(
                spotPrice, // Use underlying price for aggression detection
                quote?.bid || 0,
                quote?.ask || 0
              );

              // Calculate OTM percentage
              let otmPercent = 0;
              if (spotPrice > 0 && strike > 0) {
                if (contractType === 'C') {
                  otmPercent = ((strike - spotPrice) / spotPrice) * 100;
                } else {
                  otmPercent = ((spotPrice - strike) / spotPrice) * 100;
                }
              }

              // Calculate enhanced metrics
              const moneyness = getMoneyness(strike, spotPrice, contractType);
              const daysToExpiry = calculateDaysToExpiry(expiry);
              
              const deltaAdjustedPremium = calculateDeltaAdjustedPremium(
                premium,
                delta,
                contractType,
                side,
                tradeType
              );
              
              // Store base trade data (unusual and smart money score calculated later)
              const baseTrade: EnhancedOptionTrade = {
                id: sequenceKey,
                ticker: underlying,
                optionTicker,
                strike,
                expiry,
                callPut: contractType,
                price,
                size,
                premium: Math.round(premium),
                exchange: EXCHANGE_MAP[trade.exchange] || `EX${trade.exchange}`,
                exchangeId: trade.exchange,
                timestamp,
                timestampMs,
                conditions,
                tradeType,
                side,
                sequenceNumber: trade.sequence_number || 0,
                spotPrice,
                otmPercent: Math.round(otmPercent * 10) / 10,
                isSweep,
                isGolden: premium > 1000000 && isSweep,
                heatScore: 5, // Will be recalculated
                delta,
                gamma,
                openInterest: oi,
                underlyingPrice: spotPrice,
                deltaAdjustedPremium,
                smartMoneyScore: 0, // Will be calculated after all trades
                isUnusual: false, // Will be calculated after all trades
                moneyness,
                daysToExpiry,
                aggression,
                aggressionScore,
              };
              
              // Debug logging for puts
              if (contractType === 'P') {
                console.log(`[Flow API] Adding PUT trade: ${underlying} $${strike} ${contractType}, premium: $${premium}, delta: ${delta}`);
              }
              
              allTrades.push(baseTrade);
            }
          } catch (err) {
            // Silent fail for individual contract trades
            continue;
          }
        }
      } catch (err) {
        errors.push(`${underlying}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    // Sort by timestamp (newest first)
    allTrades.sort((a, b) => b.timestampMs - a.timestampMs);

    /* ══════════════════════════════════════════════════════════════
       FULL SESSION AGGREGATES — when fullSession=true
       
       Problem: Per-contract trades (limit=30, order=desc) only covers 
       the last few minutes for high-volume tickers like NVDA/SPY.
       
       Solution: Use Polygon's 5-min aggregates endpoint per contract.
       This gives volume bars spanning the ENTIRE trading day with just
       one API call per contract.
       
       Premium per bar ≈ volume × vwap × 100
       ══════════════════════════════════════════════════════════════ */
    let fullSessionTimeSeries: FlowTimeSeries[] | null = null;
    
    if (fullSession && snapshotContracts.size > 0) {
      try {
        // Get today's date in YYYY-MM-DD (ET timezone)
        const now = new Date();
        const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
        const today = `${etDate.getFullYear()}-${String(etDate.getMonth() + 1).padStart(2, '0')}-${String(etDate.getDate()).padStart(2, '0')}`;
        
        // Use snapshot contracts (already sorted by volume) instead of
        // trade-derived contracts — trades only cover last few minutes
        const callContracts: string[] = [];
        const putContracts: string[] = [];
        for (const [ticker, type] of snapshotContracts.entries()) {
          if (type === 'C' && callContracts.length < 15) callContracts.push(ticker);
          else if (type === 'P' && putContracts.length < 15) putContracts.push(ticker);
          if (callContracts.length >= 15 && putContracts.length >= 15) break;
        }
        const aggContracts = [...callContracts, ...putContracts];
        console.log(`[Flow API] Full session: fetching 5-min aggregates for ${aggContracts.length} contracts`);
        
        // Fetch 5-min aggregates for each contract
        const aggResults = await Promise.allSettled(
          aggContracts.map(async (optTicker) => {
            const url = `https://api.polygon.io/v2/aggs/ticker/${optTicker}/range/5/minute/${today}/${today}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`;
            const res = await fetch(url, { 
              next: { revalidate: 30 },
              signal: AbortSignal.timeout(8000),
            });
            if (!res.ok) return null;
            const data = await res.json();
            return {
              ticker: optTicker,
              type: contractMap.get(optTicker) || 'C',
              bars: data.results || [],
            };
          })
        );
        
        // Build time series from aggregates
        const timeBuckets = new Map<number, { time: string; timeMs: number; callPremium: number; putPremium: number; netFlow: number; cumulativeCDAF: number }>();
        
        aggResults.forEach(result => {
          if (result.status !== 'fulfilled' || !result.value) return;
          const { type, bars } = result.value;
          
          bars.forEach((bar: any) => {
            const t = bar.t; // timestamp in ms
            if (!t) return;
            const volume = bar.v || 0;
            const vwap = bar.vw || bar.c || 0; // prefer vwap, fallback to close
            const estimatedPremium = Math.round(volume * vwap * 100);
            
            const existing = timeBuckets.get(t) || {
              time: formatTimeET(t),
              timeMs: t,
              callPremium: 0,
              putPremium: 0,
              netFlow: 0,
              cumulativeCDAF: 0,
            };
            
            if (type === 'C') {
              existing.callPremium += estimatedPremium;
            } else {
              existing.putPremium += estimatedPremium;
            }
            existing.netFlow = existing.callPremium - existing.putPremium;
            
            timeBuckets.set(t, existing);
          });
        });
        
        if (timeBuckets.size > 5) {
          fullSessionTimeSeries = Array.from(timeBuckets.values())
            .sort((a, b) => a.timeMs - b.timeMs);
          console.log(`[Flow API] Full session: built ${fullSessionTimeSeries.length} time buckets spanning ${fullSessionTimeSeries[0]?.time || '?'} → ${fullSessionTimeSeries[fullSessionTimeSeries.length - 1]?.time || '?'}`);
        }
      } catch (err) {
        console.error('[Flow API] Full session aggregates error:', err);
        // Non-fatal — falls back to trade-based time series
      }
    }
    
    // Filter by date range if provided (before calculating stats)
    if (timestampGte !== null || timestampLte !== null) {
      allTrades = allTrades.filter(trade => {
        const tradeTime = trade.timestampMs;
        if (timestampGte !== null && tradeTime < timestampGte) return false;
        if (timestampLte !== null && tradeTime > timestampLte) return false;
        return true;
      });
    }

    // Calculate averages AFTER collecting all trades - BUG 3 & 4 FIX
    const avgPremium = allTrades.length > 0 
      ? allTrades.reduce((sum, t) => sum + t.premium, 0) / allTrades.length 
      : 0;
    const avgSize = allTrades.length > 0
      ? allTrades.reduce((sum, t) => sum + t.size, 0) / allTrades.length
      : 0;

    // Now calculate unusual and smart money score for each trade
    allTrades.forEach(trade => {
      // BUG 4 FIX: Fix unusual detection
      trade.isUnusual = isUnusualTrade(
        {
          premium: trade.premium,
          size: trade.size,
          openInterest: trade.openInterest,
        },
        avgPremium
      );
      
      // BUG 3 FIX: Fix smart money score calculation
      trade.smartMoneyScore = calculateSmartMoneyScore(
        {
          premium: trade.premium,
          tradeType: trade.tradeType,
          side: trade.side,
          moneyness: trade.moneyness,
          daysToExpiry: trade.daysToExpiry,
          isUnusual: trade.isUnusual,
        },
        avgPremium,
        avgSize
      );
      
      // Recalculate heat score with updated unusual flag
      let heatScore = 5;
      if (trade.premium > 1000000) heatScore += 2;
      else if (trade.premium > 500000) heatScore += 1.5;
      else if (trade.premium > 100000) heatScore += 1;
      if (trade.isUnusual) heatScore += 1;
      if (trade.isSweep) heatScore += 1;
      trade.heatScore = Math.min(10, Math.max(1, Math.round(heatScore)));
    });

    // Apply filters (unusual, sweeps)
    let filteredTrades = allTrades;
    if (filterUnusual) {
      filteredTrades = filteredTrades.filter(t => t.isUnusual);
    }
    if (filterSweeps) {
      filteredTrades = filteredTrades.filter(t => t.isSweep);
    }

    // Limit results
    const limitedTrades = filteredTrades.slice(0, limit);

    // Calculate enhanced stats
    const enhancedStats = calculateEnhancedStats(allTrades);
    
    // Override flowTimeSeries with full-session aggregates if available
    if (fullSessionTimeSeries && fullSessionTimeSeries.length > 5) {
      enhancedStats.flowTimeSeries = fullSessionTimeSeries;
      console.log(`[Flow API] Overriding flowTimeSeries with ${fullSessionTimeSeries.length} full-session aggregates buckets`);
    }

    // BUG 2 FIX: Fix sweep detection in stats
    const sweepPremium = allTrades
      .filter(t => {
        const type = t.tradeType.toUpperCase();
        return type.includes('SWEEP') || 
               type === 'INTERMARKET_SWEEP' || 
               type === 'ISO' ||
               (t.conditions && t.conditions.includes(219));
      })
      .reduce((sum, t) => sum + t.premium, 0);
    enhancedStats.sweepRatio = enhancedStats.totalPremium > 0 ? sweepPremium / enhancedStats.totalPremium : 0;

    // Validation logging - BUG 5 FIX: Enhanced logging for call/put breakdown
    const callTrades = allTrades.filter(t => t.callPut === 'C');
    const putTrades = allTrades.filter(t => t.callPut === 'P');
    const callPremium = callTrades.reduce((sum, t) => sum + t.premium, 0);
    const putPremium = putTrades.reduce((sum, t) => sum + t.premium, 0);
    
    console.log('=== FLOW API VALIDATION ===');
    console.log('Total trades:', allTrades.length);
    console.log(`Calls: ${callTrades.length} (${((callTrades.length / Math.max(allTrades.length, 1)) * 100).toFixed(1)}%)`);
    console.log(`Puts: ${putTrades.length} (${((putTrades.length / Math.max(allTrades.length, 1)) * 100).toFixed(1)}%)`);
    console.log(`Call Premium: $${(callPremium / 1000).toFixed(0)}K (${((callPremium / Math.max(callPremium + putPremium, 1)) * 100).toFixed(1)}%)`);
    console.log(`Put Premium: $${(putPremium / 1000).toFixed(0)}K (${((putPremium / Math.max(callPremium + putPremium, 1)) * 100).toFixed(1)}%)`);
    console.log('Sweeps:', allTrades.filter(t => t.tradeType.toUpperCase().includes('SWEEP')).length);
    console.log('Unusual:', allTrades.filter(t => t.isUnusual).length);
    console.log('Total premium:', enhancedStats.totalPremium);
    console.log('Net delta flow:', enhancedStats.netDeltaAdjustedFlow);
    console.log('Sweep ratio:', enhancedStats.sweepRatio);
    console.log('Avg smart money score:', enhancedStats.avgSmartMoneyScore);
    
    // Warn if we're missing puts
    if (putTrades.length === 0 && callTrades.length > 0) {
      console.error('⚠️  WARNING: No PUT trades found! Only CALL trades present.');
    } else if (putTrades.length < callTrades.length * 0.1) {
      console.warn(`⚠️  WARNING: Very few PUT trades (${putTrades.length} vs ${callTrades.length} calls). This may indicate a filtering issue.`);
    }
    
    const topByScore = [...allTrades].sort((a,b) => b.smartMoneyScore - a.smartMoneyScore)[0];
    const topByPremium = [...allTrades].sort((a,b) => b.premium - a.premium)[0];
    console.log('Top trade by score:', topByScore ? `${topByScore.ticker} $${topByScore.premium} (score: ${topByScore.smartMoneyScore})` : 'None');
    console.log('Top trade by premium:', topByPremium ? `${topByPremium.ticker} $${topByPremium.premium} (score: ${topByPremium.smartMoneyScore})` : 'None');
    console.log('Sample deltas:', allTrades.slice(0, 5).map(t => ({ ticker: t.ticker, callPut: t.callPut, delta: t.delta })));
    console.log('=== END VALIDATION ===');

    console.log(`[Flow API] Returning ${limitedTrades.length} trades from ${allTrades.length} total`);

    // Return partial success even if some tickers failed
    return NextResponse.json({
      success: true,
      data: {
        flow: limitedTrades,
        stats: enhancedStats,
        meta: {
          total: allTrades.length,
          returned: limitedTrades.length,
          tickers: tickers.slice(0, 5),
          errors: errors.length > 0 ? errors : undefined,
          timestamp: new Date().toISOString(),
        }
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
      },
    });

  } catch (error: any) {
    console.error('[Flow API] Error:', error);
    
    // If we have any trades collected, return partial success
    if (allTrades && allTrades.length > 0) {
      const partialStats = calculateEnhancedStats(allTrades);
      const partialLimited = allTrades.slice(0, limit);
      
      return NextResponse.json({
        success: true,
        data: {
          flow: partialLimited,
          stats: partialStats,
          meta: {
            total: allTrades.length,
            returned: partialLimited.length,
            tickers: tickers.slice(0, 5),
            errors: [...errors, `Partial data: ${error.message?.substring(0, 100) || 'Unknown error'}`],
            timestamp: new Date().toISOString(),
          }
        }
      }, {
        headers: {
          'Cache-Control': 'public, s-maxage=5, stale-while-revalidate=10',
        },
      });
    }
    
    // Only return error if we have no data at all
    const err = safeError(error, 'FlowOptions', 'Failed to fetch options flow');
    return NextResponse.json(
      { success: false, error: err.message },
      { status: err.status }
    );
  }
}

function calculateEnhancedStats(trades: EnhancedOptionTrade[]): EnhancedFlowStats {
  if (!trades.length) {
    return getEmptyStats();
  }

  // Basic aggregations
  const callTrades = trades.filter(t => t.callPut === 'C');
  const putTrades = trades.filter(t => t.callPut === 'P');
  const callPremium = callTrades.reduce((sum, t) => sum + t.premium, 0);
  const putPremium = putTrades.reduce((sum, t) => sum + t.premium, 0);
  const totalPremium = callPremium + putPremium;
  
  // Delta-adjusted flow
  const netDeltaAdjustedFlow = trades.reduce((sum, t) => sum + t.deltaAdjustedPremium, 0);
  
  // Sweep ratio - BUG 2 FIX: Case-insensitive detection
  const sweepPremium = trades
    .filter(t => {
      const type = t.tradeType.toUpperCase();
      return type.includes('SWEEP') || 
             type === 'INTERMARKET_SWEEP' || 
             type === 'ISO' ||
             (t.conditions && t.conditions.includes(219));
    })
    .reduce((sum, t) => sum + t.premium, 0);
  const sweepRatio = totalPremium > 0 ? sweepPremium / totalPremium : 0;
  
  // Momentum calculation (5min vs 20min EMA approximation)
  const now = Date.now();
  const fiveMinAgo = now - 5 * 60 * 1000;
  const twentyMinAgo = now - 20 * 60 * 1000;
  
  const recentFlow = trades
    .filter(t => t.timestampMs > fiveMinAgo)
    .reduce((sum, t) => sum + t.deltaAdjustedPremium, 0);
  const olderFlow = trades
    .filter(t => t.timestampMs > twentyMinAgo && t.timestampMs <= fiveMinAgo)
    .reduce((sum, t) => sum + t.deltaAdjustedPremium, 0);
  
  const flowMomentum = recentFlow - (olderFlow / 3); // Normalize for time difference
  let momentumDirection: 'accelerating' | 'decelerating' | 'neutral' = 'neutral';
  if (flowMomentum > 10000) momentumDirection = 'accelerating';
  else if (flowMomentum < -10000) momentumDirection = 'decelerating';
  
  // Unusual count
  const unusualCount = trades.filter(t => t.isUnusual).length;
  
  // Average smart money score
  const avgSmartMoneyScore = trades.reduce((sum, t) => sum + t.smartMoneyScore, 0) / trades.length;
  
  // Regime determination
  let regime: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
  if (netDeltaAdjustedFlow > 500000 && sweepRatio > 0.3) regime = 'RISK_ON';
  else if (netDeltaAdjustedFlow < -500000 && sweepRatio > 0.3) regime = 'RISK_OFF';
  
  // GEX by strike (premium-based proxy)
  const strikeMap = new Map<number, GexStrike>();
  trades.forEach(t => {
    const existing = strikeMap.get(t.strike) || {
      strike: t.strike,
      callGex: 0,
      putGex: 0,
      netGex: 0,
      callOI: 0,
      putOI: 0,
      callPremium: 0,
      putPremium: 0,
    };
    
    if (t.callPut === 'C') {
      existing.callPremium += t.premium;
      existing.callOI = Math.max(existing.callOI, t.openInterest);
      existing.callGex += t.premium * (t.gamma || 0);
    } else {
      existing.putPremium += t.premium;
      existing.putOI = Math.max(existing.putOI, t.openInterest);
      existing.putGex += t.premium * (t.gamma || 0);
    }
    existing.netGex = existing.callGex - existing.putGex;
    
    strikeMap.set(t.strike, existing);
  });
  
  const gexByStrike = Array.from(strikeMap.values())
    .sort((a, b) => (b.callPremium + b.putPremium) - (a.callPremium + a.putPremium))
    .slice(0, 15);
  
  // Time series - dynamic bucket size based on data range
  const tradeTimeRange = trades.length > 1 
    ? trades[trades.length - 1].timestampMs - trades[0].timestampMs 
    : 30 * 60 * 1000;
  const tradeRangeMinutes = tradeTimeRange / (60 * 1000);
  const bucketMinutes = tradeRangeMinutes <= 1 ? 1
    : tradeRangeMinutes <= 5 ? 1
    : tradeRangeMinutes <= 15 ? 1
    : tradeRangeMinutes <= 30 ? 2
    : tradeRangeMinutes <= 60 ? 5
    : tradeRangeMinutes <= 240 ? 5
    : 15;
  const bucketSize = bucketMinutes * 60 * 1000;
  const timeBuckets = new Map<number, FlowTimeSeries>();
  let runningCDAF = 0;
  
  const sortedTrades = [...trades].sort((a, b) => a.timestampMs - b.timestampMs);
  
  sortedTrades.forEach(t => {
    const bucket = Math.floor(t.timestampMs / bucketSize) * bucketSize;
    const existing = timeBuckets.get(bucket) || {
      time: formatTimeET(bucket),
      timeMs: bucket,
      callPremium: 0,
      putPremium: 0,
      netFlow: 0,
      cumulativeCDAF: 0,
    };
    
    if (t.callPut === 'C') {
      existing.callPremium += t.premium;
    } else {
      existing.putPremium += t.premium;
    }
    existing.netFlow = existing.callPremium - existing.putPremium;
    runningCDAF += t.deltaAdjustedPremium;
    existing.cumulativeCDAF = runningCDAF;
    
    timeBuckets.set(bucket, existing);
  });
  
  const flowTimeSeries = Array.from(timeBuckets.values())
    .sort((a, b) => a.timeMs - b.timeMs);
  
  // Most active ticker
  const tickerCounts = trades.reduce((acc, t) => {
    acc[t.ticker] = (acc[t.ticker] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const mostActive = Object.entries(tickerCounts)
    .sort((a, b) => b[1] - a[1])[0];
  
  const bullishPremium = trades
    .filter(t => t.callPut === 'C' && (t.side === 'BUY' || t.isSweep))
    .reduce((sum, t) => sum + t.premium, 0);
  const bearishPremium = trades
    .filter(t => t.callPut === 'P' && (t.side === 'BUY' || t.isSweep))
    .reduce((sum, t) => sum + t.premium, 0);

  return {
    totalPremium,
    callPremium,
    putPremium,
    callRatio: totalPremium > 0 ? Math.round((callPremium / totalPremium) * 100) : 50,
    putRatio: totalPremium > 0 ? Math.round((putPremium / totalPremium) * 100) : 50,
    tradeCount: trades.length,
    mostActive: mostActive ? { ticker: mostActive[0], count: mostActive[1] } : null,
    netDeltaAdjustedFlow,
    flowMomentum,
    momentumDirection,
    sweepRatio,
    avgSmartMoneyScore,
    unusualCount,
    regime,
    gexByStrike,
    flowTimeSeries,
    bullishPremium,
    bearishPremium,
  };
}

function getEmptyStats(): EnhancedFlowStats {
  return {
    totalPremium: 0,
    callPremium: 0,
    putPremium: 0,
    callRatio: 50,
    putRatio: 50,
    tradeCount: 0,
    mostActive: null,
    netDeltaAdjustedFlow: 0,
    flowMomentum: 0,
    momentumDirection: 'neutral',
    sweepRatio: 0,
    avgSmartMoneyScore: 0,
    unusualCount: 0,
    regime: 'NEUTRAL',
    gexByStrike: [],
    flowTimeSeries: [],
    aggressionRatio: 50,
    aggressionBias: 'NEUTRAL',
    aboveAskPremium: 0,
    belowBidPremium: 0,
    bullishPremium: 0,
    bearishPremium: 0,
  };
}
