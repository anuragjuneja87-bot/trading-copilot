import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { prisma } from '@/lib/prisma';

/* ════════════════════════════════════════════════════════════════
   POST /api/user/disclaimer
   
   Saves the timestamp when user accepts the risk disclaimer.
   GET returns whether user has accepted.
   ════════════════════════════════════════════════════════════════ */

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { accepted } = await req.json();
    if (!accepted) {
      return NextResponse.json({ error: 'Must accept disclaimer' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: { disclaimerAcceptedAt: new Date() },
    });

    return NextResponse.json({ ok: true, acceptedAt: new Date().toISOString() });
  } catch (error) {
    console.error('Disclaimer POST error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { disclaimerAcceptedAt: true },
    });

    return NextResponse.json({
      accepted: !!user?.disclaimerAcceptedAt,
      acceptedAt: user?.disclaimerAcceptedAt?.toISOString() || null,
    });
  } catch (error) {
    console.error('Disclaimer GET error:', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
