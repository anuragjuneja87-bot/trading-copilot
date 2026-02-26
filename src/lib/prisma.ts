import { PrismaClient } from '@prisma/client';

/* ════════════════════════════════════════════════════════════════
   PRISMA CLIENT SINGLETON
   
   Vercel serverless creates new function instances frequently.
   This singleton reuses the PrismaClient in dev (where hot reload
   would otherwise create dozens of connections) and lets production
   use fresh instances (each invocation is isolated).
   
   Requires env vars from Vercel Postgres:
     POSTGRES_PRISMA_URL       — pooled connection string
     POSTGRES_URL_NON_POOLING  — direct connection (migrations)
   ════════════════════════════════════════════════════════════════ */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
