#!/usr/bin/env node

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║        TRADING PLATFORM - COMPREHENSIVE API TEST SUITE                    ║
 * ╠══════════════════════════════════════════════════════════════════════════╣
 * ║  Tests all API endpoints and reports data quality issues                  ║
 * ║                                                                           ║
 * ║  Usage:                                                                   ║
 * ║    node test-apis.js                    # Test with default tickers       ║
 * ║    node test-apis.js AAPL               # Test single ticker              ║
 * ║    node test-apis.js AAPL NVDA SPY      # Test multiple tickers           ║
 * ║                                                                           ║
 * ║  Environment:                                                             ║
 * ║    BASE_URL=http://localhost:3000       # Override API base URL           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TEST_TICKERS = process.argv.slice(2).length > 0 
  ? process.argv.slice(2).map(t => t.toUpperCase())
  : ['SPY', 'AAPL', 'NVDA'];

// ============================================================================
// TERMINAL COLORS & FORMATTING
// ============================================================================
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
};

const log = {
  header: (msg) => console.log(`\n${c.bold}${c.cyan}${'═'.repeat(70)}${c.reset}\n${c.bold}${c.cyan}  ${msg}${c.reset}\n${c.bold}${c.cyan}${'═'.repeat(70)}${c.reset}\n`),
  subheader: (msg) => console.log(`\n${c.bold}${c.white}▶ ${msg}${c.reset}`),
  success: (msg) => console.log(`  ${c.green}✓${c.reset} ${msg}`),
  warn: (msg) => console.log(`  ${c.yellow}⚠${c.reset} ${c.yellow}${msg}${c.reset}`),
  error: (msg) => console.log(`  ${c.red}✗${c.reset} ${c.red}${msg}${c.reset}`),
  info: (msg) => console.log(`  ${c.blue}ℹ${c.reset} ${msg}`),
  data: (label, value) => console.log(`    ${c.dim}${label}:${c.reset} ${value}`),
  json: (obj) => console.log(`    ${c.dim}${JSON.stringify(obj, null, 2).split('\n').join('\n    ')}${c.reset}`),
};

// ============================================================================
// TEST RESULTS STORAGE
// ============================================================================
const results = {
  passed: [],
  warnings: [],
  failed: [],
  apiData: {},
};

// ============================================================================
// FETCH HELPER WITH TIMEOUT
// ============================================================================
async function fetchAPI(endpoint, options = {}) {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;
  const timeout = options.timeout || 15000;
  const method = options.method || 'GET';
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const start = Date.now();
    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const elapsed = Date.now() - start;
    clearTimeout(timeoutId);
    
    const data = await response.json();
    
    return {
      success: response.ok,
      status: response.status,
      data,
      elapsed,
      url,
    };
  } catch (error) {
    clearTimeout(timeoutId);
    return {
      success: false,
      error: error.name === 'AbortError' ? 'TIMEOUT' : error.message,
      elapsed: timeout,
      url,
    };
  }
}

// ============================================================================
// TEST: MARKET PRICES API
// ============================================================================
async function testMarketPrices(tickers) {
  log.subheader(`Testing: /api/market/prices?tickers=${tickers.join(',')}`);
  
  const result = await fetchAPI(`/api/market/prices?tickers=${tickers.join(',')}`);
  
  if (!result.success) {
    log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    results.failed.push({ api: 'market/prices', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (!data.success) {
    log.error(`API Error: ${data.error}`);
    results.failed.push({ api: 'market/prices', error: data.error });
    return null;
  }
  
  const prices = Array.isArray(data.data) ? data.data : data.data?.prices || [];
  log.success(`Received ${prices.length} price records`);
  
  // Validate each price
  const issues = [];
  prices.forEach(p => {
    log.data(p.ticker, `$${p.price} (${p.change >= 0 ? '+' : ''}${p.change?.toFixed(2)} / ${p.changePercent >= 0 ? '+' : ''}${p.changePercent?.toFixed(2)}%)`);
    
    if (!p.price || p.price === 0) {
      issues.push(`${p.ticker}: price is 0 or missing`);
    }
    if (p.change === 0 && p.changePercent === 0) {
      issues.push(`${p.ticker}: change is 0 (weekend/after hours data issue)`);
    }
    if (!p.prevClose) {
      issues.push(`${p.ticker}: prevClose missing`);
    }
  });
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'market/prices', issues });
  } else {
    results.passed.push('market/prices');
  }
  
  results.apiData.prices = prices;
  return prices;
}

