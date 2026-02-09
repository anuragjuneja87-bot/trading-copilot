import { NextRequest, NextResponse } from 'next/server';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Crisis keywords that trigger regime change
const CRISIS_KEYWORDS = [
  'circuit breaker', 'trading halt', 'flash crash', 'bank run', 
  'fed emergency', 'nuclear', 'war declared', 'pandemic',
  'rate hike emergency', 'bank failure', 'default', 'collapse'
];

const ELEVATED_KEYWORDS = [
  'rate hike', 'rate cut', 'fed pivot', 'recession', 'tariff',
  'earnings miss', 'guidance cut', 'layoffs', 'cpi surprise',
  'jobs report', 'inflation', 'hawkish', 'dovish'
];

export async function GET(request: NextRequest) {
  try {
    // Get VIX proxy (VIXY) price
    const vixResponse = await fetch(
      `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=VIXY&apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 60 } }
    );
    
    let vixLevel = 20; // Default
    if (vixResponse.ok) {
      const vixData = await vixResponse.json();
      const vixyTicker = vixData.tickers?.[0];
      if (vixyTicker?.lastTrade?.p) {
        vixLevel = parseFloat(vixyTicker.lastTrade.p);
      }
    }

    // Get recent news for crisis detection
    // In production, this would query your news_stream Delta table
    // For now, we'll use a simplified check
    let crisisCount = 0;
    let elevatedCount = 0;
    let reason = '';

    // Fetch recent market news from Polygon
    const newsResponse = await fetch(
      `https://api.polygon.io/v2/reference/news?limit=20&apiKey=${POLYGON_API_KEY}`,
      { next: { revalidate: 120 } }
    );

    if (newsResponse.ok) {
      const newsData = await newsResponse.json();
      const articles = newsData.results || [];
      
      for (const article of articles) {
        const text = `${article.title || ''} ${article.description || ''}`.toLowerCase();
        
        for (const keyword of CRISIS_KEYWORDS) {
          if (text.includes(keyword)) {
            crisisCount++;
            if (!reason) reason = `Crisis keyword detected: "${keyword}"`;
            break;
          }
        }
        
        for (const keyword of ELEVATED_KEYWORDS) {
          if (text.includes(keyword)) {
            elevatedCount++;
            break;
          }
        }
      }
    }

    // Determine regime status
    let status: 'normal' | 'elevated' | 'crisis' = 'normal';
    
    if (crisisCount > 0) {
      status = 'crisis';
      reason = reason || 'Multiple crisis indicators detected';
    } else if (elevatedCount >= 3 || vixLevel > 30) {
      status = 'elevated';
      reason = vixLevel > 30 
        ? `VIX elevated at ${vixLevel.toFixed(1)}`
        : 'Multiple elevated indicators in news';
    } else {
      reason = 'Market conditions normal';
    }

    return NextResponse.json({
      success: true,
      data: {
        status,
        vixLevel,
        crisisCount,
        elevatedCount,
        reason,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
    
  } catch (error) {
    console.error('Regime API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
