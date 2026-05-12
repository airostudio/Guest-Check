import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Build DATABASE_URL from individual DB_* variables if they are provided.
//
// WHY: Supabase passwords often contain special characters (@, #, !, etc.)
// that break URL parsing when embedded directly in DATABASE_URL. Accepting
// the password as a plain string and encoding it here is more reliable.
//
// Set these in Vercel → Project Settings → Environment Variables:
//
//   DB_HOST      e.g. aws-0-ap-southeast-2.pooler.supabase.com
//   DB_PORT      e.g. 6543  (Supabase transaction pooler)
//   DB_USER      e.g. postgres.abcdefghijklmno  (from Supabase pooler URL)
//   DB_PASSWORD  your raw Supabase database password (no encoding needed)
//   DB_NAME      e.g. postgres
//
// If DB_HOST is not set the code falls back to DATABASE_URL as-is.
// ---------------------------------------------------------------------------

if (process.env.DB_HOST) {
  const enc  = encodeURIComponent;
  const user = process.env.DB_USER     ?? 'postgres';
  const pass = process.env.DB_PASSWORD ?? '';
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT     ?? '6543';
  const name = process.env.DB_NAME     ?? 'postgres';

  process.env.DATABASE_URL =
    `postgresql://${enc(user)}:${enc(pass)}@${host}:${port}/${name}` +
    `?pgbouncer=true&connection_limit=1`;
}

// Fail fast with a readable message instead of a cryptic per-request error.
const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  throw new Error(
    'DATABASE_URL is not set. ' +
    'Add DB_HOST / DB_USER / DB_PASSWORD / DB_NAME / DB_PORT in Vercel, ' +
    'or set DATABASE_URL directly.'
  );
}

// Catch "invalid port number" class of errors immediately on cold start.
try {
  new URL(dbUrl);
} catch {
  throw new Error(
    'DATABASE_URL cannot be parsed — likely a special character in the password. ' +
    'Switch to the DB_HOST / DB_USER / DB_PASSWORD env vars instead of DATABASE_URL.'
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
