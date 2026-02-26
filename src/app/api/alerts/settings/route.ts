import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth-helper';

/* ════════════════════════════════════════════════════════════════
   GET  /api/alerts/settings — fetch alert preferences
   PUT  /api/alerts/settings — update alert preferences
   
   Separate from /api/user/preferences because alert config
   is a distinct domain (types, sensitivity, channels, schedule).
   ════════════════════════════════════════════════════════════════ */

const VALID_TYPES = [
  'confluence', 'thesis_flip', 'sweep_cluster', 'cvd_divergence',
  'dark_pool_large', 'flow_crossover', 'key_level',
  'rs_regime_change', 'news_catalyst',
];

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const settings = await prisma.alertSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    return NextResponse.json({
      enabledTypes: settings.enabledTypes,
      sensitivity: settings.sensitivity,
      marketHoursOnly: settings.marketHoursOnly,
      pushEnabled: settings.pushEnabled,
      smsEnabled: settings.smsEnabled,
      smsPhone: settings.smsPhone ? '•••' + settings.smsPhone.slice(-4) : null,
      discordConnected: !!settings.discordWebhook,
    });
  } catch (e: any) {
    console.error('[alerts/settings] GET error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const updates: Record<string, any> = {};

    if (Array.isArray(body.enabledTypes)) {
      updates.enabledTypes = body.enabledTypes.filter((t: string) => VALID_TYPES.includes(t));
    }
    if (['LOW', 'MEDIUM', 'HIGH'].includes(body.sensitivity)) {
      updates.sensitivity = body.sensitivity;
    }
    if (typeof body.marketHoursOnly === 'boolean') {
      updates.marketHoursOnly = body.marketHoursOnly;
    }
    if (typeof body.pushEnabled === 'boolean') updates.pushEnabled = body.pushEnabled;
    if (typeof body.smsEnabled === 'boolean') updates.smsEnabled = body.smsEnabled;
    if (body.smsPhone !== undefined) updates.smsPhone = body.smsPhone || null;
    if (body.discordWebhook !== undefined) updates.discordWebhook = body.discordWebhook || null;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    await prisma.alertSettings.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...updates },
      update: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[alerts/settings] PUT error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
