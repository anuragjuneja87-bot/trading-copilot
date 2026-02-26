import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth-helper';

/* ════════════════════════════════════════════════════════════════
   GET /api/user/watchlist
   → Returns user's watchlist (sorted)
   
   PUT /api/user/watchlist
   → Full replacement: { watchlist: ["SPY","QQQ",...] }
   → Partial ops:
     { action: "add", ticker: "NVDA" }
     { action: "remove", ticker: "NVDA" }
     { action: "reorder", watchlist: ["NVDA","SPY",...] }
   
   The watchlist is THE source of truth for:
   - Which tickers appear in panels/charts
   - Which tickers the cron scans for alerts
   - Which tickers drive the signal engine
   ════════════════════════════════════════════════════════════════ */

const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'NVDA', 'META', 'AAPL', 'GOOG', 'TSLA', 'AMD'];
const MAX_WATCHLIST_FREE = 3;
const MAX_WATCHLIST_PRO = 20;

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    // Anonymous: return default watchlist (works before auth is wired)
    return NextResponse.json({ watchlist: DEFAULT_WATCHLIST, source: 'default' });
  }

  try {
    const items = await prisma.watchlistItem.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: 'asc' },
      select: { ticker: true },
    });

    // New user with empty watchlist? Return defaults
    const watchlist = items.length > 0
      ? items.map((i) => i.ticker)
      : DEFAULT_WATCHLIST;

    return NextResponse.json({ watchlist, source: 'db' });
  } catch (e: any) {
    console.error('[watchlist] GET error:', e.message);
    return NextResponse.json({ watchlist: DEFAULT_WATCHLIST, source: 'fallback' });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();

    // Get user tier for limit check
    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { tier: true },
    });
    const maxTickers = dbUser?.tier === 'FREE' ? MAX_WATCHLIST_FREE : MAX_WATCHLIST_PRO;

    // ── Partial operations ─────────────────────────────────
    if (body.action === 'add' && body.ticker) {
      const ticker = body.ticker.toUpperCase().trim();
      if (!/^[A-Z]{1,5}$/.test(ticker)) {
        return NextResponse.json({ error: 'Invalid ticker' }, { status: 400 });
      }

      // Check limit
      const count = await prisma.watchlistItem.count({ where: { userId: user.id } });
      if (count >= maxTickers) {
        return NextResponse.json({
          error: `Watchlist limit reached (${maxTickers}). Upgrade to add more.`,
          limit: maxTickers,
        }, { status: 403 });
      }

      await prisma.watchlistItem.upsert({
        where: { userId_ticker: { userId: user.id, ticker } },
        create: { userId: user.id, ticker, sortOrder: count },
        update: {}, // no-op if already exists
      });

      return NextResponse.json({ ok: true, action: 'added', ticker });
    }

    if (body.action === 'remove' && body.ticker) {
      const ticker = body.ticker.toUpperCase().trim();
      await prisma.watchlistItem.deleteMany({
        where: { userId: user.id, ticker },
      });
      return NextResponse.json({ ok: true, action: 'removed', ticker });
    }

    // ── Full replacement / reorder ─────────────────────────
    if (body.watchlist && Array.isArray(body.watchlist)) {
      const tickers: string[] = body.watchlist
        .map((t: string) => t.toUpperCase().trim())
        .filter((t: string) => /^[A-Z]{1,5}$/.test(t))
        .slice(0, maxTickers);

      const unique = [...new Set(tickers)];

      // Transaction: delete all + insert new (atomic)
      await prisma.$transaction([
        prisma.watchlistItem.deleteMany({ where: { userId: user.id } }),
        prisma.watchlistItem.createMany({
          data: unique.map((ticker, i) => ({
            userId: user.id,
            ticker,
            sortOrder: i,
          })),
        }),
      ]);

      return NextResponse.json({ ok: true, watchlist: unique });
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  } catch (e: any) {
    console.error('[watchlist] PUT error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
