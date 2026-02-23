import { NextRequest, NextResponse } from 'next/server';
import { validateTicker, validateTickers, validateInt } from '@/lib/security';
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

// Enhanced sentiment analysis - returns 'positive' | 'negative' | 'neutral'
function parseSentiment(article: any): 'positive' | 'negative' | 'neutral' {
  // First, check if Polygon provides sentiment (some plans include it)
  if (article.insights?.sentiment) {
    const s = article.insights.sentiment.toLowerCase();
    if (s === 'positive' || s === 'bullish') return 'positive';
    if (s === 'negative' || s === 'bearish') return 'negative';
    return 'neutral';
  }
  
  // Fallback: keyword analysis
  const title = article.title || '';
  const description = article.description || article.teaser || article.body || '';
  const text = `${title} ${description}`.toLowerCase();
  
  const bullishWords = [
    'surge', 'soar', 'jump', 'rally', 'gain', 'rise', 'climb', 'up',
    'beat', 'exceed', 'outperform', 'upgrade', 'buy', 'bullish', 
    'record high', 'all-time high', 'growth', 'profit', 'boom',
    'breakout', 'momentum', 'strong', 'robust', 'optimistic', 'positive'
  ];
  
  const bearishWords = [
    'fall', 'drop', 'plunge', 'crash', 'decline', 'tumble', 'sink', 'down',
    'miss', 'disappoint', 'downgrade', 'sell', 'bearish',
    'record low', 'loss', 'weak', 'concern', 'fear', 'risk', 'warning',
    'selloff', 'correction', 'recession', 'layoff', 'cut', 'negative',
    'slump', 'plummet', 'tank', 'struggle'
  ];
  
  let bullScore = 0;
  let bearScore = 0;
  
  bullishWords.forEach(word => {
    if (text.includes(word)) bullScore++;
  });
  
  bearishWords.forEach(word => {
    if (text.includes(word)) bearScore++;
  });
  
  // Need clear signal (at least 2 point difference)
  if (bullScore >= bearScore + 2) return 'positive';
  if (bearScore >= bullScore + 2) return 'negative';
  return 'neutral';
}

