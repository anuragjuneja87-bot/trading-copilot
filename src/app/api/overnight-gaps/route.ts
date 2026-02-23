import { NextRequest, NextResponse } from 'next/server';
import { validateTicker, validateTickers, validateInt } from '@/lib/security';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

// Popular tickers for movers (same as market-pulse)
const MOVERS_UNIVERSE = [
  'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA', 'AMD', 'INTC',
  'JPM', 'BAC', 'GS', 'BA', 'CAT', 'DIS', 'NFLX', 'CRM', 'ORCL', 'PYPL',
];

interface GapData {
  ticker: string;
  price: number;
  prevClose: number;
  gap: number;
  gapPercent: number;
  direction: 'up' | 'down';
  volume?: number;
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tickersParam = searchParams.get('tickers');
    const topMoversParam = searchParams.get('top_movers');
    const topMovers = topMoversParam ? parseInt(topMoversParam, 10) : 5;

    if (!POLYGON_API_KEY || POLYGON_API_KEY.includes('your_')) {
      return NextResponse.json(
        { success: false, error: 'Market data service not configured' },
        { status: 500 }
      );
    }

    // Parse watchlist tickers
    const watchlistTickers = tickersParam
      ? validateTickers(tickersParam, 10)
      : ['SPY', 'QQQ', 'NVDA'];

    // Fetch watchlist tickers
    const watchlistUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${watchlistTickers.join(',')}&apiKey=${POLYGON_API_KEY}`;
    const watchlistRes = await fetch(watchlistUrl, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(10000),
    });

    if (!watchlistRes.ok) {
      throw new Error(`Failed to fetch watchlist data: ${watchlistRes.status}`);
    }

    const watchlistData = await watchlistRes.json();
    const watchlistGaps: GapData[] = [];

    // Process watchlist tickers
    for (const item of watchlistData.tickers || []) {
      const lastTrade = item.lastTrade || {};
      const prevDay = item.prevDay || {};
      const day = item.day || {};

      const price = parseFloat(lastTrade.p) || 0;
      const prevClose = parseFloat(prevDay.c) || 0;

      if (price > 0 && prevClose > 0) {
        const gap = price - prevClose;
        const gapPercent = (gap / prevClose) * 100;

        watchlistGaps.push({
          ticker: item.ticker,
          price,
          prevClose,
          gap,
          gapPercent,
          direction: gap >= 0 ? 'up' : 'down',
          volume: parseInt(day.v) || 0,
        });
      }
    }

    // Fetch top movers from broader universe
    const moversUrl = `https://api.polygon.io/v2/snapshot/locale/us/markets/stocks/tickers?tickers=${MOVERS_UNIVERSE.join(',')}&apiKey=${POLYGON_API_KEY}`;
    const moversRes = await fetch(moversUrl, {
      next: { revalidate: 30 },
      signal: AbortSignal.timeout(10000),
    });

    const topMoversList: GapData[] = [];

    if (moversRes.ok) {
      const moversData = await moversRes.json();

      for (const item of moversData.tickers || []) {
        const lastTrade = item.lastTrade || {};
        const prevDay = item.prevDay || {};
        const day = item.day || {};

        const price = parseFloat(lastTrade.p) || 0;
        const prevClose = parseFloat(prevDay.c) || 0;

        if (price > 0 && prevClose > 0) {
          const gap = price - prevClose;
          const gapPercent = (gap / prevClose) * 100;

          topMoversList.push({
            ticker: item.ticker,
            price,
            prevClose,
            gap,
            gapPercent,
            direction: gap >= 0 ? 'up' : 'down',
            volume: parseInt(day.v) || 0,
          });
        }
      }
    }

    // Sort by absolute gap percent descending
    watchlistGaps.sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent));
    topMoversList.sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent));

    // Return top N movers
    const topMoversData = topMoversList.slice(0, topMovers);

    return NextResponse.json(
      {
        success: true,
        data: {
          watchlistGaps,
          topMovers: topMoversData,
        },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
        },
      }
    );
  } catch (error: any) {
    console.error('[Overnight Gaps API] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'An error occurred',
      },
      { status: 500 }
    );
  }
}
