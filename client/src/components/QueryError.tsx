import { AlertTriangle, RefreshCw } from 'lucide-react';
import { getErrorMessage } from '../api/errors';

/**
 * Renders the failure state of a react-query call.
 *
 * Without this, a failed query is indistinguishable from an empty result: the
 * page renders zeros and empty lists. On a platform whose job is surfacing
 * guest risk, "no alerts" when the request actually failed is the worst
 * possible default — the same false negative that made a failed caller-ID
 * lookup read as "Unknown caller".
 */
export default function QueryError({
  error,
  onRetry,
  label = 'Could not load this section',
  compact = false,
}: {
  error: unknown;
  onRetry?: () => void;
  label?: string;
  compact?: boolean;
}) {
  if (!error) return null;

  const message = getErrorMessage(error, 'Please try again in a moment.');

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700" role="alert">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span>{message}</span>
        {onRetry && (
          <button onClick={onRetry} className="underline hover:no-underline font-medium">
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="card p-6 border-l-4 border-l-amber-500" role="alert">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{label}</p>
          <p className="text-sm text-slate-500 mt-1">{message}</p>
          <p className="text-sm text-amber-700 mt-2">
            This is a loading failure, not an empty result — don&apos;t read it as &ldquo;nothing found&rdquo;.
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="btn-secondary text-sm mt-4 inline-flex items-center gap-2"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Try again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
