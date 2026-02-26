import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { NextRequest } from 'next/server';

/* ════════════════════════════════════════════════════════════════
   AUTH HELPER — Unified user resolution for API routes
   
   Usage in any API route:
     const user = await getUser();
     if (!user) return unauthorized();
   
   During development / transition period:
     - If NextAuth session exists → use that
     - If x-user-id header present → use that (dev mode only)
     - Otherwise → null (unauthorized)
   
   After auth is fully wired, remove the dev fallback.
   ════════════════════════════════════════════════════════════════ */

interface AuthUser {
  id: string;
  email?: string | null;
  name?: string | null;
}

export async function getUser(request?: NextRequest): Promise<AuthUser | null> {
  // 1. Try NextAuth session (production path)
  try {
    const session = await getServerSession(authOptions);
    if (session?.user && (session.user as any).id) {
      return {
        id: (session.user as any).id,
        email: session.user.email,
        name: session.user.name,
      };
    }
  } catch {
    // Session not available (e.g., during cron calls)
  }

  // 2. Dev fallback: x-user-id header (remove in production)
  if (process.env.NODE_ENV === 'development' && request) {
    const devUserId = request.headers.get('x-user-id');
    if (devUserId) {
      return { id: devUserId };
    }
  }

  return null;
}

// NextAuth type augmentation (Session.user.id) lives in src/types/next-auth.d.ts
