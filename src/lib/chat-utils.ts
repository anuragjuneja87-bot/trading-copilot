/**
 * Chat utility functions for parsing AI responses and generating suggestions
 */

export type AnalysisDepth = 'quick' | 'analysis' | 'full';

export interface ParsedResponse {
  snapshot?: {
    ticker?: string;
    price?: number;
    changePercent?: number;
    callWall?: number;
    putWall?: number;
    maxGamma?: number;
    regime?: 'CRISIS' | 'ELEVATED' | 'NORMAL';
  };
  verdict?: {
    type: 'BUY' | 'SELL' | 'WAIT' | 'HOLD' | 'NEUTRAL';
    reasoning?: string;
    entry?: string;
    target?: string;
    stop?: string;
    invalidates?: string;
  };
  analysis?: string;
  deepAnalysis?: string;
}

/**
 * Parse AI response into structured sections
 */
export function parseAIResponse(text: string): ParsedResponse {
  const result: ParsedResponse = {};

  // Extract VERDICT
  const verdictMatch = text.match(/VERDICT[:\s]*(BUY|SELL|WAIT|HOLD|NEUTRAL)/i);
  if (verdictMatch) {
    result.verdict = {
      type: verdictMatch[1].toUpperCase() as any,
    };

    // Extract Entry, Target, Stop, Invalidates
    const entryMatch = text.match(/(?:Entry|entry)[:\s]*\$?([\d.]+)/i);
    const targetMatch = text.match(/(?:Target|target)[:\s]*\$?([\d.]+)/i);
    const stopMatch = text.match(/(?:Stop|stop)[:\s]*\$?([\d.]+)/i);
    const invalidatesMatch = text.match(/(?:Invalidates|invalidates|Invalidates if)[:\s]*(.+?)(?:\n|$)/i);

    if (entryMatch) result.verdict.entry = `$${entryMatch[1]}`;
    if (targetMatch) result.verdict.target = `$${targetMatch[1]}`;
    if (stopMatch) result.verdict.stop = `$${stopMatch[1]}`;
    if (invalidatesMatch) result.verdict.invalidates = invalidatesMatch[1].trim();

    // Extract reasoning (2-3 sentences after verdict)
    const reasoningMatch = text.match(/VERDICT[:\s]*(?:BUY|SELL|WAIT|HOLD|NEUTRAL)[:\s]*(.+?)(?:\n\n|Entry|Target|Stop|$)/is);
    if (reasoningMatch) {
      result.verdict.reasoning = reasoningMatch[1].trim().substring(0, 300);
    }
  }

  // Extract Snapshot data (price, levels, regime)
  const priceMatch = text.match(/(?:Price|Current)[:\s]*\$?([\d.]+)/i);
  const changeMatch = text.match(/(?:Change|Change%|Change Percent)[:\s]*([+-]?[\d.]+%)/i);
  const callWallMatch = text.match(/(?:Call Wall|Call wall)[:\s]*\$?([\d.]+)/i);
  const putWallMatch = text.match(/(?:Put Wall|Put wall)[:\s]*\$?([\d.]+)/i);
  const maxGammaMatch = text.match(/(?:Max Gamma|Max gamma)[:\s]*\$?([\d.]+)/i);
  const regimeMatch = text.match(/(?:Regime|Market Regime)[:\s]*(CRISIS|ELEVATED|NORMAL)/i);
  const tickerMatch = text.match(/(?:Ticker|Symbol)[:\s]*([A-Z]{1,5})/i) || text.match(/\b([A-Z]{1,5})\s+(?:is|at|trading)/i);

  if (priceMatch || callWallMatch || putWallMatch || regimeMatch) {
    result.snapshot = {};
    if (tickerMatch) result.snapshot.ticker = tickerMatch[1];
    if (priceMatch) result.snapshot.price = parseFloat(priceMatch[1]);
    if (changeMatch) result.snapshot.changePercent = parseFloat(changeMatch[1]);
    if (callWallMatch) result.snapshot.callWall = parseFloat(callWallMatch[1]);
    if (putWallMatch) result.snapshot.putWall = parseFloat(putWallMatch[1]);
    if (maxGammaMatch) result.snapshot.maxGamma = parseFloat(maxGammaMatch[1]);
    if (regimeMatch) result.snapshot.regime = regimeMatch[1].toUpperCase() as any;
  }

  // Extract Deep Analysis section
  const deepAnalysisMatch = text.match(/(?:DEEP ANALYSIS|Deep Analysis|🧠 DEEP ANALYSIS)[:\s]*\n(.*?)(?:\n\n|$)/is);
  if (deepAnalysisMatch) {
    result.deepAnalysis = deepAnalysisMatch[1].trim();
  }

  // Extract main analysis (everything else, preserving markdown)
  // Look for section markers in markdown format
  const sections = text.split(/(?=##\s+[^\n]+|###\s+[^\n]+)/);
  
  let analysisText = text;
  let deepAnalysisStart = -1;
  
  // Find deep analysis section (look for "## DEEP ANALYSIS" or "🧠 DEEP ANALYSIS")
  const deepAnalysisHeader = text.match(/(?:##\s+)?(?:🧠\s+)?DEEP\s+ANALYSIS[:\s]*/i);
  if (deepAnalysisHeader) {
    deepAnalysisStart = text.indexOf(deepAnalysisHeader[0]);
  }
  
  // Extract main analysis - everything before deep analysis, preserving markdown
  if (deepAnalysisStart > -1) {
    analysisText = text.substring(0, deepAnalysisStart).trim();
  }
  
  // Remove verdict section markers but keep the content structure
  // We want to preserve markdown formatting, so we just extract the verdict separately
  // and keep the rest as-is for markdown rendering
  
  // Remove only the explicit verdict line, keep everything else
  if (verdictMatch) {
    // Remove just the "VERDICT: BUY/SELL" line, keep reasoning and other content
    analysisText = analysisText.replace(/VERDICT[:\s]*(?:BUY|SELL|WAIT|HOLD|NEUTRAL)[:\s]*/i, '').trim();
  }

  // Remove snapshot data lines (but preserve markdown structure)
  // Only remove if they're standalone lines, not part of a table or formatted block
  analysisText = analysisText
    .replace(/^(?:Price|Current|Change|Call Wall|Put Wall|Max Gamma|Regime)[:\s]*[^\n]*$/gmi, '')
    .trim();

  if (analysisText.length > 0) {
    result.analysis = analysisText;
  }
  
  // Extract deep analysis with markdown preserved
  if (deepAnalysisStart > -1) {
    const deepAnalysisText = text.substring(deepAnalysisStart).trim();
    // Remove the header line but keep the rest
    result.deepAnalysis = deepAnalysisText.replace(/(?:##\s+)?(?:🧠\s+)?DEEP\s+ANALYSIS[:\s]*/i, '').trim();
  }

  return result;
}

/**
 * Generate context-aware suggestions
 */
export interface Suggestion {
  title: string;
  description: string;
  subtitle?: string; // Shows which tickers will be analyzed
  prompt: string;
  icon: string;
}

/**
 * Get watchlist tickers as comma-separated string
 */
export function getWatchlistTickers(watchlist: string[], max: number = 3): string {
  if (!watchlist || watchlist.length === 0) {
    return 'SPY, QQQ'; // Default fallback
  }
  return watchlist.slice(0, max).join(', ');
}

/**
 * Build suggestion prompt with ticker injection
 */
export function buildSuggestionPrompt(template: string, watchlist: string[]): string {
  const tickers = getWatchlistTickers(watchlist || [], 3);
  return template.replace('{TICKERS}', tickers);
}

export function generateSuggestions(
  timeOfDay: 'pre-market' | 'morning' | 'midday' | 'power-hour' | 'after-hours',
  regime: 'CRISIS' | 'ELEVATED' | 'NORMAL' | null,
  watchlist: string[],
  month: number
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  const tickers = getWatchlistTickers(watchlist || [], 3);
  const tickersDisplay = (watchlist && watchlist.length > 0) ? tickers : 'SPY, QQQ';

  // Time-based suggestions
  if (timeOfDay === 'pre-market') {
    suggestions.push(
      { 
        title: 'Pre-Market Setup', 
        description: 'Overnight gaps and pre-market moves',
        subtitle: `Analyzing ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Analyze pre-market activity for {TICKERS}. Include overnight gaps, pre-market volume, and key levels for the open', watchlist), 
        icon: '🌅' 
      },
      { 
        title: 'Overnight Gaps', 
        description: 'Stocks with significant overnight moves',
        subtitle: `Checking ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Show me stocks with significant overnight gaps and their implications. Focus on {TICKERS}', watchlist), 
        icon: '📊' 
      },
      { 
        title: "Today's Economic Calendar", 
        description: 'Key economic events today', 
        prompt: 'What economic events or data releases are happening today that could move markets?', 
        icon: '📅' 
      }
    );
  } else if (timeOfDay === 'morning') {
    suggestions.push(
      { 
        title: 'Opening Flow Analysis', 
        description: 'First 30 minutes of trading',
        subtitle: `Flow for ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Analyze the first 30 minutes of flow for {TICKERS}. Any unusual sweeps or large premium?', watchlist), 
        icon: '⚡' 
      },
      { 
        title: 'First 30min Verdict', 
        description: 'Early trading signals',
        subtitle: `Verdict for ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('What is the trading verdict for the first 30 minutes based on opening flow for {TICKERS}?', watchlist), 
        icon: '🎯' 
      }
    );
  } else if (timeOfDay === 'midday') {
    suggestions.push(
      { 
        title: 'Midday Flow Check', 
        description: 'Current flow and positioning',
        subtitle: `Checking ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('What is the current options flow and positioning telling us about {TICKERS}?', watchlist), 
        icon: '📈' 
      },
      { 
        title: 'Unusual Activity Scan', 
        description: 'Unusual options activity right now',
        subtitle: `Scanning ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Show me the most unusual options activity happening right now for {TICKERS}', watchlist), 
        icon: '🔍' 
      }
    );
  } else if (timeOfDay === 'power-hour') {
    suggestions.push(
      { 
        title: 'Power Hour Setup', 
        description: 'Final hour trading strategy',
        subtitle: `Positioning for ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Analyze positioning going into close for {TICKERS}. Any end-of-day gamma effects?', watchlist), 
        icon: '⚡' 
      },
      { 
        title: 'Into-Close Positioning', 
        description: 'End of day flow analysis',
        subtitle: `Flow for ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Analyze the flow going into market close for {TICKERS}', watchlist), 
        icon: '📊' 
      }
    );
  } else if (timeOfDay === 'after-hours') {
    suggestions.push(
      { 
        title: 'End of Day Summary', 
        description: 'Today\'s key moves and levels',
        subtitle: `${tickersDisplay} recap`,
        prompt: buildSuggestionPrompt('Give me an end of day summary for {TICKERS} including key moves, flow summary, and levels to watch tomorrow', watchlist), 
        icon: '📋' 
      },
      { 
        title: 'After-Hours Movers', 
        description: 'Stocks moving after hours',
        subtitle: `${tickersDisplay} + top movers`,
        prompt: buildSuggestionPrompt('What are the biggest after-hours movers right now? Also check after-hours activity for {TICKERS}', watchlist), 
        icon: '🌙' 
      }
    );
  }

  // Regime-based suggestions
  if (regime === 'CRISIS') {
    suggestions.push(
      { 
        title: 'Crisis Risk Assessment', 
        description: 'Current risk levels and hedges',
        subtitle: `Risk for ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('What is the current crisis risk assessment for {TICKERS} and what hedges should I consider?', watchlist), 
        icon: '⚠️' 
      },
      { 
        title: 'Hedging Strategies', 
        description: 'Protective positioning ideas',
        subtitle: `Hedges for ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('What hedging strategies should I consider for {TICKERS} in this crisis regime?', watchlist), 
        icon: '🛡️' 
      },
      { 
        title: 'Safe Haven Check', 
        description: 'Where to find safety', 
        prompt: 'What are the safe haven assets in this crisis environment?', 
        icon: '🏛️' 
      }
    );
  } else if (regime === 'NORMAL') {
    suggestions.push(
      { 
        title: 'Bullish Setups Today', 
        description: 'Best bullish opportunities',
        subtitle: `Scanning ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('What are the best bullish setups right now for {TICKERS}? Include flow, gamma levels, and entry/exit points', watchlist), 
        icon: '📈' 
      },
      { 
        title: 'Highest Conviction Flow', 
        description: 'Most confident trades',
        subtitle: `Top flow across ${tickersDisplay}`,
        prompt: buildSuggestionPrompt('Show me the highest conviction options flow today for {TICKERS}. Include premium, direction, and unusual activity', watchlist), 
        icon: '🎯' 
      }
    );
  } else if (regime === 'ELEVATED') {
    suggestions.push(
      { 
        title: 'Volatility Plays', 
        description: 'VIX and volatility opportunities', 
        prompt: 'What are the best volatility plays given the elevated regime?', 
        icon: '📊' 
      },
      { 
        title: 'VIX Term Structure', 
        description: 'VIX curve analysis', 
        prompt: 'Analyze the VIX term structure and what it means for trading', 
        icon: '📉' 
      }
    );
  }

  // Seasonality suggestions
  if (month === 1) {
    suggestions.push({ 
      title: 'January Effect Opportunities', 
      description: 'Historical January patterns', 
      prompt: 'What are the January effect opportunities based on historical patterns?', 
      icon: '📅' 
    });
  } else if (month === 2) {
    // For February, focus on tech tickers from watchlist
    const techTickers = watchlist.filter(t => ['QQQ', 'NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD', 'META', 'GOOGL', 'AMZN'].includes(t));
    const febTickers = techTickers.length > 0 ? getWatchlistTickers(techTickers, 2) : 'QQQ, NVDA';
    suggestions.push({ 
      title: 'February Tech Seasonality Risk', 
      description: 'Historical Feb drawdowns',
      subtitle: `Historical risk for ${febTickers}`,
      prompt: buildSuggestionPrompt('Analyze February seasonality risk for {TICKERS}. Include historical February performance, current positioning, and whether the seasonal pattern is likely to play out this year', techTickers.length > 0 ? techTickers : ['QQQ', 'NVDA']), 
      icon: '⚠️' 
    });
  } else if (month === 9) {
    suggestions.push({ 
      title: 'September Selloff Watch', 
      description: 'Historical September patterns', 
      prompt: 'What should I watch for in September based on historical selloff patterns?', 
      icon: '📉' 
    });
  } else if (month === 12) {
    suggestions.push(
      { 
        title: 'Tax Loss Harvesting Plays', 
        description: 'Year-end tax strategies', 
        prompt: 'What are the tax loss harvesting opportunities and plays?', 
        icon: '💰' 
      },
      { 
        title: 'Santa Rally Check', 
        description: 'December rally patterns', 
        prompt: 'Is the Santa rally in play and what does it mean?', 
        icon: '🎄' 
      }
    );
  }

  // Watchlist-based suggestions (max 2)
  if (watchlist && watchlist.length > 0) {
    watchlist.slice(0, 2).forEach((ticker) => {
      suggestions.push(
        { title: `${ticker} Quick Thesis`, description: `Trading thesis for ${ticker}`, prompt: `Give me a quick trading thesis for ${ticker}`, icon: '📊' },
        { title: `${ticker} Flow Check`, description: `Options flow for ${ticker}`, prompt: `What is the options flow telling us about ${ticker}?`, icon: '📈' }
      );
    });
  }

  // Return unique suggestions (by title) and limit to 8
  const unique = Array.from(new Map(suggestions.map(s => [s.title, s])).values());
  return unique.slice(0, 8);
}

/**
 * Get time of day category based on ET time
 */
export function getTimeOfDay(): 'pre-market' | 'morning' | 'midday' | 'power-hour' | 'after-hours' {
  const now = new Date();
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const time = hours * 60 + minutes;

  // Pre-market: before 9:30 AM
  if (time < 570) return 'pre-market';
  // Morning: 9:30 AM - 10:00 AM
  if (time < 600) return 'morning';
  // Midday: 10:00 AM - 3:00 PM
  if (time < 900) return 'midday';
  // Power hour: 3:00 PM - 4:00 PM
  if (time < 960) return 'power-hour';
  // After hours: after 4:00 PM
  return 'after-hours';
}

/**
 * Get analysis depth preference from localStorage
 */
export function getAnalysisDepthPreference(): AnalysisDepth {
  if (typeof window === 'undefined') return 'quick';
  try {
    const stored = localStorage.getItem('chat_analysis_depth');
    if (stored === 'quick' || stored === 'analysis' || stored === 'full') {
      return stored;
    }
  } catch {}
  return 'quick';
}

/**
 * Save analysis depth preference to localStorage
 */
export function setAnalysisDepthPreference(depth: AnalysisDepth): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('chat_analysis_depth', depth);
  } catch {}
}

/**
 * Get pinned insights from localStorage
 */
export function getPinnedInsights(): Array<{ id: string; content: string; timestamp: number }> {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem('chat_pinned_insights');
    if (stored) {
      const data = JSON.parse(stored);
      // Filter out old pins (older than today)
      const today = new Date().toDateString();
      return data.filter((pin: any) => new Date(pin.timestamp).toDateString() === today);
    }
  } catch {}
  return [];
}

/**
 * Save pinned insight to localStorage
 */
export function pinInsight(content: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getPinnedInsights();
    const newPin = {
      id: `pin_${Date.now()}`,
      content,
      timestamp: Date.now(),
    };
    const updated = [...existing, newPin];
    localStorage.setItem('chat_pinned_insights', JSON.stringify(updated));
  } catch {}
}

/**
 * Remove pinned insight
 */
export function unpinInsight(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const existing = getPinnedInsights();
    const updated = existing.filter(pin => pin.id !== id);
    localStorage.setItem('chat_pinned_insights', JSON.stringify(updated));
  } catch {}
}
