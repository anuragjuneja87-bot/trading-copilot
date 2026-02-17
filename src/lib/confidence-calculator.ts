interface SignalData {
  // Flow
  netDeltaFlow: number;
  avgDailyFlow: number; // Need to track this
  sweepRatio: number;
  callPutRatio: number;
  
  // Dark Pool
  dpBullishPct: number;
  dpVolume: number;
  avgDpVolume: number;
  
  // Market Context
  priceChange: number;
  vix: number;
  fearGreedIndex: number;
  
  // Data Quality
  flowTradeCount: number;
  dataAgeSeconds: number;
}

export interface ConfidenceResult {
  confidence: number;         // 0-100
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CONFLICTING';
  reliability: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  conflicts: string[];
  supports: string[];
  recommendation: string;
}

export function calculateConfidence(data: SignalData): ConfidenceResult {
  const conflicts: string[] = [];
  const supports: string[] = [];
  let bullishScore = 0;
  let bearishScore = 0;
  let dataQualityScore = 100;

  // ============================================
  // 1. DATA QUALITY CHECK (Can reduce confidence to 0)
  // ============================================
  
  // Check flow volume significance
  const flowVsAvg = data.avgDailyFlow > 0 
    ? data.netDeltaFlow / data.avgDailyFlow 
    : 0;
  
  if (Math.abs(data.netDeltaFlow) < 50000) {
    // Less than $50K is noise
    dataQualityScore -= 50;
    const flowStr = Math.abs(data.netDeltaFlow) >= 1000 
      ? `$${(data.netDeltaFlow / 1000).toFixed(1)}K`
      : `$${data.netDeltaFlow.toFixed(0)}`;
    conflicts.push(`Flow volume too low (${flowStr}) - insufficient signal`);
  } else if (Math.abs(flowVsAvg) < 0.01) {
    // Less than 1% of average
    dataQualityScore -= 30;
    conflicts.push('Flow significantly below average (' + (flowVsAvg * 100).toFixed(1) + '% of typical)');
  }
  
  // Check trade count
  if (data.flowTradeCount < 10) {
    dataQualityScore -= 30;
    conflicts.push('Only ' + data.flowTradeCount + ' trades - low sample size');
  }
  
  // Check data freshness
  if (data.dataAgeSeconds > 300) {
    dataQualityScore -= 20;
    conflicts.push('Data is ' + Math.floor(data.dataAgeSeconds / 60) + ' minutes old');
  }
  
  // If data quality is too low, return early
  if (dataQualityScore < 30) {
    return {
      confidence: 0,
      bias: 'NEUTRAL',
      reliability: 'INSUFFICIENT',
      conflicts,
      supports: [],
      recommendation: 'Insufficient data to form opinion. Wait for more flow activity.',
    };
  }

  // ============================================
  // 2. FLOW SIGNALS
  // ============================================
  
  // Net Delta Flow
  if (data.netDeltaFlow > 500000) {
    bullishScore += 30;
    supports.push('Strong bullish delta flow (+$' + (data.netDeltaFlow/1000000).toFixed(1) + 'M)');
  } else if (data.netDeltaFlow > 100000) {
    bullishScore += 15;
    supports.push('Moderate bullish delta flow (+$' + (data.netDeltaFlow/1000).toFixed(0) + 'K)');
  } else if (data.netDeltaFlow < -500000) {
    bearishScore += 30;
    supports.push('Strong bearish delta flow (-$' + (Math.abs(data.netDeltaFlow)/1000000).toFixed(1) + 'M)');
  } else if (data.netDeltaFlow < -100000) {
    bearishScore += 15;
    supports.push('Moderate bearish delta flow (-$' + (Math.abs(data.netDeltaFlow)/1000).toFixed(0) + 'K)');
  }
  
  // Sweep Ratio (THE most important signal)
  if (data.sweepRatio > 0.30) {
    const sweepBonus = 25;
    if (data.callPutRatio > 60) {
      bullishScore += sweepBonus;
      supports.push('Aggressive call sweeps (' + (data.sweepRatio * 100).toFixed(0) + '% sweep rate)');
    } else if (data.callPutRatio < 40) {
      bearishScore += sweepBonus;
      supports.push('Aggressive put sweeps (' + (data.sweepRatio * 100).toFixed(0) + '% sweep rate)');
    }
  } else if (data.sweepRatio < 0.05) {
    conflicts.push('Low sweep activity (' + (data.sweepRatio * 100).toFixed(0) + '%) - no institutional urgency');
  }
  
  // Call/Put Ratio
  if (data.callPutRatio > 70) {
    bullishScore += 10;
    supports.push('Heavy call bias (' + data.callPutRatio + '% calls)');
  } else if (data.callPutRatio < 30) {
    bearishScore += 10;
    supports.push('Heavy put bias (' + (100 - data.callPutRatio) + '% puts)');
  }

  // ============================================
  // 3. DARK POOL SIGNALS
  // ============================================
  
  if (data.dpVolume > 0) {
    if (data.dpBullishPct > 60) {
      bullishScore += 20;
      supports.push('Dark pool accumulation (' + data.dpBullishPct.toFixed(0) + '% bullish)');
    } else if (data.dpBullishPct < 40) {
      bearishScore += 20;
      supports.push('Dark pool distribution (' + (100 - data.dpBullishPct).toFixed(0) + '% bearish)');
    } else {
      // Neutral dark pool
      conflicts.push('Dark pool neutral (' + data.dpBullishPct.toFixed(0) + '% bullish) - no clear direction');
    }
  }

  // ============================================
  // 4. CONFLICT DETECTION
  // ============================================
  
  // Flow vs Price Conflict
  if (data.netDeltaFlow > 100000 && data.priceChange < -1) {
    conflicts.push('⚠️ DIVERGENCE: Bullish flow but price down ' + data.priceChange.toFixed(1) + '%');
  } else if (data.netDeltaFlow < -100000 && data.priceChange > 1) {
    conflicts.push('⚠️ DIVERGENCE: Bearish flow but price up ' + data.priceChange.toFixed(1) + '%');
  }
  
  // Flow vs Dark Pool Conflict
  if ((bullishScore > bearishScore && data.dpBullishPct < 45) ||
      (bearishScore > bullishScore && data.dpBullishPct > 55)) {
    conflicts.push('⚠️ Flow and Dark Pool disagree');
  }
  
  // Extreme Fear but Bullish Flow
  if (data.fearGreedIndex < 20 && bullishScore > bearishScore) {
    conflicts.push('Market in Extreme Fear - contrarian signal');
  }

  // ============================================
  // 5. CALCULATE FINAL CONFIDENCE
  // ============================================
  
  const totalScore = bullishScore + bearishScore;
  const netScore = bullishScore - bearishScore;
  
  // Base confidence from signal strength
  let confidence = Math.min(Math.abs(netScore), 60); // Max 60% from signals alone
  
  // Bonus for signal alignment (multiple confirms)
  if (supports.length >= 3) confidence += 15;
  else if (supports.length >= 2) confidence += 10;
  
  // Penalty for conflicts
  confidence -= conflicts.filter(c => c.includes('⚠️')).length * 15;
  confidence -= conflicts.filter(c => !c.includes('⚠️')).length * 5;
  
  // Apply data quality factor
  confidence = Math.round(confidence * (dataQualityScore / 100));
  
  // Bounds
  confidence = Math.max(0, Math.min(95, confidence));
  
  // Minimum confidence floors based on data availability
  if (confidence === 0) {
    if (data.flowTradeCount > 0 && data.dpVolume > 0) {
      confidence = 15; // Some data exists, just conflicting
    } else if (data.flowTradeCount > 0 || data.dpVolume > 0) {
      confidence = 10; // Partial data exists
    }
    // 0% only if truly no data
  }
  
  // Determine bias
  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'CONFLICTING';
  if (conflicts.filter(c => c.includes('⚠️')).length >= 2) {
    bias = 'CONFLICTING';
  } else if (netScore >= 15) {
    bias = 'BULLISH';
  } else if (netScore <= -15) {
    bias = 'BEARISH';
  } else {
    bias = 'NEUTRAL';
  }
  
  // Determine reliability
  let reliability: 'HIGH' | 'MEDIUM' | 'LOW' | 'INSUFFICIENT';
  if (dataQualityScore >= 80 && data.flowTradeCount >= 50) {
    reliability = 'HIGH';
  } else if (dataQualityScore >= 50 && data.flowTradeCount >= 20) {
    reliability = 'MEDIUM';
  } else if (dataQualityScore >= 30) {
    reliability = 'LOW';
  } else {
    reliability = 'INSUFFICIENT';
  }
  
  // Generate recommendation
  let recommendation = '';
  if (reliability === 'INSUFFICIENT') {
    recommendation = 'Wait for more data before taking action.';
  } else if (bias === 'CONFLICTING') {
    recommendation = 'Conflicting signals - wait for resolution or reduce position size.';
  } else if (confidence >= 70 && reliability === 'HIGH') {
    recommendation = bias === 'BULLISH' 
      ? 'Strong bullish setup. Consider long entries on pullbacks to support.'
      : 'Strong bearish setup. Consider short entries on rallies to resistance.';
  } else if (confidence >= 50) {
    recommendation = 'Moderate signal strength. Use tight stops and smaller position size.';
  } else {
    recommendation = 'Weak signals. Avoid new positions, wait for clearer setup.';
  }
  
  return {
    confidence,
    bias,
    reliability,
    conflicts,
    supports,
    recommendation,
  };
}
