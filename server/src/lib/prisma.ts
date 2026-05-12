import { PrismaClient } from '@prisma/client';

// Validate DATABASE_URL at startup so misconfiguration gives a clear message
// instead of a cryptic "invalid port number" buried in a request error.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error(
    'DATABASE_URL environment variable is not set. ' +
    'Add it in Vercel → Project Settings → Environment Variables.'
  );
}
try {
  new URL(dbUrl);
} catch {
  throw new Error(
    'DATABASE_URL is not a valid URL. If your Supabase password contains ' +
    'special characters (@, #, !, /, ?, %, &, +) you must percent-encode them. ' +
    'Example: @ → %40, # → %23, ! → %21. ' +
    'Use the Supabase dashboard Transaction Pooler string which encodes the ' +
    'password automatically.'
  );
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
