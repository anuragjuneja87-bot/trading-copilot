'use client';

import { useMemo } from 'react';
import { COLORS } from '@/lib/echarts-theme';
import { 
  Sparkles, Building2, Newspaper, Activity, Target,
  TrendingUp, TrendingDown, Minus, AlertTriangle
} from 'lucide-react';

interface AIThesisPanelProps {
  ticker: string;
  price: number;
  changePercent: number;
  // Data inputs for thesis generation
  flowStats: {
    callRatio?: number;
    putRatio?: number;
    netDeltaAdjustedFlow?: number;
    sweepRatio?: number;
    tradeCount?: number;
    unusualCount?: number;
    totalCallPremium?: number;
    totalPutPremium?: number;
  } | null;
  darkPoolStats: {
    printCount?: number;
    bullishPct?: number;
    bearishPct?: number;
    totalValue?: number;
    regime?: string;
  } | null;
  newsItems: any[];
  relativeStrength: {
    rsVsSpy: number;
    rsVsQqq: number;
    regime: string;
    tickerChange: number;
    spyChange: number;
    qqqChange: number;
  } | null;
  levels: {
    callWall: number | null;
    putWall: number | null;
    gexFlip: number | null;
  };
  marketSession: 'pre-market' | 'open' | 'after-hours' | 'closed';
}

interface SubThesis {
  icon: any;
  label: string;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'NO_DATA';
  summary: string;
  details: string[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';
}

export function AIThesisPanel({
  ticker,
  price,
  changePercent,
  flowStats,
  darkPoolStats,
  newsItems,
  relativeStrength,
  levels,
  marketSession,
}: AIThesisPanelProps) {
  
  const theses = useMemo(() => {
    const result: SubThesis[] = [];
    
    // ============================================
    // 1. OPTIONS FLOW THESIS
    // ============================================
    const flowThesis = buildFlowThesis(ticker, flowStats, marketSession);
    result.push(flowThesis);
    
    // ============================================
    // 2. DARK POOL THESIS
    // ============================================
    const dpThesis = buildDarkPoolThesis(ticker, darkPoolStats, marketSession);
    result.push(dpThesis);
    
    // ============================================
    // 3. NEWS THESIS
    // ============================================
    const newsThesis = buildNewsThesis(ticker, newsItems);
    result.push(newsThesis);
    
    // ============================================
    // 4. RELATIVE STRENGTH THESIS
    // ============================================
    const rsThesis = buildRSThesis(ticker, relativeStrength, changePercent, marketSession);
    result.push(rsThesis);
    
    return result;
  }, [ticker, flowStats, darkPoolStats, newsItems, relativeStrength, changePercent, marketSession]);
  
  // Overall thesis = weighted combination
  const overallThesis = useMemo(() => {
    return buildOverallThesis(ticker, theses, price, changePercent, levels, marketSession);
  }, [ticker, theses, price, changePercent, levels, marketSession]);

  const biasColor = (bias: string) => {
    switch (bias) {
      case 'BULLISH': return COLORS.green;
      case 'BEARISH': return COLORS.red;
      case 'NEUTRAL': return '#ffc107';
      case 'NO_DATA': return '#555';
      default: return '#888';
    }
  };

  return (
    <div 
      className="rounded-xl overflow-hidden"
      style={{ background: COLORS.cardBg, border: `1px solid ${COLORS.cardBorder}` }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: COLORS.cardBorder }}>
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4" style={{ color: COLORS.cyan }} />
          <span className="text-sm font-bold text-white">AI THESIS</span>
          <span className="text-xs text-gray-500">{ticker}</span>
        </div>
        <div 
          className="px-2.5 py-1 rounded-full text-xs font-bold"
          style={{ 
            background: `${biasColor(overallThesis.bias)}15`,
            color: biasColor(overallThesis.bias),
          }}
        >
          {overallThesis.bias}
        </div>
      </div>
      
      {/* Overall Thesis - prominent */}
      <div 
        className="px-4 py-3 border-b"
        style={{ 
          borderColor: COLORS.cardBorder,
          background: `${biasColor(overallThesis.bias)}08`,
        }}
      >
        <div className="flex items-start gap-3">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: `${biasColor(overallThesis.bias)}20` }}
          >
            <Target className="w-4 h-4" style={{ color: biasColor(overallThesis.bias) }} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Overall Thesis</div>
            <p className="text-sm text-gray-200 leading-relaxed">{overallThesis.summary}</p>
          </div>
        </div>
      </div>
      
      {/* Sub-theses */}
      <div className="divide-y" style={{ borderColor: COLORS.cardBorder }}>
        {theses.map((thesis, i) => (
          <ThesisRow key={i} thesis={thesis} biasColor={biasColor} />
        ))}
      </div>
    </div>
  );
}