// ============================================================================
// TEST: OPTIONS FLOW API
// ============================================================================
async function testOptionsFlow(ticker) {
  log.subheader(`Testing: /api/flow/options?tickers=${ticker}`);
  
  const result = await fetchAPI(`/api/flow/options?tickers=${ticker}&limit=50`);
  
  if (!result.success) {
    log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    results.failed.push({ api: 'flow/options', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (!data.success) {
    log.error(`API Error: ${data.error}`);
    results.failed.push({ api: 'flow/options', error: data.error });
    return null;
  }
  
  const stats = data.data?.stats;
  const trades = data.data?.flow || [];
  
  log.success(`Received ${trades.length} trades`);
  
  const issues = [];
  
  // Check stats
  if (stats) {
    log.data('Net Delta Flow', `$${((stats.netDeltaAdjustedFlow || 0) / 1000).toFixed(1)}K`);
    log.data('Call/Put Ratio', `${stats.callRatio || 0}/${stats.putRatio || 0}`);
    log.data('Sweep Ratio', `${((stats.sweepRatio || 0) * 100).toFixed(1)}%`);
    log.data('Trade Count', stats.tradeCount || 0);
    log.data('Unusual Count', stats.unusualCount || 0);
    log.data('Flow Time Series', `${stats.flowTimeSeries?.length || 0} buckets`);
    log.data('GEX by Strike', `${stats.gexByStrike?.length || 0} strikes`);
    
    if (!stats.netDeltaAdjustedFlow && stats.netDeltaAdjustedFlow !== 0) {
      issues.push('netDeltaAdjustedFlow is missing');
    }
    if (!stats.flowTimeSeries || stats.flowTimeSeries.length === 0) {
      issues.push('flowTimeSeries is empty (chart will show single bar)');
    }
    if (!stats.gexByStrike || stats.gexByStrike.length === 0) {
      issues.push('gexByStrike is empty (gamma chart will be empty)');
    }
    if (stats.sweepRatio === 0) {
      issues.push('sweepRatio is 0 (no sweeps detected)');
    }
  } else {
    issues.push('No stats object returned');
  }
  
  // Check trades
  if (trades.length > 0) {
    const sweeps = trades.filter(t => t.isSweep);
    const unusual = trades.filter(t => t.isUnusual);
    log.data('Sweeps Found', sweeps.length);
    log.data('Unusual Found', unusual.length);
    
    // Check for aggression data (above ask / below bid)
    const hasAggression = trades.some(t => t.aggression || t.aggressionScore);
    if (!hasAggression) {
      issues.push('No aggression data (above ask/below bid) in trades');
    }
  }
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'flow/options', issues });
  } else {
    results.passed.push('flow/options');
  }
  
  results.apiData.flow = { stats, trades };
  return { stats, trades };
}

