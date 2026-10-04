import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The PostgREST query builder is the single most security-sensitive module in
 * the codebase: it turns user input into the query string sent to Supabase with
 * the service-role key. A regression here is a data-exfiltration bug, so the
 * escaping contract is pinned down here rather than left to review.
 */

process.env.SUPABASE_URL = 'https://proj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';

let lastUrl = '';
let lastMethod = '';

beforeEach(async () => {
  lastUrl = '';
  lastMethod = '';
  vi.stubGlobal('fetch', async (url: string, opts: { method?: string } = {}) => {
    lastUrl = String(url).replace('https://proj.supabase.co/rest/v1/', '');
    lastMethod = opts.method ?? 'GET';
    return {
      ok: true,
      status: 200,
      text: async () => '[]',
      headers: { get: () => '0-0/0' },
    };
  });
});

afterEach(() => vi.unstubAllGlobals());

async function db() {
  return (await import('../src/lib/supabase')).db;
}

describe('filter escaping', () => {
  it('neutralises an attempt to break out of an OR group and append a filter', async () => {
    // The exact payload from the security audit: unescaped, this appended
    // `notes=ilike.*password*` as a top-level AND predicate, enabling blind
    // exfiltration of columns excluded from the select clause.
    const payload = 'zz*)&notes=ilike.*secret*&or=(firstName.ilike.*';
    await (await db()).select('Guest', {}, {
      or: [{ column: 'firstName', op: 'ilike', value: `*${payload}*` }],
    });

    expect(lastUrl).not.toMatch(/&notes=/);
    expect(lastUrl).toContain('%26');       // & is encoded
    expect(lastUrl).toContain('%3D');       // = is encoded
    expect(lastUrl.match(/or=\(/g)).toHaveLength(1);
  });

  it('keeps an ampersand inside the value instead of starting a new parameter', async () => {
    await (await db()).select('Guest', {}, {
      or: [{ column: 'firstName', op: 'ilike', value: '*B&B*' }],
    });
    expect(lastUrl).toBe('Guest?or=(firstName.ilike."*B%26B*")');
  });

  it('keeps a comma inside the value instead of adding an OR branch', async () => {
    await (await db()).select('Guest', {}, {
      or: [{ column: 'lastName', op: 'ilike', value: '*Smith,Jones*' }],
    });
    expect(lastUrl).toContain('%2C');
    expect(lastUrl.split(',').length).toBe(1);
  });

  it('preserves * as the ilike wildcard', async () => {
    await (await db()).select('Guest', {}, {
      or: [{ column: 'email', op: 'ilike', value: '*acme*' }],
    });
    expect(lastUrl).toContain('"*acme*"');
  });

  it('rejects a column name that is not a plain identifier', async () => {
    await expect(
      (await db()).select('Guest', { 'id,password': 'x' })
    ).rejects.toThrow(/Unsafe column name/);
  });
});

describe('filter semantics', () => {
  it('turns an empty IN list into an always-false predicate, not a syntax error', async () => {
    await (await db()).select('Booking', { id: { in: [] } });
    // `in.()` is a PostgREST 400; this must return zero rows instead.
    expect(lastUrl).not.toContain('in.()');
    expect(lastUrl).toContain('not.in.');
  });

  it('skips an operator whose value is undefined', async () => {
    await (await db()).select('Booking', { checkIn: { gte: undefined, lte: '2026-01-01' } });
    expect(lastUrl).not.toContain('gte');
    expect(lastUrl).toContain('lte');
  });

  it('uses is.null / not.is.null rather than the string "null"', async () => {
    await (await db()).select('Review', { bookingId: null });
    expect(lastUrl).toContain('bookingId=is.null');

    await (await db()).select('Review', { bookingId: { neq: null } });
    expect(lastUrl).toContain('not.is.null');
  });

  it('clamps a non-numeric limit instead of putting NaN in the URL', async () => {
    await (await db()).select('Guest', {}, { limit: NaN, offset: -5 });
    expect(lastUrl).not.toContain('NaN');
    expect(lastUrl).toContain('limit=0');
    expect(lastUrl).toContain('offset=0');
  });
});

describe('destructive-write guards', () => {
  it('refuses an UPDATE with no filter', async () => {
    await expect((await db()).update('User', {}, { isActive: true }))
      .rejects.toThrow(/Refusing to UPDATE all rows/);
    expect(lastMethod).not.toBe('PATCH');
  });

  it('refuses a DELETE with no filter', async () => {
    await expect((await db()).delete('Property', {}))
      .rejects.toThrow(/Refusing to DELETE all rows/);
    expect(lastMethod).not.toBe('DELETE');
  });
});