function ThesisRow({ thesis, biasColor }: { thesis: SubThesis; biasColor: (b: string) => string }) {
  const Icon = thesis.icon;
  const color = biasColor(thesis.bias);
  
  return (
    <div className="px-4 py-2.5 flex items-start gap-3" style={{ borderColor: COLORS.cardBorder }}>
      {/* Icon */}
      <div 
        className="w-7 h-7 rounded flex items-center justify-center flex-shrink-0 mt-0.5"
        style={{ background: `${color}15` }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color }} />
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-xs font-bold text-gray-300">{thesis.label}</span>
          <div 
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: color }}
          />
          <span className="text-[10px] font-semibold" style={{ color }}>
            {thesis.bias === 'NO_DATA' ? 'NO DATA' : thesis.bias}
          </span>
        </div>
        <p className="text-xs text-gray-400 leading-relaxed">{thesis.summary}</p>
      </div>
    </div>
  );
}

// ============================================
// THESIS BUILDERS
// ============================================

function buildFlowThesis(
  ticker: string,
  flow: AIThesisPanelProps['flowStats'],
  session: string
): SubThesis {
  if (session !== 'open') {
    return {
      icon: Sparkles,
      label: 'Options Flow',
      bias: 'NO_DATA',
      summary: 'Options flow data not available outside market hours.',
      details: [],
      confidence: 'NONE',
    };
  }
  
  if (!flow || !flow.tradeCount || flow.tradeCount === 0) {
    return {
      icon: Sparkles,
      label: 'Options Flow',
      bias: 'NO_DATA',
      summary: 'No options flow detected in the selected timeframe.',
      details: [],
      confidence: 'NONE',
    };
  }
  
  const callRatio = flow.callRatio || 50;
  const putRatio = flow.putRatio || 50;
  const netFlow = flow.netDeltaAdjustedFlow || 0;
  const sweepRatio = (flow.sweepRatio || 0) * 100;
  const unusualCount = flow.unusualCount || 0;
  
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  const details: string[] = [];
  
  if (callRatio >= 65) {
    bias = 'BULLISH';
    details.push(`${callRatio.toFixed(0)}% call-dominated flow`);
  } else if (putRatio >= 65) {
    bias = 'BEARISH';
    details.push(`${putRatio.toFixed(0)}% put-dominated flow`);
  } else {
    details.push(`Balanced ${callRatio.toFixed(0)}/${putRatio.toFixed(0)} call/put ratio`);
  }
  
  if (Math.abs(netFlow) > 50000) {
    details.push(`Net delta flow ${netFlow > 0 ? '+' : ''}$${(netFlow / 1000).toFixed(0)}K`);
  }
  
  if (sweepRatio > 10) {
    details.push(`${sweepRatio.toFixed(0)}% sweep activity — institutional urgency`);
  }
  
  if (unusualCount > 0) {
    details.push(`${unusualCount} unusual trade${unusualCount > 1 ? 's' : ''} flagged`);
  }
  
  const confidence = flow.tradeCount >= 50 ? 'HIGH' : flow.tradeCount >= 20 ? 'MEDIUM' : 'LOW';
  
  let summary = '';
  if (bias === 'BULLISH') {
    summary = `Call-heavy flow (${callRatio.toFixed(0)}%) with ${flow.tradeCount} trades.`;
    if (sweepRatio > 10) summary += ` Sweep activity at ${sweepRatio.toFixed(0)}% signals institutional conviction.`;
    if (netFlow > 100000) summary += ` Strong bullish delta positioning.`;
  } else if (bias === 'BEARISH') {
    summary = `Put-heavy flow (${putRatio.toFixed(0)}%) across ${flow.tradeCount} trades.`;
    if (sweepRatio > 10) summary += ` Aggressive put sweeps suggest downside bets.`;
    if (netFlow < -100000) summary += ` Strong bearish delta positioning.`;
  } else {
    summary = `Balanced flow with no clear directional bias. ${flow.tradeCount} trades, ${callRatio.toFixed(0)}/${putRatio.toFixed(0)} call/put.`;
  }
  
  return { icon: Sparkles, label: 'Options Flow', bias, summary, details, confidence };
}