// ============================================================================
// TEST: DARK POOL API
// ============================================================================
async function testDarkPool(ticker) {
  log.subheader(`Testing: /api/darkpool?tickers=${ticker}`);
  
  const result = await fetchAPI(`/api/darkpool?tickers=${ticker}&limit=100`);
  
  if (!result.success) {
    log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    results.failed.push({ api: 'darkpool', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (!data.success) {
    log.error(`API Error: ${data.error}`);
    results.failed.push({ api: 'darkpool', error: data.error });
    return null;
  }
  
  const prints = data.data?.prints || [];
  const stats = data.data?.stats;
  
  log.success(`Received ${prints.length} dark pool prints`);
  
  const issues = [];
  
  if (stats) {
    log.data('Total Volume', `$${((stats.totalValue || 0) / 1000000).toFixed(2)}M`);
    log.data('Bullish %', `${stats.bullishPct || 0}%`);
    log.data('Bearish %', `${stats.bearishPct || 0}%`);
    log.data('Neutral %', `${stats.neutralPct || 0}%`);
    log.data('Print Count', stats.printCount || 0);
    
    if (stats.bullishPct === 0 && stats.bearishPct === 0) {
      issues.push('All prints classified as NEUTRAL - side detection not working');
    }
  } else {
    issues.push('No stats object returned');
  }
  
  // Check prints for side data
  if (prints.length > 0) {
    const withSide = prints.filter(p => p.side && p.side !== 'NEUTRAL');
    log.data('Prints with Side', `${withSide.length}/${prints.length}`);
    
    if (withSide.length === 0) {
      issues.push('No prints have bullish/bearish side classification');
    }
    
    // Sample print structure
    const sample = prints[0];
    log.data('Sample Print', JSON.stringify({ price: sample.price, size: sample.size, side: sample.side, value: sample.value }));
  }
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'darkpool', issues });
  } else {
    results.passed.push('darkpool');
  }
  
  results.apiData.darkpool = { prints, stats };
  return { prints, stats };
}

// ============================================================================
// TEST: NEWS API
// ============================================================================
async function testNews(ticker) {
  log.subheader(`Testing: /api/news?tickers=${ticker}`);
  
  const result = await fetchAPI(`/api/news?tickers=${ticker}&limit=10`);
  
  if (!result.success) {
    log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    results.failed.push({ api: 'news', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  const articles = data.data || data.articles || data.results || [];
  
  log.success(`Received ${articles.length} news articles`);
  
  const issues = [];
  
  if (articles.length > 0) {
    // Check for sentiment
    const withSentiment = articles.filter(a => a.sentiment && a.sentiment !== 'neutral');
    log.data('Articles with Sentiment', `${withSentiment.length}/${articles.length}`);
    
    if (withSentiment.length === 0) {
      issues.push('No articles have sentiment classification');
    }
    
    // Sample article
    const sample = articles[0];
    log.data('Sample Title', sample.title?.substring(0, 60) + '...');
    log.data('Sample Sentiment', sample.sentiment || 'NONE');
    log.data('Sample Source', sample.source || sample.publisher || 'Unknown');
  } else {
    issues.push('No news articles returned');
  }
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'news', issues });
  } else {
    results.passed.push('news');
  }
  
  results.apiData.news = articles;
  return articles;
}

// ============================================================================
// TEST: MARKET PULSE API (VIX, Regime)
// ============================================================================
async function testMarketPulse() {
  log.subheader('Testing: /api/market-pulse');
  
  const result = await fetchAPI('/api/market-pulse');
  
  if (!result.success) {
    log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    results.failed.push({ api: 'market-pulse', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (!data.success) {
    log.error(`API Error: ${data.error}`);
    results.failed.push({ api: 'market-pulse', error: data.error });
    return null;
  }
  
  const pulse = data.data;
  const issues = [];
  
  if (pulse) {
    log.data('VIX', pulse.vix || 'N/A');
    log.data('Regime', pulse.regime || pulse.marketRegime || 'N/A');
    log.data('SPY Price', pulse.spy?.price || 'N/A');
    log.data('QQQ Price', pulse.qqq?.price || 'N/A');
    
    if (!pulse.vix) {
      issues.push('VIX data missing');
    }
    if (!pulse.regime && !pulse.marketRegime) {
      issues.push('Market regime missing');
    }
  } else {
    issues.push('No pulse data returned');
  }
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'market-pulse', issues });
  } else {
    results.passed.push('market-pulse');
  }
  
  results.apiData.pulse = pulse;
  return pulse;
}

