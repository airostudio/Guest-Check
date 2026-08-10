/**
 * Phone normalisation.
 *
 * Numbers arrive in every conceivable format — "+44 20 1234 5678",
 * "(02) 1234 5678", "0412-345-678" — from manual entry and from booking
 * platform webhooks. Caller-ID lookup strips the incoming number to digits,
 * so unless the stored value is normalised the same way, ILIKE can never
 * match and reception is told "unknown caller" for a guest that is on file.
 *
 * We store a digits-only copy alongside the human-readable original and match
 * against that.
 */

/** Strip everything except digits. Returns '' if there is nothing usable. */
export function normalizePhone(input: string | null | undefined): string {
  if (!input) return '';
  return String(input).replace(/\D/g, '');
}

/**
 * Suffix variants to try when matching an inbound caller.
 *
 * Callers present numbers with and without country/trunk prefixes: the same
 * line can arrive as 61412345678, 0412345678 or 412345678. Matching on the
 * last 9 digits catches all three without being so short it collides.
 */
export function phoneMatchVariants(input: string): string[] {
  const digits = normalizePhone(input);
  if (digits.length < 7) return [];
  return Array.from(
    new Set([digits, digits.slice(-10), digits.slice(-9)].filter((v) => v.length >= 7))
  );
}
