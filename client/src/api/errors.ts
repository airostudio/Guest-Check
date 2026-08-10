/**
 * Extract a useful message from an API error.
 *
 * The server returns two different failure shapes:
 *   { success: false, message: "..." }                    — hand-written errors
 *   { success: false, errors: [{ path, msg }, ...] }      — express-validator
 *
 * Reading only `.message` meant every validation failure surfaced as a generic
 * "Failed to …" toast, so the user was never told which field was wrong.
 */
interface ValidationIssue {
  path?: string;
  param?: string;
  msg?: string;
}

interface ApiErrorBody {
  message?: string;
  errors?: ValidationIssue[];
}

interface AxiosLikeError {
  response?: { status?: number; data?: ApiErrorBody };
  code?: string;
}

/** Human-readable label for a field path, e.g. "firstName" → "First name". */
function labelFor(path: string): string {
  const spaced = path
    .replace(/([A-Z])/g, ' $1')
    .replace(/[._]/g, ' ')
    .trim()
    .toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

export function getErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const e = err as AxiosLikeError;

  if (e?.code === 'ERR_NETWORK') {
    return 'Could not reach the server. Please check your connection.';
  }

  const status = e?.response?.status;
  const data = e?.response?.data;

  if (data?.message) return data.message;

  if (Array.isArray(data?.errors) && data.errors.length > 0) {
    const parts = data.errors
      .map((issue) => {
        const field = issue.path ?? issue.param;
        const msg = issue.msg ?? 'is invalid';
        return field ? `${labelFor(field)}: ${msg}` : msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join(' · ');
  }

  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have permission to do that.';
  if (status && status >= 500) return 'The server ran into a problem. Please try again shortly.';

  return fallback;
}

export default getErrorMessage;