// ============================================================================
// TEST: LEVELS API
// ============================================================================
async function testLevels(ticker) {
  log.subheader(`Testing: /api/market/levels/${ticker}`);
  
  const result = await fetchAPI(`/api/market/levels/${ticker}`);
  
  if (!result.success) {
    log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    results.failed.push({ api: 'levels', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  const levels = data.data || data;
  
  const issues = [];
  
  if (levels) {
    log.data('Call Wall', levels.callWall ? `$${levels.callWall}` : 'N/A');
    log.data('Put Wall', levels.putWall ? `$${levels.putWall}` : 'N/A');
    log.data('Max Gamma', levels.maxGamma ? `$${levels.maxGamma}` : 'N/A');
    log.data('GEX Flip', levels.gexFlip ? `$${levels.gexFlip}` : 'N/A');
    log.data('VWAP', levels.vwap ? `$${levels.vwap}` : 'N/A');
    log.data('Max Pain', levels.maxPain ? `$${levels.maxPain}` : 'N/A');
    log.data('Expected Move', levels.expectedMove ? `±$${levels.expectedMove}` : 'N/A');
    
    if (!levels.callWall) issues.push('callWall missing');
    if (!levels.putWall) issues.push('putWall missing');
    if (!levels.gexFlip) issues.push('gexFlip missing (critical level)');
    if (!levels.vwap) issues.push('VWAP missing');
    if (!levels.maxPain) issues.push('maxPain missing');
    if (!levels.expectedMove) issues.push('expectedMove missing');
  } else {
    issues.push('No levels data returned');
  }
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'levels', issues });
  } else {
    results.passed.push('levels');
  }
  
  results.apiData.levels = levels;
  return levels;
}

