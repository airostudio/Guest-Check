import { PrismaClient } from '@prisma/client';

// Supabase requires SSL. Append sslmode=require if not already in the URL.
const rawUrl = process.env.DATABASE_URL ?? '';
if (rawUrl && !rawUrl.includes('sslmode=')) {
  const sep = rawUrl.includes('?') ? '&' : '?';
  process.env.DATABASE_URL = `${rawUrl}${sep}sslmode=require`;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
