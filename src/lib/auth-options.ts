import { PrismaAdapter } from '@auth/prisma-adapter';
import type { NextAuthOptions } from 'next-auth';
import type { Adapter } from 'next-auth/adapters';
import GoogleProvider from 'next-auth/providers/google';
import { prisma } from '@/lib/prisma';

/* ════════════════════════════════════════════════════════════════
   NEXTAUTH CONFIGURATION
   
   Provider: Google OAuth (primary — most traders use Google)
   Adapter:  Prisma → Vercel Postgres
   Session:  JWT (no session table lookups on every request)
   
   Env vars needed:
     GOOGLE_CLIENT_ID
     GOOGLE_CLIENT_SECRET
     NEXTAUTH_SECRET        — openssl rand -base64 32
     NEXTAUTH_URL           — https://tradeyodha.com
   
   The session callback injects the user's DB id into the JWT
   so API routes can do `session.user.id` without extra queries.
   ════════════════════════════════════════════════════════════════ */

export const authOptions: NextAuthOptions = {
  adapter: PrismaAdapter(prisma) as Adapter,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      allowDangerousEmailAccountLinking: true, // allow linking if email matches
    }),
    // Add more providers later (GitHub, Discord, etc.)
  ],

  session: {
    strategy: 'jwt', // JWT = no DB lookup per request = faster
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  callbacks: {
    // After sign-in, go to /ask (the main page)
    async redirect({ url, baseUrl }) {
      if (url.startsWith(baseUrl)) return `${baseUrl}/ask`;
      return baseUrl;
    },

    // Inject user.id into the JWT token
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },

    // Make user.id available in session
    async session({ session, token }) {
      if (session.user && token.id) {
        (session.user as any).id = token.id as string;
      }
      return session;
    },
  },

  events: {
    // Create default preferences + alert settings on first sign-in
    async createUser({ user }) {
      const DEFAULT_WATCHLIST = ['SPY', 'QQQ', 'NVDA', 'META', 'AAPL', 'GOOG', 'TSLA', 'AMD'];

      await Promise.all([
        // Default watchlist
        prisma.watchlistItem.createMany({
          data: DEFAULT_WATCHLIST.map((ticker, i) => ({
            userId: user.id,
            ticker,
            sortOrder: i,
          })),
        }),

        // Default preferences
        prisma.userPreferences.create({
          data: { userId: user.id },
        }),

        // Default alert settings
        prisma.alertSettings.create({
          data: { userId: user.id },
        }),
      ]);
    },
  },

  // pages: {
  //   signIn: '/login',
  //   error: '/login',
  // },
};
