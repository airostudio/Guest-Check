// Direct HTTPS access to Supabase via PostgREST.
// Bypasses Prisma's TCP connection — works from any IPv4 host (Vercel, etc).

function resolveSupabaseUrl(): string {
  const explicit = process.env.SUPABASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const dbUrl = process.env.DATABASE_URL ?? '';

  // Direct URL:  postgresql://postgres:pw@db.PROJECTREF.supabase.co:5432/postgres
  const directMatch = dbUrl.match(/@db\.([a-z0-9]+)\.supabase\.co/i);
  if (directMatch) return `https://${directMatch[1]}.supabase.co`;

  // Pooler URL:  postgresql://postgres.PROJECTREF:pw@aws-0-*.pooler.supabase.com:5432/postgres
  const poolerMatch = dbUrl.match(/\/\/postgres\.([a-z0-9]+):/i);
  if (poolerMatch) return `https://${poolerMatch[1]}.supabase.co`;

  throw new Error(
    'Cannot derive SUPABASE_URL. Add SUPABASE_URL env var in Vercel: https://YOURPROJECTREF.supabase.co'
  );
}

function getKey(): string {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is not set');
  return k;
}

function formatValue(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (v === null || v === undefined) return 'null';
  return String(v);
}

/**
 * Column names are structural — they are never percent-encoded, so they must
 * never carry user input. Anything outside this shape is a programming error.
 */