function buildDarkPoolThesis(
  ticker: string,
  dp: AIThesisPanelProps['darkPoolStats'],
  session: string
): SubThesis {
  if (session !== 'open') {
    return {
      icon: Building2,
      label: 'Dark Pool',
      bias: 'NO_DATA',
      summary: 'Dark pool data not available outside market hours.',
      details: [],
      confidence: 'NONE',
    };
  }
  
  if (!dp || !dp.printCount || dp.printCount === 0) {
    return {
      icon: Building2,
      label: 'Dark Pool',
      bias: 'NO_DATA',
      summary: 'No significant dark pool prints detected in this timeframe.',
      details: [],
      confidence: 'NONE',
    };
  }
  
  const bullPct = dp.bullishPct || 0;
  const totalValue = dp.totalValue || 0;
  const printCount = dp.printCount;
  
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  
  if (bullPct > 60) bias = 'BULLISH';
  else if (bullPct < 40) bias = 'BEARISH';
  
  const valueStr = totalValue >= 1000000 
    ? `$${(totalValue / 1000000).toFixed(1)}M` 
    : `$${(totalValue / 1000).toFixed(0)}K`;
  
  let summary = `${printCount} dark pool prints totaling ${valueStr}.`;
  
  if (bias === 'BULLISH') {
    summary += ` ${bullPct.toFixed(0)}% bullish — institutional accumulation pattern.`;
  } else if (bias === 'BEARISH') {
    summary += ` ${(100 - bullPct).toFixed(0)}% bearish — institutional distribution detected.`;
  } else {
    summary += ` Flow evenly split (${bullPct.toFixed(0)}% bullish) — no clear institutional direction.`;
  }
  
  return {
    icon: Building2,
    label: 'Dark Pool',
    bias,
    summary,
    details: [],
    confidence: printCount >= 10 ? 'HIGH' : printCount >= 3 ? 'MEDIUM' : 'LOW',
  };
}

function buildNewsThesis(ticker: string, news: any[]): SubThesis {
  if (!news || news.length === 0) {
    return {
      icon: Newspaper,
      label: 'News Sentiment',
      bias: 'NEUTRAL',
      summary: `No recent news for ${ticker}. Sentiment neutral by default.`,
      details: [],
      confidence: 'LOW',
    };
  }
  
  // Check for ticker-specific vs market-wide news
  const tickerSpecific = news.filter(n => {
    const title = (n.title || n.headline || '').toLowerCase();
    return title.includes(ticker.toLowerCase());
  });
  
  const hasSpecificNews = tickerSpecific.length > 0;
  const latestTitle = news[0]?.title || news[0]?.headline || 'No headline';
  
  // Simple sentiment from headline keywords
  const positiveWords = ['surge', 'rally', 'gain', 'beat', 'upgrade', 'bull', 'growth', 'record', 'soar', 'jump'];
  const negativeWords = ['drop', 'fall', 'crash', 'miss', 'downgrade', 'bear', 'cut', 'decline', 'plunge', 'weak'];
  
  let posScore = 0;
  let negScore = 0;
  
  news.forEach(item => {
    const title = (item.title || item.headline || '').toLowerCase();
    positiveWords.forEach(w => { if (title.includes(w)) posScore++; });
    negativeWords.forEach(w => { if (title.includes(w)) negScore++; });
  });
  
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (posScore > negScore + 1) bias = 'BULLISH';
  else if (negScore > posScore + 1) bias = 'BEARISH';
  
  let summary = '';
  if (hasSpecificNews) {
    summary = `${tickerSpecific.length} ${ticker}-specific headline${tickerSpecific.length > 1 ? 's' : ''}.`;
  } else {
    summary = `${news.length} market news items, none ${ticker}-specific.`;
  }
  
  if (bias === 'BULLISH') {
    summary += ' Headlines lean positive — supportive sentiment backdrop.';
  } else if (bias === 'BEARISH') {
    summary += ' Headlines lean negative — cautious sentiment.';
  } else {
    summary += ' Mixed or neutral sentiment from recent headlines.';
  }
  
  return {
    icon: Newspaper,
    label: 'News Sentiment',
    bias,
    summary,
    details: [],
    confidence: hasSpecificNews ? 'MEDIUM' : 'LOW',
  };
}

