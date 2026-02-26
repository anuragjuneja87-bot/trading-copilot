/**
 * middleware.ts — Centralized security layer for TradeYodha
 *
 * Protects all /api routes with:
 *  1. Origin validation (blocks cross-origin API calls)
 *  2. API secret for server-to-server / script access
 *  3. IP-based rate limiting
 *  4. Security headers on all responses
 *
 * How it works:
 *  - Browser requests from tradeyodha.com → pass (origin matches)
 *  - curl/scripts with x-api-secret header → pass
 *  - Everything else → 401
 *
 * Env vars:
 *   TRADEYODHA_API_SECRET — Secret for non-browser access (openssl rand -hex 32)
 *   NEXT_PUBLIC_APP_URL   — Your site URL (https://tradeyodha.com)
 */

import { NextResponse, type NextRequest } from 'next/server';

// ─── Config ──────────────────────────────────────────────────────────

const API_SECRET = process.env.TRADEYODHA_API_SECRET;

// Allowed origins (your domains)
const ALLOWED_ORIGINS = new Set([
  'https://tradeyodha.com',
  'https://www.tradeyodha.com',
  // Vercel preview deployments
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  // Local development
  ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000'] : []),
]);

// Rate limit: max requests per IP per minute
const RATE_LIMIT_MAX: Record<string, number> = {
  ai: 10,       // AI routes (expensive Databricks calls)
  ml: 20,       // ML prediction
  data: 60,     // Market data routes (Polygon)
  default: 30,  // Everything else
};

const RATE_LIMIT_WINDOW_MS = 60_000;

// In-memory store (resets on cold start — fine for Vercel serverless)
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// ─── Helpers ─────────────────────────────────────────────────────────

function getClientIP(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function getRouteCategory(pathname: string): string {
  if (pathname.startsWith('/api/ai/')) return 'ai';
  if (pathname.startsWith('/api/ml/')) return 'ml';
  if (
    pathname.startsWith('/api/market/') ||
    pathname.startsWith('/api/flow/') ||
    pathname.startsWith('/api/darkpool') ||
    pathname.startsWith('/api/news') ||
    pathname.startsWith('/api/levels') ||
    pathname.startsWith('/api/market-pulse') ||
    pathname.startsWith('/api/premarket') ||
    pathname.startsWith('/api/overnight') ||
    pathname.startsWith('/api/economic')
  ) return 'data';
  return 'default';
}

function checkRateLimit(ip: string, category: string): {
  allowed: boolean;
  remaining: number;
  resetIn: number;
} {
  const key = `${ip}:${category}`;
  const now = Date.now();
  const limit = RATE_LIMIT_MAX[category] || RATE_LIMIT_MAX.default;

  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: limit - 1, resetIn: RATE_LIMIT_WINDOW_MS };
  }

  entry.count++;

  if (entry.count > limit) {
    return { allowed: false, remaining: 0, resetIn: entry.resetAt - now };
  }

  return { allowed: true, remaining: limit - entry.count, resetIn: entry.resetAt - now };
}

// Cleanup stale entries every ~200 requests
let requestCount = 0;
function maybeCleanup() {
  requestCount++;
  if (requestCount % 200 === 0) {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore) {
      if (now > entry.resetAt + 120_000) rateLimitStore.delete(key);
    }
  }
}

// ─── Security Headers ────────────────────────────────────────────────

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return response;
}

// ─── Middleware ───────────────────────────────────────────────────────

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Non-API routes: just add security headers
  if (!pathname.startsWith('/api')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Health check: always allow
  if (pathname === '/api/health') {
    return addSecurityHeaders(NextResponse.next());
  }

  // ML predict GET diagnostics: allow with API secret only
  if (pathname === '/api/ml/predict' && request.method === 'GET') {
    if (API_SECRET && request.headers.get('x-api-secret') === API_SECRET) {
      return addSecurityHeaders(NextResponse.next());
    }
    return addSecurityHeaders(
      NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    );
  }

  // Allow NextAuth routes through (OAuth callbacks come from Google)
  if (pathname.startsWith('/api/auth/')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Allow user API routes (authenticated via session)
  if (pathname.startsWith('/api/user/')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Allow alert API routes
  if (pathname.startsWith('/api/alerts')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Allow cron routes (Vercel Cron / external schedulers)
  if (pathname.startsWith('/api/cron/')) {
    return addSecurityHeaders(NextResponse.next());
  }

  // ── Authentication: Origin check OR API secret ──
  const origin = request.headers.get('origin');
  const referer = request.headers.get('referer');
  const apiSecret = request.headers.get('x-api-secret');

  // Check 1: Valid origin header (browser requests from our domain)
  const originAllowed = origin && ALLOWED_ORIGINS.has(origin);

  // Check 2: Valid referer (some browsers don't send origin on same-origin)
  const refererAllowed = referer && [...ALLOWED_ORIGINS].some(o => referer.startsWith(o));

  // Check 3: API secret (for scripts, cron jobs, testing)
  const secretAllowed = API_SECRET && apiSecret === API_SECRET;

  if (!originAllowed && !refererAllowed && !secretAllowed) {
    // In development, allow all requests
    if (process.env.NODE_ENV === 'development') {
      // Allow but log
    } else {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      );
    }
  }

  // ── Rate Limiting ──
  const ip = getClientIP(request);
  const category = getRouteCategory(pathname);
  const rateLimit = checkRateLimit(ip, category);
  maybeCleanup();

  if (!rateLimit.allowed) {
    const response = NextResponse.json(
      { error: 'Rate limit exceeded. Try again shortly.' },
      { status: 429 }
    );
    response.headers.set('Retry-After', String(Math.ceil(rateLimit.resetIn / 1000)));
    return addSecurityHeaders(response);
  }

  // ── Pass through ──
  const response = NextResponse.next();
  response.headers.set('X-RateLimit-Remaining', String(rateLimit.remaining));
  return addSecurityHeaders(response);
}

// ─── Matcher ─────────────────────────────────────────────────────────
export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico|tradeyodha-logo.svg|site.webmanifest).*)',
  ],
};
