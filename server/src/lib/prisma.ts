import { PrismaClient } from '@prisma/client';

// ---------------------------------------------------------------------------
// Build DATABASE_URL from individual DB_* variables if they are provided.
// This avoids URL-encoding issues with special characters in passwords.
//
// Set these in Vercel → Project Settings → Environment Variables:
//   DB_HOST      e.g. db.abcdefghijklmno.supabase.co
//   DB_PORT      5432  (free plan direct) or 6543 (paid pooler)
//   DB_USER      postgres
//   DB_PASSWORD  your database password (no encoding needed)
//   DB_NAME      postgres
// ---------------------------------------------------------------------------

if (process.env.DB_HOST) {
  const enc  = encodeURIComponent;
  const user = process.env.DB_USER     ?? 'postgres';
  const pass = process.env.DB_PASSWORD ?? '';
  const host = process.env.DB_HOST;
  const port = process.env.DB_PORT     ?? '5432';
  const name = process.env.DB_NAME     ?? 'postgres';
  const pgbouncer = port === '6543' ? '&pgbouncer=true' : '';

  process.env.DATABASE_URL =
    `postgresql://${enc(user)}:${enc(pass)}@${host}:${port}/${name}` +
    `?connection_limit=1${pgbouncer}`;
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
