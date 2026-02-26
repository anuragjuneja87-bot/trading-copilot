import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth-helper';

/* ════════════════════════════════════════════════════════════════
   GET /api/alerts?since={iso}&limit={n}
   
   Client polls this every 15-30 seconds.
   Returns alerts created after `since` timestamp.
   ZERO computation — just an indexed DB read.
   
   Response: { alerts[], unreadCount, serverTime }
   ════════════════════════════════════════════════════════════════ */

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ alerts: [], unreadCount: 0, serverTime: new Date().toISOString() });
  }

  const { searchParams } = new URL(request.url);
  const since = searchParams.get('since');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  try {
    const now = new Date();

    const [alerts, unreadCount] = await Promise.all([
      prisma.alert.findMany({
        where: {
          userId: user.id,
          dismissed: false,
          expiresAt: { gt: now },
          ...(since ? { createdAt: { gt: new Date(since) } } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          ticker: true,
          type: true,
          tier: true,
          title: true,
          summary: true,
          bias: true,
          confidence: true,
          price: true,
          target1: true,
          stopPrice: true,
          signalsJson: true,
          read: true,
          createdAt: true,
        },
      }),

      prisma.alert.count({
        where: {
          userId: user.id,
          read: false,
          dismissed: false,
          expiresAt: { gt: now },
        },
      }),
    ]);

    return NextResponse.json({
      alerts,
      unreadCount,
      serverTime: now.toISOString(),
    });
  } catch (e: any) {
    console.error('[alerts] GET error:', e.message);
    return NextResponse.json({ alerts: [], unreadCount: 0, serverTime: new Date().toISOString() });
  }
}
