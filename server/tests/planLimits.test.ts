import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

/**
 * End-to-end checks on subscription plan enforcement.
 *
 * config.plans declared five limits per tier, but only reviewsPerMonth was ever
 * checked. Every other paid differentiator — API access, caller ID, team seats,
 * guest lookups — was available on every tier, including the free trial. These
 * tests pin the gates in place.
 */

const JWT_SECRET = 'test-secret-at-least-32-characters-long!!';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = JWT_SECRET;
process.env.SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.RESEND_API_KEY = '';

type Row = Record<string, unknown>;

interface Fixture {
  tier: string;
  status: string;
  role: string;
  /** Rows returned for a `select=id`-style count, keyed by table. */
  counts: Record<string, number>;
}

let fixture: Fixture;
const inserted: Array<{ table: string; body: Row }> = [];

function tableOf(url: string): string {
  return url.replace('https://proj.supabase.co/rest/v1/', '').split('?')[0];
}

beforeEach(() => {
  inserted.length = 0;
  fixture = { tier: 'FREE_TRIAL', status: 'ACTIVE', role: 'PROPERTY_ADMIN', counts: {} };

  vi.stubGlobal('fetch', async (url: string, opts: { method?: string; body?: string } = {}) => {
    const table = tableOf(String(url));
    const method = (opts.method ?? 'GET').toUpperCase();

    if (method === 'POST') {
      const body = JSON.parse(opts.body ?? '{}');
      inserted.push({ table, body });
      return { ok: true, status: 201, text: async () => JSON.stringify([body]), headers: { get: () => null } };
    }

    // Count queries carry Prefer: count=exact; the total lives in Content-Range.
    const total = fixture.counts[table] ?? 0;

    const query = String(url).split('?')[1] ?? '';

    let rows: Row[] = [];
    if (table === 'User') {
      // A lookup filtered by email is the "does this invitee already exist?"
      // check — it must come back empty, unlike the authenticate() lookup by id.
      rows = query.includes('email=')
        ? []
        : [{
            id: 'u1', email: 'a@b.com', firstName: 'A', lastName: 'B',
            role: fixture.role, propertyId: 'p1', emailVerified: true, isActive: true,
          }];
    } else if (table === 'Property') {
      rows = [{
        id: 'p1', name: 'Test Property', status: fixture.status,
        subscriptionTier: fixture.tier, subscriptionStatus: 'ACTIVE',
      }];
    }

    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify(rows),
      headers: { get: (h: string) => (h.toLowerCase() === 'content-range' ? `0-0/${total}` : null) },
    };
  });
});

afterEach(() => vi.unstubAllGlobals());

function token() {
  return jwt.sign(
    { userId: 'u1', email: 'a@b.com', role: fixture.role, propertyId: 'p1' },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

async function app() {
  return (await import('../src/app')).default;
}

describe('API access is gated on the plan', () => {
  it('refuses API key creation on the free trial', async () => {
    const res = await request(await app())
      .post('/api/integrations/api-keys')
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: 'k' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PLAN_UPGRADE_REQUIRED');
  });

  it('allows API key creation on Professional', async () => {
    fixture.tier = 'PROFESSIONAL';
    const res = await request(await app())
      .post('/api/integrations/api-keys')
      .set('Authorization', `Bearer ${token()}`)
      .send({ name: 'k' });

    expect(res.status).toBe(201);
  });
});

describe('caller ID is gated on the plan', () => {
  it('refuses the lookup on Basic', async () => {
    fixture.tier = 'BASIC';
    const res = await request(await app())
      .get('/api/phone/caller/+61412345678')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(402);
    expect(res.body.message).toMatch(/Caller ID/i);
  });

  it('allows the lookup on Professional', async () => {
    fixture.tier = 'PROFESSIONAL';
    const res = await request(await app())
      .get('/api/phone/caller/+61412345678')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });
});

describe('team seats are gated on the plan', () => {
  it('refuses a second seat on the free trial (1 seat)', async () => {
    fixture.counts.User = 1;
    const res = await request(await app())
      .post('/api/properties/mine/team')
      .set('Authorization', `Bearer ${token()}`)
      .send({ email: 'new@x.com', firstName: 'New', lastName: 'Person', role: 'RECEPTIONIST' });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('allows a seat while under the limit', async () => {
    fixture.tier = 'PROFESSIONAL'; // 10 seats
    fixture.counts.User = 3;
    const res = await request(await app())
      .post('/api/properties/mine/team')
      .set('Authorization', `Bearer ${token()}`)
      .send({ email: 'new@x.com', firstName: 'New', lastName: 'Person', role: 'RECEPTIONIST' });

    expect(res.status).toBe(201);
  });
});

describe('guest lookups are metered', () => {
  it('blocks the search once the monthly allowance is spent', async () => {
    fixture.counts.GuestLookup = 20; // free trial allowance
    const res = await request(await app())
      .get('/api/guests/search?q=smith')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('PLAN_LIMIT_REACHED');
  });

  it('records the lookup when within the allowance', async () => {
    fixture.counts.GuestLookup = 2;
    const res = await request(await app())
      .get('/api/guests/search?q=smith')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
    // Doubles as the audit trail of who looked up what.
    const logged = inserted.find((i) => i.table === 'GuestLookup');
    expect(logged).toBeDefined();
    expect(logged?.body).toMatchObject({ propertyId: 'p1', method: 'search' });
  });

  it('never meters an unlimited plan', async () => {
    fixture.tier = 'ENTERPRISE';
    fixture.counts.GuestLookup = 99999;
    const res = await request(await app())
      .get('/api/guests/search?q=smith')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(200);
  });
});

describe('property standing is enforced', () => {
  it('locks out a suspended property', async () => {
    // Suspension previously changed a column that no code read, so a suspended
    // property kept full access.
    fixture.status = 'SUSPENDED';
    const res = await request(await app())
      .get('/api/guests/search?q=smith')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/suspended/i);
  });

  it('locks out a property still pending verification', async () => {
    fixture.status = 'PENDING_VERIFICATION';
    const res = await request(await app())
      .get('/api/guests/search?q=smith')
      .set('Authorization', `Bearer ${token()}`);

    expect(res.status).toBe(403);
  });
});
