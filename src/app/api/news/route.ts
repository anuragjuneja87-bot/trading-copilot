import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const ticker = searchParams.get('ticker');
    const limit = searchParams.get('limit') || '50';
    const severity = searchParams.get('severity'); // CRISIS, ELEVATED, or null for all
    const publishedGte = searchParams.get('published_utc.gte'); // Optional date filter

    if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
      console.warn('POLYGON_API_KEY is not configured properly');
      return NextResponse.json(
        { success: false, error: 'News API is not configured' },
        { status: 500 }
      );
    }

    const url = new URL('https://api.polygon.io/v2/reference/news');
    url.searchParams.set('limit', limit);
    url.searchParams.set('order', 'desc');
    url.searchParams.set('sort', 'published_utc');
    url.searchParams.set('apiKey', POLYGON_API_KEY);
    
    if (ticker) {
      url.searchParams.set('ticker', ticker);
    }
    
    if (publishedGte) {
      url.searchParams.set('published_utc.gte', publishedGte);
    }
    
    const response = await fetch(url.toString(), {
      next: { revalidate: 30 }, // Cache for 30 seconds
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Polygon News API error:', response.status, errorText);
      throw new Error(`Polygon API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      console.error('Unexpected Polygon API response format:', data);
      return NextResponse.json({
        success: true,
        data: {
          articles: [],
          stats: { total: 0, crisis: 0, elevated: 0, normal: 0 },
          meta: { timestamp: new Date().toISOString(), nextUrl: null },
        },
      });
    }
    
    // Process articles with severity classification
    const articles = data.results.map((article: any) => {
      const combinedText = `${article.title || ''} ${article.description || ''}`;
      const articleSeverity = classifySeverity(combinedText);
      
      return {
        id: article.id,
        headline: article.title || 'No headline',
        summary: article.description || '',
        author: article.author || 'Unknown',
        source: article.publisher?.name || 'Benzinga',
        url: article.article_url || null,
        imageUrl: article.image_url || null,
        tickers: article.tickers || [],
        keywords: article.keywords || [],
        severity: articleSeverity,
        publishedAt: article.published_utc || new Date().toISOString(),
      };
    });
    
    // Filter by severity if requested
    const filteredArticles = severity 
      ? articles.filter((a: any) => a.severity === severity)
      : articles;
    
    // Calculate stats
    const crisisCount = articles.filter((a: any) => a.severity === 'CRISIS').length;
    const elevatedCount = articles.filter((a: any) => a.severity === 'ELEVATED').length;
    
    return NextResponse.json({
      success: true,
      data: {
        articles: filteredArticles,
        stats: {
          total: articles.length,
          crisis: crisisCount,
          elevated: elevatedCount,
          normal: articles.length - crisisCount - elevatedCount,
        },
        meta: {
          timestamp: new Date().toISOString(),
          nextUrl: data.next_url || null,
        }
      }
    });
    
  } catch (error: any) {
    console.error('News API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
