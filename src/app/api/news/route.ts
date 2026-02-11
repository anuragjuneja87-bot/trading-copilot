import { NextRequest, NextResponse } from 'next/server';
import { NewsArticle, TickerSentiment, MarketMood } from '@/types/news';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY; // Massive.com uses Polygon API key
const MASSIVE_BASE_URL = 'https://api.massive.com';

// Always include these for market context
const MARKET_TICKERS = ['SPY', 'QQQ', 'VIX'];

function classifySeverity(text: string): 'CRISIS' | 'ELEVATED' | 'NORMAL' {
  const lower = text.toLowerCase();
  
  const crisisKeywords = [
    'halt', 'halted', 'crash', 'crashes', 'emergency', 'war', 'default',
    'bankrupt', 'bankruptcy', 'sec charges', 'fraud', 'circuit breaker',
    'trading suspended', 'delisted', 'margin call', 'liquidation',
    'regulatory action', 'ceo resigns', 'cfo resigns', 'audit', 'restatement'
  ];
  
  const elevatedKeywords = [
    'downgrade', 'downgrades', 'miss', 'misses', 'cut', 'cuts',
    'layoffs', 'layoff', 'investigation', 'tariff', 'rate hike',
    'guidance lower', 'recall', 'lawsuit', 'probe', 'subpoena',
    'warning', 'caution', 'concern', 'risk', 'decline', 'drop',
    'sell-off', 'selloff', 'plunge', 'tumble', 'slide', 'disappoints',
    'weak', 'weaker', 'slower', 'revenue miss', 'earnings miss'
  ];
  
  if (crisisKeywords.some(kw => lower.includes(kw))) return 'CRISIS';
  if (elevatedKeywords.some(kw => lower.includes(kw))) return 'ELEVATED';
  return 'NORMAL';
}

// Keyword-based sentiment analysis
function analyzeArticleSentiment(title: string, description: string): {
  score: number;
  label: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  keywords: string[];
} {
  const text = `${title} ${description}`.toLowerCase();
  
  const bullishKeywords = [
    'surge', 'soar', 'jump', 'rally', 'gain', 'rise', 'climb', 'beat', 'exceed',
    'upgrade', 'buy', 'outperform', 'bullish', 'growth', 'profit', 'record high',
    'breakout', 'momentum', 'strong', 'positive', 'optimistic', 'boom', 'recovery',
    'acquisition', 'merger', 'partnership', 'expansion', 'innovation', 'breakthrough',
    'dividend', 'buyback', 'raised guidance', 'beats estimates', 'all-time high'
  ];
  
  const bearishKeywords = [
    'crash', 'plunge', 'fall', 'drop', 'decline', 'sink', 'tumble', 'miss', 'below',
    'downgrade', 'sell', 'underperform', 'bearish', 'loss', 'warning', 'record low',
    'breakdown', 'weak', 'negative', 'pessimistic', 'recession', 'layoff', 'cut',
    'bankruptcy', 'default', 'fraud', 'investigation', 'lawsuit', 'scandal',
    'missed estimates', 'lowered guidance', 'concern', 'fear', 'crisis', 'risk'
  ];

  const foundBullish: string[] = [];
  const foundBearish: string[] = [];

  bullishKeywords.forEach(keyword => {
    if (text.includes(keyword)) foundBullish.push(keyword);
  });

  bearishKeywords.forEach(keyword => {
    if (text.includes(keyword)) foundBearish.push(keyword);
  });

  // Calculate score (-1 to 1)
  const bullishScore = foundBullish.length;
  const bearishScore = foundBearish.length;
  const totalKeywords = bullishScore + bearishScore;
  
  let score = 0;
  if (totalKeywords > 0) {
    score = (bullishScore - bearishScore) / Math.max(totalKeywords, 1);
    // Normalize to -1 to 1 range
    score = Math.max(-1, Math.min(1, score));
  }

  let label: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (score > 0.15) label = 'BULLISH';
  else if (score < -0.15) label = 'BEARISH';

  return {
    score,
    label,
    keywords: [...foundBullish.map(k => `+${k}`), ...foundBearish.map(k => `-${k}`)],
  };
}

