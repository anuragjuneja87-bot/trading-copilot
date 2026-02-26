import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getUser } from '@/lib/auth-helper';

/* ════════════════════════════════════════════════════════════════
   GET /api/user/preferences
   → Returns all user preferences
   
   PUT /api/user/preferences
   → Partial update: { compactMode: true, soundEnabled: false }
   
   Replaces ALL localStorage preference stores:
   - trading-copilot-preferences (compactMode, tooltips, timeframe, sound)
   - chat_analysis_depth
   - chat_pinned_insights
   ════════════════════════════════════════════════════════════════ */

const VALID_TIMEFRAMES = ['1D', '1W', '1M', '3M'];
const VALID_DEPTHS = ['quick', 'standard', 'deep'];

export async function GET(request: NextRequest) {
  const user = await getUser(request);
  if (!user) {
    // Anonymous defaults
    return NextResponse.json({
      compactMode: false,
      showTooltips: true,
      defaultTimeframe: '1D',
      soundEnabled: false,
      alertsEnabled: true,
      analysisDepth: 'standard',
      pinnedInsights: [],
      source: 'default',
    });
  }

  try {
    const prefs = await prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    return NextResponse.json({
      compactMode: prefs.compactMode,
      showTooltips: prefs.showTooltips,
      defaultTimeframe: prefs.defaultTimeframe,
      soundEnabled: prefs.soundEnabled,
      alertsEnabled: prefs.alertsEnabled,
      analysisDepth: prefs.analysisDepth,
      pinnedInsights: prefs.pinnedInsights,
      source: 'db',
    });
  } catch (e: any) {
    console.error('[preferences] GET error:', e.message);
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

    if (typeof body.compactMode === 'boolean') updates.compactMode = body.compactMode;
    if (typeof body.showTooltips === 'boolean') updates.showTooltips = body.showTooltips;
    if (typeof body.soundEnabled === 'boolean') updates.soundEnabled = body.soundEnabled;
    if (typeof body.alertsEnabled === 'boolean') updates.alertsEnabled = body.alertsEnabled;

    if (body.defaultTimeframe && VALID_TIMEFRAMES.includes(body.defaultTimeframe)) {
      updates.defaultTimeframe = body.defaultTimeframe;
    }

    if (body.analysisDepth && VALID_DEPTHS.includes(body.analysisDepth)) {
      updates.analysisDepth = body.analysisDepth;
    }

    if (body.pinnedInsights && Array.isArray(body.pinnedInsights)) {
      // Validate structure: max 20 pins, each has ticker + insight
      const valid = body.pinnedInsights
        .filter((p: any) => p.ticker && p.insight)
        .slice(0, 20);
      updates.pinnedInsights = valid;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields' }, { status: 400 });
    }

    await prisma.userPreferences.upsert({
      where: { userId: user.id },
      create: { userId: user.id, ...updates },
      update: updates,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('[preferences] PUT error:', e.message);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