function buildRSThesis(
  ticker: string,
  rs: AIThesisPanelProps['relativeStrength'],
  changePercent: number,
  session: string
): SubThesis {
  if (!rs) {
    return {
      icon: Activity,
      label: 'Relative Strength',
      bias: 'NEUTRAL',
      summary: 'Relative strength data loading or unavailable.',
      details: [],
      confidence: 'NONE',
    };
  }
  
  const { rsVsSpy, rsVsQqq, regime, tickerChange, spyChange, qqqChange } = rs;
  
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (regime === 'STRONG_OUTPERFORM' || regime === 'OUTPERFORM') bias = 'BULLISH';
  else if (regime === 'STRONG_UNDERPERFORM' || regime === 'UNDERPERFORM') bias = 'BEARISH';
  
  let summary = '';
  
  if (bias === 'BULLISH') {
    summary = `${ticker} outperforming the market — `;
    if (tickerChange > 0 && spyChange < 0) {
      summary += `holding green (+${tickerChange.toFixed(2)}%) while SPY drops (${spyChange.toFixed(2)}%). Strong relative strength.`;
    } else if (tickerChange > spyChange) {
      summary += `up ${tickerChange.toFixed(2)}% vs SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%. Leading the move by ${rsVsSpy.toFixed(2)}%.`;
    } else {
      summary += `relative strength +${rsVsSpy.toFixed(2)}% vs SPY.`;
    }
  } else if (bias === 'BEARISH') {
    summary = `${ticker} underperforming the market — `;
    if (tickerChange < 0 && spyChange > 0) {
      summary += `red (${tickerChange.toFixed(2)}%) while SPY rallies (+${spyChange.toFixed(2)}%). Notable weakness.`;
    } else if (tickerChange < spyChange) {
      summary += `lagging at ${tickerChange.toFixed(2)}% vs SPY ${spyChange >= 0 ? '+' : ''}${spyChange.toFixed(2)}%. Trailing by ${rsVsSpy.toFixed(2)}%.`;
    } else {
      summary += `relative weakness ${rsVsSpy.toFixed(2)}% vs SPY.`;
    }
  } else {
    summary = `${ticker} trading in line with the broader market. RS vs SPY: ${rsVsSpy >= 0 ? '+' : ''}${rsVsSpy.toFixed(2)}%, vs QQQ: ${rsVsQqq >= 0 ? '+' : ''}${rsVsQqq.toFixed(2)}%.`;
  }
  
  return {
    icon: Activity,
    label: 'Relative Strength',
    bias,
    summary,
    details: [],
    confidence: 'MEDIUM',
  };
}

function buildOverallThesis(
  ticker: string,
  subTheses: SubThesis[],
  price: number,
  changePercent: number,
  levels: AIThesisPanelProps['levels'],
  session: string
): { bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL'; summary: string } {
  if (session === 'closed' || session === 'after-hours') {
    return {
      bias: 'NEUTRAL',
      summary: `Market closed. ${ticker} finished the session ${changePercent >= 0 ? 'up' : 'down'} ${Math.abs(changePercent).toFixed(2)}%. Review sub-theses from today's data below. Active thesis resumes at market open.`,
    };
  }
  
  if (session === 'pre-market') {
    return {
      bias: 'NEUTRAL',
      summary: `Pre-market session for ${ticker}. Options flow and dark pool not yet active. Check gap analysis and news below for early reads.`,
    };
  }
  
  // Count signal alignment
  const activeTheses = subTheses.filter(t => t.bias !== 'NO_DATA');
  const bullish = activeTheses.filter(t => t.bias === 'BULLISH').length;
  const bearish = activeTheses.filter(t => t.bias === 'BEARISH').length;
  const noData = subTheses.filter(t => t.bias === 'NO_DATA').length;
  
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (bullish >= 3) bias = 'BULLISH';
  else if (bearish >= 3) bias = 'BEARISH';
  else if (bullish >= 2 && bearish === 0) bias = 'BULLISH';
  else if (bearish >= 2 && bullish === 0) bias = 'BEARISH';
  
  // Build natural language summary
  const parts: string[] = [];
  
  // Price context
  parts.push(`${ticker} at $${price.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%).`);
  
  // GEX context
  if (levels.gexFlip) {
    const aboveFlip = price > levels.gexFlip;
    parts.push(`Price ${aboveFlip ? 'above' : 'below'} GEX flip ($${levels.gexFlip.toFixed(0)}) — ${aboveFlip ? 'mean-reversion zone, moves likely capped' : 'trend zone, moves can extend'}.`);
  }
  
  // Signal alignment
  if (bias === 'BULLISH') {
    const bullNames = activeTheses.filter(t => t.bias === 'BULLISH').map(t => t.label.toLowerCase());
    parts.push(`Bullish alignment across ${bullNames.join(', ')}.`);
  } else if (bias === 'BEARISH') {
    const bearNames = activeTheses.filter(t => t.bias === 'BEARISH').map(t => t.label.toLowerCase());
    parts.push(`Bearish pressure from ${bearNames.join(', ')}.`);
  } else {
    if (bullish > 0 && bearish > 0) {
      parts.push('Mixed signals — no clear consensus across indicators.');
    } else if (noData >= 2) {
      parts.push('Limited data available — wait for more signals before committing.');
    } else {
      parts.push('Neutral stance — no strong directional signals.');
    }
  }
  
  return { bias, summary: parts.join(' ') };
}