// Calculate impact score (1-5)
function calculateImpactScore(article: any): number {
  let score = 1;
  
  const title = (article.title || '').toLowerCase();
  const keywords = article.keywords || [];
  
  // High impact keywords
  const highImpactTerms = [
    'earnings', 'quarterly results', 'guidance', 'forecast',
    'fda', 'approval', 'clinical trial', 'drug',
    'merger', 'acquisition', 'buyout', 'takeover',
    'bankruptcy', 'default', 'fraud', 'sec',
    'ceo', 'cfo', 'executive', 'resignation',
    'fed', 'interest rate', 'inflation', 'fomc',
    'layoff', 'restructuring', 'cost cutting'
  ];
  
  highImpactTerms.forEach(term => {
    if (title.includes(term)) score += 1;
  });
  
  // Multiple tickers mentioned = broader impact
  if (article.tickers?.length > 3) score += 1;
  
  return Math.min(score, 5);
}

// Detect event type from article
function detectEventType(title: string, keywords: string[]): string {
  const titleLower = title.toLowerCase();
  const allText = `${titleLower} ${keywords.join(' ').toLowerCase()}`;
  
  if (allText.includes('earning') || allText.includes('quarterly') || allText.includes('q1') || allText.includes('q2') || allText.includes('q3') || allText.includes('q4')) {
    return 'EARNINGS';
  }
  if (allText.includes('fda') || allText.includes('approval') || allText.includes('clinical') || allText.includes('drug')) {
    return 'FDA';
  }
  if (allText.includes('merger') || allText.includes('acquisition') || allText.includes('buyout') || allText.includes('takeover')) {
    return 'M&A';
  }
  if (allText.includes('dividend') || allText.includes('buyback') || allText.includes('repurchase')) {
    return 'DIVIDEND';
  }
  if (allText.includes('upgrade') || allText.includes('downgrade') || allText.includes('price target') || allText.includes('analyst')) {
    return 'ANALYST';
  }
  if (allText.includes('fed') || allText.includes('fomc') || allText.includes('interest rate') || allText.includes('inflation')) {
    return 'MACRO';
  }
  if (allText.includes('layoff') || allText.includes('restructur') || allText.includes('cost cut')) {
    return 'RESTRUCTURING';
  }
  if (allText.includes('ipo') || allText.includes('offering') || allText.includes('public')) {
    return 'IPO';
  }
  
  return 'NEWS';
}

// Calculate sentiment per ticker
function calculateTickerSentiments(
  articles: NewsArticle[], 
  tickers: string[]
): TickerSentiment[] {
  const tickerMap = new Map<string, {
    scores: number[];
    articleCount: number;
    bullishCount: number;
    bearishCount: number;
    neutralCount: number;
    latestArticle: NewsArticle | null;
  }>();

  // Initialize all tickers
  tickers.forEach(ticker => {
    tickerMap.set(ticker, {
      scores: [],
      articleCount: 0,
      bullishCount: 0,
      bearishCount: 0,
      neutralCount: 0,
      latestArticle: null,
    });
  });

  // Aggregate sentiment from articles
  articles.forEach(article => {
    (article.tickers || []).forEach(ticker => {
      const existing = tickerMap.get(ticker);
      if (existing) {
        existing.scores.push(article.sentiment);
        existing.articleCount += 1;
        
        if (article.sentimentLabel === 'BULLISH') existing.bullishCount += 1;
        else if (article.sentimentLabel === 'BEARISH') existing.bearishCount += 1;
        else existing.neutralCount += 1;
        
        if (!existing.latestArticle || 
            new Date(article.publishedUtc) > new Date(existing.latestArticle.publishedUtc)) {
          existing.latestArticle = article;
        }
        
        tickerMap.set(ticker, existing);
      }
    });
  });

  // Convert to array with calculated averages
  const sentiments: TickerSentiment[] = [];
  
  tickerMap.forEach((data, ticker) => {
    const avgScore = data.scores.length > 0 
      ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length 
      : 0;
    
    let label: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
    if (avgScore > 0.15) label = 'BULLISH';
    else if (avgScore < -0.15) label = 'BEARISH';
    
    sentiments.push({
      ticker,
      sentimentScore: Math.round(avgScore * 100) / 100,
      sentimentLabel: label,
      articleCount: data.articleCount,
      bullishCount: data.bullishCount,
      bearishCount: data.bearishCount,
      neutralCount: data.neutralCount,
      latestHeadline: data.latestArticle?.title || data.latestArticle?.headline || null,
    });
  });

  // Sort by article count (most coverage first)
  return sentiments.sort((a, b) => b.articleCount - a.articleCount);
}

