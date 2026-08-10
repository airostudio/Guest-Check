/**
 * Parse and clamp pagination query params.
 *
 * The previous inline pattern — `Math.min(parseInt(req.query.limit), 50)` —
 * produced NaN for `?limit=abc`, 0 for `?limit=0` (yielding totalPages:
 * Infinity), and negatives for `?limit=-5`. NaN and negative values went
 * straight into the PostgREST URL and came back as a 400.
 */
export interface Pagination {
  page: number;
  limit: number;
  offset: number;
}

function toPositiveInt(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function parsePagination(
  query: Record<string, unknown>,
  defaultLimit = 20,
  maxLimit = 50
): Pagination {
  const page = toPositiveInt(query.page, 1);
  const limit = Math.min(toPositiveInt(query.limit, defaultLimit), maxLimit);
  return { page, limit, offset: (page - 1) * limit };
}

/** Total pages for a result set. Never returns Infinity or NaN. */
export function totalPages(total: number, limit: number): number {
  if (!Number.isFinite(total) || total <= 0) return 0;
  if (!Number.isFinite(limit) || limit <= 0) return 0;
  return Math.ceil(total / limit);
}
