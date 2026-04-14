import { PrismaClient } from '@prisma/client';

/**
 * Prisma singleton — prevents exhausting the database connection pool in
 * serverless environments (Vercel functions). On Vercel each function
 * invocation may reuse the same Node.js process, so we cache the client
 * on `globalThis` and reuse it across hot invocations.
 *
 * For Neon (recommended with Vercel), set DATABASE_URL to:
 *   postgresql://user:pass@host/db?sslmode=require&connection_limit=10&pool_timeout=20
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
