// Direct HTTPS access to Supabase via PostgREST.
// Bypasses Prisma's TCP connection — works from any IPv4 host (Vercel, etc).

function resolveSupabaseUrl(): string {
  const explicit = process.env.SUPABASE_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  // Derive from DATABASE_URL: postgresql://...@db.<ref>.supabase.co:...
  const dbUrl = process.env.DATABASE_URL ?? '';
  const m = dbUrl.match(/@(?:db\.)?([a-z0-9]+)\.supabase\.co/i);
  if (m) return `https://${m[1]}.supabase.co`;

  throw new Error('SUPABASE_URL is not set and could not be derived from DATABASE_URL');
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

type Filter = string | number | boolean | Date | null | { gt?: unknown; lt?: unknown; gte?: unknown; lte?: unknown; neq?: unknown; in?: unknown[] };

function buildFilters(filters: Record<string, Filter>): string {
  const params: string[] = [];
  for (const [key, val] of Object.entries(filters)) {
    if (val === undefined) continue;
    if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
      for (const [op, v] of Object.entries(val as Record<string, unknown>)) {
        if (op === 'in' && Array.isArray(v)) {
          params.push(`${encodeURIComponent(key)}=in.(${v.map((x) => encodeURIComponent(formatValue(x))).join(',')})`);
        } else {
          params.push(`${encodeURIComponent(key)}=${op}.${encodeURIComponent(formatValue(v))}`);
        }
      }
    } else if (val === null) {
      params.push(`${encodeURIComponent(key)}=is.null`);
    } else {
      params.push(`${encodeURIComponent(key)}=eq.${encodeURIComponent(formatValue(val))}`);
    }
  }
  return params.join('&');
}

async function request<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {}
): Promise<T> {
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
  return data as T;
}

export interface SelectOptions {
  select?: string;
  limit?: number;
  order?: string;
}

export const db = {
  async select<T = Record<string, unknown>>(
    table: string,
    filters: Record<string, Filter> = {},
    options: SelectOptions = {}
  ): Promise<T[]> {
    const parts = [buildFilters(filters)];
    if (options.select) parts.push(`select=${encodeURIComponent(options.select)}`);
    if (options.limit) parts.push(`limit=${options.limit}`);
    if (options.order) parts.push(`order=${encodeURIComponent(options.order)}`);
    const query = parts.filter(Boolean).join('&');
    const path = `${table}${query ? '?' + query : ''}`;
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
    return request<T[]>('PATCH', `${table}?${query}`, data);
  },

  async delete(table: string, filters: Record<string, Filter>): Promise<void> {
    const query = buildFilters(filters);
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
