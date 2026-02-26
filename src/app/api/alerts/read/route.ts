import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth-helper';

/* ════════════════════════════════════════════════════════════════
   POST /api/alerts/read
   
   Body:
     { action: "read",     id: "alert_123" }  — mark single read
     { action: "dismiss",  id: "alert_123" }  — mark dismissed
     { action: "read_all" }                   — mark all read
   ════════════════════════════════════════════════════════════════ */

export async function POST(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { id, action } = await request.json();

    if (action === 'read_all') {
      const result = await prisma.alert.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });
      return NextResponse.json({ updated: result.count });
    }

    if (!id || !['read', 'dismiss'].includes(action)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    // Verify user owns this alert
    const alert = await prisma.alert.findFirst({
      where: { id, userId: user.id },
    });
    if (!alert) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    await prisma.alert.update({
      where: { id },
      data: action === 'dismiss'
        ? { dismissed: true, read: true }
        : { read: true },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[alerts/read] error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