// ============================================================================
// TEST: AI THESIS API (Databricks)
// ============================================================================
async function testAIThesis(ticker) {
  log.subheader(`Testing: /api/ai/format (AI Thesis for ${ticker})`);
  
  const result = await fetchAPI('/api/ai/format', {
    method: 'POST',
    body: {
      templateType: 'symbol_thesis',
      tickers: [ticker],
    },
    timeout: 20000, // AI calls take longer
  });
  
  if (!result.success) {
    if (result.error === 'TIMEOUT') {
      log.error('AI API timed out (20s) - Databricks may be slow or unreachable');
    } else {
      log.error(`API Failed: ${result.error || `Status ${result.status}`}`);
    }
    results.failed.push({ api: 'ai/format', error: result.error });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (!data.success) {
    log.error(`API Error: ${data.error}`);
    
    // Check specific error types
    if (data.error?.includes('Databricks')) {
      log.error('DATABRICKS CONNECTION ISSUE - Check DATABRICKS_HOST and DATABRICKS_TOKEN in .env');
    }
    
    results.failed.push({ api: 'ai/format', error: data.error });
    return null;
  }
  
  const issues = [];
  
  if (data.data?.narrative) {
    log.success('AI Thesis generated successfully');
    log.data('Thesis Preview', data.data.narrative.substring(0, 150) + '...');
    log.data('Elapsed', `${data.data.elapsed}s`);
  } else {
    issues.push('No narrative returned from AI');
  }
  
  if (issues.length > 0) {
    issues.forEach(i => log.warn(i));
    results.warnings.push({ api: 'ai/format', issues });
  } else {
    results.passed.push('ai/format');
  }
  
  results.apiData.aiThesis = data.data;
  return data.data;
}

// ============================================================================
// TEST: EXPECTED MOVE API (May not exist yet)
// ============================================================================
async function testExpectedMove(ticker) {
  log.subheader(`Testing: /api/market/expected-move?ticker=${ticker}`);
  
  const result = await fetchAPI(`/api/market/expected-move?ticker=${ticker}`);
  
  if (!result.success || result.status === 404) {
    log.warn('Expected Move API not implemented yet');
    results.warnings.push({ api: 'expected-move', issues: ['API not implemented'] });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (data.success && data.data) {
    log.success('Expected Move API working');
    log.data('Expected Move', `±$${data.data.expectedMove}`);
    log.data('Range', `$${data.data.lowerBound} - $${data.data.upperBound}`);
    results.passed.push('expected-move');
  } else {
    log.warn('Expected Move API returned no data');
    results.warnings.push({ api: 'expected-move', issues: ['No data returned'] });
  }
  
  return data.data;
}

// ============================================================================
// TEST: MAX PAIN API (May not exist yet)
// ============================================================================
async function testMaxPain(ticker) {
  log.subheader(`Testing: /api/market/max-pain?ticker=${ticker}`);
  
  const result = await fetchAPI(`/api/market/max-pain?ticker=${ticker}`);
  
  if (!result.success || result.status === 404) {
    log.warn('Max Pain API not implemented yet');
    results.warnings.push({ api: 'max-pain', issues: ['API not implemented'] });
    return null;
  }
  
  log.info(`Response time: ${result.elapsed}ms`);
  
  const data = result.data;
  if (data.success && data.data) {
    log.success('Max Pain API working');
    log.data('Max Pain', `$${data.data.maxPain}`);
    log.data('Distance', `${data.data.distancePercent?.toFixed(2)}%`);
    results.passed.push('max-pain');
  } else {
    log.warn('Max Pain API returned no data');
    results.warnings.push({ api: 'max-pain', issues: ['No data returned'] });
  }
  
  return data.data;
}

// ============================================================================
// PRINT FINAL REPORT
// ============================================================================
function printReport() {
  log.header('TEST RESULTS SUMMARY');
  
  console.log(`${c.bold}PASSED:${c.reset} ${c.green}${results.passed.length}${c.reset}`);
  results.passed.forEach(api => console.log(`  ${c.green}✓${c.reset} ${api}`));
  
  console.log(`\n${c.bold}WARNINGS:${c.reset} ${c.yellow}${results.warnings.length}${c.reset}`);
  results.warnings.forEach(w => {
    console.log(`  ${c.yellow}⚠${c.reset} ${w.api}`);
    w.issues?.forEach(i => console.log(`    ${c.dim}- ${i}${c.reset}`));
  });
  
  console.log(`\n${c.bold}FAILED:${c.reset} ${c.red}${results.failed.length}${c.reset}`);
  results.failed.forEach(f => {
    console.log(`  ${c.red}✗${c.reset} ${f.api}: ${f.error}`);
  });
  
  // Data Quality Summary
  log.header('DATA QUALITY ISSUES TO FIX');
  
  const issuesList = [];
  
  // Check for common issues
  if (results.warnings.some(w => w.issues?.some(i => i.includes('side detection')))) {
    issuesList.push({
      severity: 'HIGH',
      issue: 'Dark Pool side detection not working',
      fix: 'Implement VWAP-based or bid/ask-based side classification',
    });
  }
  
  if (results.warnings.some(w => w.issues?.some(i => i.includes('sentiment')))) {
    issuesList.push({
      severity: 'MEDIUM',
      issue: 'News sentiment not being parsed',
      fix: 'Parse sentiment from Polygon/Benzinga API response or implement local sentiment analysis',
    });
  }
  
  if (results.warnings.some(w => w.issues?.some(i => i.includes('flowTimeSeries')))) {
    issuesList.push({
      severity: 'MEDIUM',
      issue: 'Flow time series empty or single bucket',
      fix: 'Ensure time bucketing is working in /api/flow/options',
    });
  }
  
  if (results.warnings.some(w => w.issues?.some(i => i.includes('aggression')))) {
    issuesList.push({
      severity: 'HIGH',
      issue: 'No above ask/below bid data in options flow',
      fix: 'Add aggression detection using bid/ask comparison in trade processing',
    });
  }
  
  if (results.warnings.some(w => w.api === 'expected-move')) {
    issuesList.push({
      severity: 'MEDIUM',
      issue: 'Expected Move API not implemented',
      fix: 'Create /api/market/expected-move using ATM straddle calculation',
    });
  }
  
  if (results.warnings.some(w => w.api === 'max-pain')) {
    issuesList.push({
      severity: 'LOW',
      issue: 'Max Pain API not implemented',
      fix: 'Create /api/market/max-pain using OI at each strike',
    });
  }
  
  if (results.failed.some(f => f.api === 'ai/format')) {
    issuesList.push({
      severity: 'CRITICAL',
      issue: 'AI Thesis not working (Databricks connection failed)',
      fix: 'Check DATABRICKS_HOST and DATABRICKS_TOKEN env vars, or implement fallback AI provider',
    });
  }
  
  issuesList.forEach(item => {
    const color = item.severity === 'CRITICAL' ? c.bgRed : 
                  item.severity === 'HIGH' ? c.red : 
                  item.severity === 'MEDIUM' ? c.yellow : c.dim;
    console.log(`\n  ${color}[${item.severity}]${c.reset} ${item.issue}`);
    console.log(`  ${c.dim}Fix: ${item.fix}${c.reset}`);
  });
  
  // Final grade
  const totalTests = results.passed.length + results.warnings.length + results.failed.length;
  const score = ((results.passed.length + results.warnings.length * 0.5) / totalTests * 100).toFixed(0);
  
  console.log(`\n${c.bold}${'═'.repeat(70)}${c.reset}`);
  console.log(`${c.bold}OVERALL SCORE: ${score >= 80 ? c.green : score >= 60 ? c.yellow : c.red}${score}%${c.reset}`);
  console.log(`${c.bold}${'═'.repeat(70)}${c.reset}\n`);
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================
async function main() {
  console.log(`\n${c.bold}${c.magenta}╔══════════════════════════════════════════════════════════════════════════╗${c.reset}`);
  console.log(`${c.bold}${c.magenta}║         TRADING PLATFORM API TEST SUITE v1.0                             ║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╠══════════════════════════════════════════════════════════════════════════╣${c.reset}`);
  console.log(`${c.bold}${c.magenta}║  Base URL: ${BASE_URL.padEnd(58)}║${c.reset}`);
  console.log(`${c.bold}${c.magenta}║  Tickers:  ${TEST_TICKERS.join(', ').padEnd(58)}║${c.reset}`);
  console.log(`${c.bold}${c.magenta}╚══════════════════════════════════════════════════════════════════════════╝${c.reset}\n`);
  
  // Check if server is running
  try {
    await fetch(`${BASE_URL}/api/market/prices?tickers=SPY`, { signal: AbortSignal.timeout(5000) });
  } catch (e) {
    console.log(`${c.red}ERROR: Cannot connect to ${BASE_URL}${c.reset}`);
    console.log(`${c.yellow}Make sure the dev server is running: npm run dev${c.reset}\n`);
    process.exit(1);
  }
  
  // Run all tests
  log.header('MARKET DATA APIs');
  await testMarketPrices(TEST_TICKERS);
  await testMarketPulse();
  
  log.header(`OPTIONS FLOW (${TEST_TICKERS[0]})`);
  await testOptionsFlow(TEST_TICKERS[0]);
  
  log.header(`DARK POOL (${TEST_TICKERS[0]})`);
  await testDarkPool(TEST_TICKERS[0]);
  
  log.header(`NEWS (${TEST_TICKERS[0]})`);
  await testNews(TEST_TICKERS[0]);
  
  log.header(`KEY LEVELS (${TEST_TICKERS[0]})`);
  await testLevels(TEST_TICKERS[0]);
  
  log.header('PRO METRICS APIs');
  await testExpectedMove(TEST_TICKERS[0]);
  await testMaxPain(TEST_TICKERS[0]);
  
  log.header(`AI THESIS (${TEST_TICKERS[0]})`);
  await testAIThesis(TEST_TICKERS[0]);
  
  // Print final report
  printReport();
}

// Run
main().catch(console.error);
