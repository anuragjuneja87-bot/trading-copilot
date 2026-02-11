import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Tier limits
const TIER_LIMITS = {
  FREE: 10,
  PRO: 15,
  ELITE: 50,
};

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user as any;
    const sessionUserId = user.id as string;
    const sessionEmail = user.email as string | undefined;

    // Resolve user from DB:
    // 1) by id from session
    // 2) by email (handles case where DB user was recreated with new id)
    // 3) create if still missing
    let dbUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
    });

    if (!dbUser && sessionEmail) {
      dbUser = await prisma.user.findUnique({
        where: { email: sessionEmail },
      });
    }

    if (!dbUser) {
      try {
        dbUser = await prisma.user.create({
          data: {
            // Let Prisma generate id; don't force session id to avoid FK/consistency issues
            email: sessionEmail!,
            name: user.name ?? null,
          },
        });
      } catch (e) {
        console.error('Failed to create user for watchlist GET:', e);
        return NextResponse.json(
          { success: false, error: 'User account not found. Please sign out and sign in again.' },
          { status: 400 }
        );
      }
    }

    const effectiveUserId = dbUser.id;

    const watchlist = await prisma.watchlistItem.findMany({
      where: { userId: effectiveUserId },
      orderBy: { createdAt: 'desc' },
    });

    // Get current prices for watchlist items
    const tickers = watchlist.map((item) => item.ticker);
    
    let prices: any[] = [];
    if (tickers.length > 0) {
      try {
        const pricesRes = await fetch(
          `${request.nextUrl.origin}/api/market/prices?tickers=${tickers.join(',')}`,
          { next: { revalidate: 30 } }
        );
        if (pricesRes.ok) {
          const pricesData = await pricesRes.json();
          prices = pricesData.data?.prices || [];
        }
      } catch (error) {
        console.error('Error fetching prices:', error);
      }
    }

    // Combine watchlist with prices
    const watchlistWithPrices = watchlist.map((item) => {
      const priceData = prices.find((p) => p.ticker === item.ticker);
      return {
        id: item.id,
        ticker: item.ticker,
        price: priceData?.price || null,
        change: priceData?.change || null,
        changePercent: priceData?.changePercent || null,
        createdAt: item.createdAt,
      };
    });

    // Get user tier from existing user (created earlier if missing)
    const tierKey = (dbUser.tier || 'FREE') as keyof typeof TIER_LIMITS;
    const limit = TIER_LIMITS[tierKey] || TIER_LIMITS.FREE;

    return NextResponse.json({
      success: true,
      data: {
        watchlist: watchlistWithPrices,
        limit,
        count: watchlistWithPrices.length,
      },
    });
  } catch (error: any) {
    console.error('Watchlist API error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch watchlist' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user as any;
    const sessionUserId = user.id as string;
    const sessionEmail = user.email as string | undefined;

    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Ticker is required' },
        { status: 400 }
      );
    }

    // Validate ticker format
    const tickerUpper = ticker.trim().toUpperCase();
    if (!/^[A-Z]{1,5}$/.test(tickerUpper)) {
      return NextResponse.json(
        { success: false, error: 'Invalid ticker format. Must be 1-5 letters.' },
        { status: 400 }
      );
    }

    // Get user and check tier limit (ensure user exists; DB may have been reset)
    // Resolve by id, then email, then create if needed
    let dbUser = await prisma.user.findUnique({
      where: { id: sessionUserId },
    });

    if (!dbUser && sessionEmail) {
      dbUser = await prisma.user.findUnique({
        where: { email: sessionEmail },
      });
    }

    if (!dbUser) {
      try {
        dbUser = await prisma.user.create({
          data: {
            email: sessionEmail!,
            name: user.name ?? null,
          },
        });
      } catch (e) {
        console.error('Failed to create user for watchlist POST:', e);
        return NextResponse.json(
          { success: false, error: 'User account not found. Please sign out and sign in again.' },
          { status: 400 }
        );
      }
    }

    const effectiveUserId = dbUser.id;
    const tier = (dbUser.tier || 'FREE') as keyof typeof TIER_LIMITS;
    const limit = TIER_LIMITS[tier] || TIER_LIMITS.FREE;

    // Check current count
    const currentCount = await prisma.watchlistItem.count({
      where: { userId: effectiveUserId },
    });

    if (currentCount >= limit) {
      return NextResponse.json(
        {
          success: false,
          error: `Watchlist limit reached (${limit} tickers for ${tier} tier). Upgrade to add more.`,
        },
        { status: 400 }
      );
    }

    // Check if already exists
    const existing = await prisma.watchlistItem.findFirst({
      where: {
        userId: effectiveUserId,
        ticker: tickerUpper,
      },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: 'Ticker already in watchlist' },
        { status: 400 }
      );
    }

    // Add ticker
    await prisma.watchlistItem.create({
      data: {
        userId: effectiveUserId,
        ticker: tickerUpper,
      },
    });

    return NextResponse.json({
      success: true,
      data: { ticker: tickerUpper },
    });
  } catch (error: any) {
    console.error('Watchlist POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to add ticker' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const user = session.user as any;
    const userId = user.id;

    const body = await request.json();
    const { ticker } = body;

    if (!ticker || typeof ticker !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Ticker is required' },
        { status: 400 }
      );
    }

    const tickerUpper = ticker.trim().toUpperCase();

    // Delete ticker
    const deleted = await prisma.watchlistItem.deleteMany({
      where: {
        userId,
        ticker: tickerUpper,
      },
    });

    if (deleted.count === 0) {
      return NextResponse.json(
        { success: false, error: 'Ticker not found in watchlist' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { ticker: tickerUpper },
    });
  } catch (error: any) {
    console.error('Watchlist DELETE error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to remove ticker' },
      { status: 500 }
    );
  }
}
