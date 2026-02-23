import { NextResponse } from 'next/server';

/**
 * GET /api/ws/token
 * 
 * Returns the Polygon/Massive WebSocket API key.
 * Protected by middleware (origin check + rate limit), so only
 * requests from tradeyodha.com can fetch this.
 * 
 * This replaces NEXT_PUBLIC_POLYGON_API_KEY which was baked into
 * the JS bundle and visible to anyone in browser DevTools.
 */
export async function GET() {
  const key = process.env.POLYGON_API_KEY || '';

  if (!key || key.includes('your_')) {
    return NextResponse.json(
      { error: 'WebSocket key not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json(
    { key },
    {
      headers: {
        // Short cache — key doesn't change often but don't cache forever
        'Cache-Control': 'private, max-age=300',
      },
    }
  );
}