// Calculate overall market mood
function calculateMarketMood(
  articles: NewsArticle[],
  tickerSentiments: TickerSentiment[]
): MarketMood {
  // Get market ticker sentiments
  const spySentiment = tickerSentiments.find(t => t.ticker === 'SPY');
  const qqqSentiment = tickerSentiments.find(t => t.ticker === 'QQQ');
  const vixSentiment = tickerSentiments.find(t => t.ticker === 'VIX');

  // Calculate overall sentiment from all articles
  const allScores = articles.map(a => a.sentiment);
  const avgScore = allScores.length > 0 
    ? allScores.reduce((a, b) => a + b, 0) / allScores.length 
    : 0;

  // Weight market tickers more heavily
  const marketScore = (
    (spySentiment?.sentimentScore || 0) * 0.35 +
    (qqqSentiment?.sentimentScore || 0) * 0.35 +
    // VIX sentiment is inverted (high VIX = bearish)
    -(vixSentiment?.sentimentScore || 0) * 0.1 +
    avgScore * 0.2
  );

  let overall: 'RISK_ON' | 'RISK_OFF' | 'NEUTRAL' = 'NEUTRAL';
  if (marketScore > 0.1) overall = 'RISK_ON';
  else if (marketScore < -0.1) overall = 'RISK_OFF';

  // Count sentiment distribution
  const bullishCount = articles.filter(a => a.sentimentLabel === 'BULLISH').length;
  const bearishCount = articles.filter(a => a.sentimentLabel === 'BEARISH').length;
  const neutralCount = articles.filter(a => a.sentimentLabel === 'NEUTRAL').length;

  // Find top movers (tickers with strongest sentiment and coverage)
  const topBullish = tickerSentiments
    .filter(t => t.sentimentLabel === 'BULLISH' && t.articleCount >= 2)
    .sort((a, b) => b.sentimentScore - a.sentimentScore)
    .slice(0, 3)
    .map(t => t.ticker);

  const topBearish = tickerSentiments
    .filter(t => t.sentimentLabel === 'BEARISH' && t.articleCount >= 2)
    .sort((a, b) => a.sentimentScore - b.sentimentScore)
    .slice(0, 3)
    .map(t => t.ticker);

  return {
    overall,
    score: Math.round(marketScore * 100) / 100,
    spySentiment: spySentiment?.sentimentScore || 0,
    qqqSentiment: qqqSentiment?.sentimentScore || 0,
    vixMentions: vixSentiment?.articleCount || 0,
    distribution: {
      bullish: bullishCount,
      bearish: bearishCount,
      neutral: neutralCount,
    },
    topBullish,
    topBearish,
    totalArticles: articles.length,
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers'); // Comma-separated watchlist tickers
    const ticker = searchParams.get('ticker'); // Single ticker (legacy support)
    const limit = parseInt(searchParams.get('limit') || '50');
    const severity = searchParams.get('severity'); // CRISIS, ELEVATED, or null for all
    const publishedGte = searchParams.get('published_utc.gte'); // Optional date filter

    if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
      console.warn('POLYGON_API_KEY is not configured properly');
      return NextResponse.json(
        { success: false, error: 'News API is not configured' },
        { status: 500 }
      );
    }

    // Combine watchlist tickers with market tickers (deduplicated)
    let tickers: string[] = [...MARKET_TICKERS];
    
    if (tickersParam && tickersParam.trim()) {
      const watchlistTickers = tickersParam.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
      tickers = [...new Set([...MARKET_TICKERS, ...watchlistTickers])];
    } else if (ticker) {
      // Legacy support for single ticker param
      tickers = [...new Set([...MARKET_TICKERS, ticker.toUpperCase()])];
    }
    // If no tickers param provided, use just MARKET_TICKERS (SPY, QQQ, VIX)

    console.log('=== NEWS API START ===');
    console.log('Fetching news for tickers:', tickers);

    // Fetch news from Massive.com Benzinga endpoint
    // Documentation: https://massive.com/docs/rest/partners/benzinga/news
    const url = new URL(`${MASSIVE_BASE_URL}/benzinga/v2/news`);
    
    // Use tickers.any_of for multiple tickers (comma-separated)
    if (tickers.length > 0) {
      url.searchParams.set('tickers.any_of', tickers.join(','));
    }
    
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort', 'published.desc'); // Sort by published date descending
    
    if (publishedGte) {
      url.searchParams.set('published.gte', publishedGte);
    }
    
    // Add API key as Bearer token header (Massive.com uses Polygon API key)
    const headers: HeadersInit = {
      'Authorization': `Bearer ${POLYGON_API_KEY}`,
    };
    
    console.log('[News API] Massive.com Benzinga URL:', url.toString());
    
    const response = await fetch(url.toString(), {
      headers,
      next: { revalidate: 30 }, // Cache for 30 seconds
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('[News API] Massive.com Benzinga API error:', response.status, errorText);
      throw new Error(`Benzinga API error: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('[News API] Benzinga response:', { 
      resultsCount: data.results?.length || 0,
      hasResults: !!data.results,
      isArray: Array.isArray(data.results),
      status: data.status
    });
    
    if (!data.results || !Array.isArray(data.results)) {
      console.error('[News API] Unexpected Benzinga API response format:', data);
      return NextResponse.json({
        success: true,
        data: {
          articles: [],
          tickerSentiments: [],
          marketMood: {
            overall: 'NEUTRAL',
            score: 0,
            spySentiment: 0,
            qqqSentiment: 0,
            vixMentions: 0,
            distribution: { bullish: 0, bearish: 0, neutral: 0 },
            topBullish: [],
            topBearish: [],
            totalArticles: 0,
          },
          stats: { total: 0, crisis: 0, elevated: 0, normal: 0 },
          meta: { timestamp: new Date().toISOString(), nextUrl: null },
        },
      });
    }

    console.log(`Fetched ${data.results.length} articles`);

    // Process articles with sentiment analysis
    // Benzinga API response format: https://massive.com/docs/rest/partners/benzinga/news
    const processedArticles: NewsArticle[] = data.results.map((article: any) => {
      // Benzinga API uses: title, teaser (summary), body (full text), tickers, author, published, url, images, channels, tags
      const combinedText = `${article.title || ''} ${article.teaser || ''} ${article.body || ''}`;
      const articleSeverity = classifySeverity(combinedText);
      const sentiment = analyzeArticleSentiment(article.title || '', article.teaser || article.body || '');
      
      // Use first image if available
      const imageUrl = article.images && article.images.length > 0 ? article.images[0] : null;
      
      return {
        id: article.benzinga_id?.toString() || article.id || `news-${Date.now()}-${Math.random()}`,
        title: article.title || 'No headline',
        description: article.teaser || article.body || '',
        articleUrl: article.url || null,
        imageUrl: imageUrl,
        publishedUtc: article.published || new Date().toISOString(),
        tickers: article.tickers || [],
        author: article.author || 'Unknown',
        publisher: {
          name: 'Benzinga',
          logoUrl: undefined,
        },
        keywords: article.tags || article.channels || [],
        // Sentiment analysis
        sentiment: sentiment.score,
        sentimentLabel: sentiment.label,
        sentimentKeywords: sentiment.keywords,
        impactScore: calculateImpactScore(article),
        eventType: detectEventType(article.title || '', article.tags || article.channels || []),
        // Legacy fields for backward compatibility
        headline: article.title || 'No headline',
        summary: article.teaser || article.body || '',
        source: 'Benzinga',
        url: article.url || null,
        severity: articleSeverity,
        publishedAt: article.published || new Date().toISOString(),
      };
    });

    // Calculate sentiment per ticker
    const tickerSentiments = calculateTickerSentiments(processedArticles, tickers);

    // Calculate market mood (aggregate of SPY, QQQ, VIX sentiment + overall)
    const marketMood = calculateMarketMood(processedArticles, tickerSentiments);

    // Categorize articles by sentiment level (for legacy stats)
    const crisisArticles = processedArticles.filter(a => a.severity === 'CRISIS' || a.impactScore >= 4);
    const elevatedArticles = processedArticles.filter(a => 
      a.severity === 'ELEVATED' || 
      (a.sentiment < -0.1 && a.sentiment >= -0.3) || 
      (a.sentiment > 0.3) || 
      a.impactScore >= 3
    );

    // Filter by severity if requested (legacy support)
    const filteredArticles = severity 
      ? processedArticles.filter((a: any) => a.severity === severity)
      : processedArticles;

    console.log(`=== NEWS RESULTS ===`);
    console.log(`Total: ${processedArticles.length}, Crisis: ${crisisArticles.length}, Elevated: ${elevatedArticles.length}`);
    console.log(`Market Mood: ${marketMood.overall}`);

    return NextResponse.json({
      success: true,
      data: {
        articles: filteredArticles,
        tickerSentiments,
        marketMood,
        stats: {
          total: processedArticles.length,
          crisis: crisisArticles.length,
          elevated: elevatedArticles.length,
          normal: processedArticles.length - crisisArticles.length - elevatedArticles.length,
        },
        meta: {
          timestamp: new Date().toISOString(),
          nextUrl: data.next_url || null,
        },
      },
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
      },
    });

  } catch (error: any) {
    console.error('News API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