function assertSafeColumn(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Unsafe column name in query: ${JSON.stringify(name)}`);
  }
  return name;
}

/**
 * Quote a value for use inside a PostgREST filter.
 *
 * PostgREST treats , . ( ) : as structural, so an unquoted value can break out
 * of its filter and inject additional predicates. Double-quoting neutralises
 * them; backslash and quote are escaped first, then the payload is percent-
 * encoded so it cannot terminate the parameter or start a new one.
 *
 * `*` is deliberately left unencoded — it is the ilike wildcard.
 */
function quoteValue(v: unknown): string {
  const escaped = formatValue(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `"${encodeURIComponent(escaped).replace(/%2A/gi, '*')}"`;
}

export type Filter =
  | string
  | number
  | boolean
  | Date
  | null
  | { gt?: unknown; lt?: unknown; gte?: unknown; lte?: unknown; neq?: unknown; in?: unknown[]; ilike?: string; like?: string };

/** A single OR branch. Values are always escaped by the builder. */
export interface OrCondition {
  column: string;
  op: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'like' | 'ilike';
  value: unknown;
}

/**
 * Build `or=(col.op.val,...)`. Callers pass structured conditions rather than a
 * pre-joined string so user input can never reach the query as raw syntax.
 * Returns '' for an empty condition list.
 */
function buildOr(conditions: OrCondition[]): string {
  if (conditions.length === 0) return '';
  const parts = conditions.map(
    (c) => `${assertSafeColumn(c.column)}.${c.op}.${quoteValue(c.value)}`
  );
  return `or=(${parts.join(',')})`;
}

function buildFilters(filters: Record<string, Filter>): string {
  const params: string[] = [];
  for (const [rawKey, val] of Object.entries(filters)) {
    if (val === undefined) continue;
    const key = assertSafeColumn(rawKey);

    if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      for (const [op, v] of Object.entries(val as Record<string, unknown>)) {
        if (v === undefined) continue; // `{ gte: undefined }` must not become `gte.null`

        if (op === 'in') {
          if (!Array.isArray(v)) {
            throw new Error(`Filter "${key}.in" expects an array`);
          }
          // An empty IN list is a PostgREST syntax error. Emit an
          // always-false predicate so callers get zero rows, not a 400.
          if (v.length === 0) {
            params.push(`${key}=in.("")&${key}=not.in.("")`);
            continue;
          }
          params.push(`${key}=in.(${v.map((x) => quoteValue(x)).join(',')})`);
        } else if (v === null) {
          // `is` is the only operator that compares against SQL NULL.
          params.push(`${key}=${op === 'neq' ? 'not.is' : 'is'}.null`);
        } else {
          params.push(`${key}=${op}.${quoteValue(v)}`);
        }
      }
    } else if (val === null) {
      params.push(`${key}=is.null`);
    } else {
      params.push(`${key}=eq.${quoteValue(val)}`);
    }
  }
  return params.join('&');
}

interface RawResponse<T> {
  data: T;
  status: number;
  contentRange: string | null;
}

async function rawRequest<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<RawResponse<T>> {
  const url = `${resolveSupabaseUrl()}/rest/v1/${path}`;
  const key = getKey();
  const res = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...extraHeaders,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;

  if (!res.ok) {
    const errObj = (data && typeof data === 'object' ? (data as Record<string, unknown>) : {}) as Record<string, unknown>;
    const msg = (errObj.message as string) ?? (errObj.hint as string) ?? text ?? `HTTP ${res.status}`;
    const code = (errObj.code as string) ?? '';
    const err = new Error(`Supabase ${method} ${path}: ${msg}`);
    (err as Error & { code?: string; status?: number }).code = code;
    (err as Error & { code?: string; status?: number }).status = res.status;
    throw err;
  }
  return { data: data as T, status: res.status, contentRange: res.headers.get('content-range') };
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
  const r = await rawRequest<T>(method, path, body, extraHeaders);
  return r.data;
}

export interface SelectOptions {
  select?: string;
  limit?: number;
  offset?: number;
  order?: string;
  /** Structured OR conditions — values are escaped by the query builder. */
  or?: OrCondition[];
}

/**
 * Assemble the query string for a read. Numeric options are coerced to safe
 * integers so a hostile `?limit=abc` can never put NaN into the URL (PostgREST
 * answers 400, which previously surfaced as an unhandled rejection).
 */
function buildQuery(filters: Record<string, Filter>, options: SelectOptions): string {
  const parts = [buildFilters(filters)];

  if (options.or?.length) parts.push(buildOr(options.or));
  if (options.select) parts.push(`select=${encodeURIComponent(options.select)}`);

  if (options.limit !== undefined) {
    const limit = Math.max(0, Math.trunc(Number(options.limit) || 0));
    parts.push(`limit=${limit}`);
  }
  if (options.offset !== undefined) {
    const offset = Math.max(0, Math.trunc(Number(options.offset) || 0));
    parts.push(`offset=${offset}`);
  }
  if (options.order) parts.push(`order=${encodeURIComponent(options.order)}`);

  const query = parts.filter(Boolean).join('&');
  return query ? `?${query}` : '';
}

/**
 * Parse the total from a Content-Range header.
 * "0-19/123" → 123, "*​/0" → 0, "0-19/*" or missing → NaN (caller decides).
 */
function parseCount(contentRange: string | null): number {
  if (!contentRange) return NaN;
  const total = contentRange.split('/')[1];
  if (!total || total === '*') return NaN;
  const n = parseInt(total, 10);
  return Number.isNaN(n) ? NaN : n;
}

export const db = {
  async select<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, Filter> = {},
    options: SelectOptions = {}
  ): Promise<T[]> {
    const path = `${table}${buildQuery(filters, options)}`;
    return request<T[]>('GET', path);
  },

  async selectOne<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, Filter>,
    options: Omit<SelectOptions, 'limit'> = {}
  ): Promise<T | null> {
    const rows = await db.select<T>(table, filters, { ...options, limit: 1 });
    return rows[0] ?? null;
  },

  async selectAndCount<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, Filter> = {},
    options: SelectOptions = {}
  ): Promise<{ data: T[]; total: number }> {
    const path = `${table}${buildQuery(filters, options)}`;
    const r = await rawRequest<T[]>('GET', path, undefined, { Prefer: 'count=exact' });
    // Content-Range: "0-19/123" → 123.  "*/0" → 0.  "0-19/*" → fall back.
    const parsed = parseCount(r.contentRange);
    return { data: r.data, total: Number.isFinite(parsed) ? parsed : r.data.length };
  },

  async count(
    table: string,
    filters: Record<string, Filter> = {},
    options: { or?: OrCondition[] } = {}
  ): Promise<number> {
    const path = `${table}${buildQuery(filters, { ...options, select: 'id', limit: 1 })}`;
    const r = await rawRequest<unknown[]>('GET', path, undefined, { Prefer: 'count=exact' });
    const total = parseCount(r.contentRange);
    return Number.isFinite(total) ? total : 0;
  },

  async insert<T = Record<string, unknown>>(
    table: string,
    data: Record<string, unknown>
  ): Promise<T> {
    const rows = await request<T[]>('POST', table, data);
    return Array.isArray(rows) ? rows[0] : (rows as T);
  },

  async update<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, Filter>,
    data: Record<string, unknown>
  ): Promise<T[]> {
    const query = buildFilters(filters);
    // An empty filter would rewrite every row in the table.
    if (!query) throw new Error(`Refusing to UPDATE all rows of "${table}" with no filter`);
    return request<T[]>('PATCH', `${table}?${query}`, data);
  },

  async updateOne<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, Filter>,
    data: Record<string, unknown>
  ): Promise<T | null> {
    const rows = await db.update<T>(table, filters, data);
    return rows[0] ?? null;
  },

  async delete(table: string, filters: Record<string, Filter>): Promise<void> {
    const query = buildFilters(filters);
    // An empty filter would delete every row in the table.
    if (!query) throw new Error(`Refusing to DELETE all rows of "${table}" with no filter`);
    await request('DELETE', `${table}?${query}`);
  },

  async health(): Promise<{ ok: boolean; message: string; url?: string }> {
    try {
      const url = `${resolveSupabaseUrl()}/rest/v1/User?select=id&limit=1`;
      const key = getKey();
      const res = await fetch(url, {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
      });
      if (res.ok) return { ok: true, message: 'connected', url: resolveSupabaseUrl() };
      const text = await res.text();
      return { ok: false, message: `HTTP ${res.status}: ${text}`, url: resolveSupabaseUrl() };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  },
};

export default db;