// Keyword-based sentiment analysis (legacy support)
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
        { success: false, error: 'News service not configured' },
        { status: 500 }
      );
    }

    // Combine watchlist tickers with market tickers (deduplicated)
    let tickers: string[] = [...MARKET_TICKERS];
    
    if (tickersParam && tickersParam.trim()) {
      const watchlistTickers = validateTickers(tickersParam, 20);
      tickers = [...new Set([...MARKET_TICKERS, ...watchlistTickers])];
    } else if (ticker) {
      const validTicker = validateTicker(ticker);
      if (validTicker) tickers = [...new Set([...MARKET_TICKERS, validTicker])];
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
    
    let rawArticles: any[] = [];
    let data: any;
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      console.warn('[News API] Massive.com Benzinga API failed:', response.status, errorText);
      // Fallback to Polygon native news endpoint
      const polygonUrl = tickers.length > 0
        ? `https://api.polygon.io/v2/reference/news?ticker=${tickers[0]}&limit=${limit}&order=desc&apiKey=${POLYGON_API_KEY}`
        : `https://api.polygon.io/v2/reference/news?limit=${limit}&order=desc&apiKey=${POLYGON_API_KEY}`;
      
      console.log('[News API] Falling back to Polygon native endpoint:', polygonUrl.replace(POLYGON_API_KEY!, '***'));
      try {
        const polygonRes = await fetch(polygonUrl, { signal: AbortSignal.timeout(10000) });
        
        if (polygonRes.ok) {
          const polygonData = await polygonRes.json();
          rawArticles = polygonData.results || [];
          console.log('[News API] Polygon fallback returned:', rawArticles.length, 'articles');
        } else {
          const polygonError = await polygonRes.text().catch(() => '');
          console.error('[News API] Polygon fallback also failed:', polygonRes.status, polygonError);
          rawArticles = [];
        }
      } catch (polygonErr) {
        console.error('[News API] Polygon fallback error:', polygonErr);
        rawArticles = [];
      }
    } else {
      data = await response.json();
      rawArticles = data.results || [];
      console.log('[News API] Benzinga response:', { 
        resultsCount: rawArticles.length,
        hasResults: !!rawArticles,
        isArray: Array.isArray(rawArticles),
      });
    }
    
    if (!rawArticles || !Array.isArray(rawArticles) || rawArticles.length === 0) {
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

    console.log(`Fetched ${rawArticles.length} articles`);

    // Process articles with sentiment analysis
      // Handle both Benzinga and Polygon formats
      const processedArticles: NewsArticle[] = rawArticles.map((article: any) => {
      // Handle both Benzinga and Polygon formats
      const articleId = article.benzinga_id?.toString() || article.id || `news-${Date.now()}-${Math.random()}`;
      const articleTitle = article.title || 'No headline';
      const articleDescription = article.teaser || article.body || article.description || '';
      const articleUrl = article.url || article.article_url || null;
      const articleImageUrl = (article.images && article.images.length > 0 ? article.images[0] : null) || article.image_url || null;
      const articlePublished = article.published || article.published_utc || new Date().toISOString();
      const articleTickers = article.tickers || [];
      const articleAuthor = article.author || null;
      
      // Parse source properly - Polygon provides publisher object
      // PRIORITY: publisher.name > publisher.title > domain from homepage_url > domain from article_url > "Market News"
      let articlePublisher = article.publisher?.name || article.publisher?.title;
      
      if (!articlePublisher && article.publisher?.homepage_url) {
        // Extract domain name from URL
        try {
          const url = new URL(article.publisher.homepage_url);
          const domain = url.hostname
            .replace('www.', '')
            .split('.')[0]; // Get first part of domain (e.g., "benzinga" from "benzinga.com")
          articlePublisher = domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch {
          // If URL parsing fails, try simple string extraction
          const url = article.publisher.homepage_url
            .replace('https://', '')
            .replace('http://', '')
            .replace('www.', '')
            .split('/')[0]
            .split('.')[0];
          articlePublisher = url.charAt(0).toUpperCase() + url.slice(1);
        }
      }
      
      // Fallback: extract from article URL
      if (!articlePublisher && article.article_url) {
        try {
          const url = new URL(article.article_url);
          const domain = url.hostname
            .replace('www.', '')
            .split('.')[0];
          articlePublisher = domain.charAt(0).toUpperCase() + domain.slice(1);
        } catch {
          // Ignore if URL parsing fails
        }
      }
      
      // DO NOT use author as source - keep it separate
      if (!articlePublisher) {
        articlePublisher = 'Market News';
      }
      
      // Capitalize first letter
      articlePublisher = articlePublisher.charAt(0).toUpperCase() + articlePublisher.slice(1);
      
      // Debug logging
      if (articlePublisher === 'Market News' && article.publisher) {
        console.log('[News API] Could not extract publisher name:', {
          publisher: article.publisher,
          homepage_url: article.publisher.homepage_url,
          article_url: article.article_url,
        });
      }
      
      const articleKeywords = article.tags || article.channels || article.keywords || [];
      
      // Benzinga API uses: title, teaser (summary), body (full text), tickers, author, published, url, images, channels, tags
      const combinedText = `${articleTitle} ${articleDescription}`;
      const articleSeverity = classifySeverity(combinedText);
      const sentiment = analyzeArticleSentiment(articleTitle, articleDescription);
      
      // Use enhanced sentiment parsing
      const sentimentValue = parseSentiment(article);
      
      return {
        id: articleId,
        title: articleTitle,
        description: articleDescription,
        articleUrl: articleUrl,
        imageUrl: articleImageUrl,
        publishedUtc: articlePublished,
        tickers: articleTickers,
        author: articleAuthor || 'Market News',
        publisher: {
          name: articlePublisher,
          logoUrl: article.publisher?.logo_url || undefined,
        },
        keywords: articleKeywords,
        // Sentiment analysis - use enhanced parsing
        sentiment: sentiment.score,
        sentimentLabel: sentiment.label,
        sentimentKeywords: sentiment.keywords,
        // Add sentiment field for frontend (positive/negative/neutral)
        sentimentValue: sentimentValue,
        impactScore: calculateImpactScore(article),
        eventType: detectEventType(articleTitle, articleKeywords),
        // Legacy fields for backward compatibility
        headline: articleTitle,
        summary: articleDescription,
        source: articlePublisher,
        url: articleUrl,
        severity: articleSeverity,
        publishedAt: articlePublished,
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
          nextUrl: data?.next_url || null,
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
      { success: false, error: 'An error occurred' },
      { status: 500 }
    );
  }
}
