/**
 * One password policy, applied everywhere a password is set.
 *
 * Registration required 10 chars with an uppercase letter and a digit, but
 * reset-password and change-password only checked `length >= 8` — so a user
 * could reset their way to a weaker password than they were forced to create.
 */
export const PASSWORD_MIN_LENGTH = 10;

export const PASSWORD_RULE_TEXT =
  `At least ${PASSWORD_MIN_LENGTH} characters, including an uppercase letter and a number.`;

/** Returns an error message, or null when the password is acceptable. */
export function validatePassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length === 0) {
    return 'A password is required';
  }

  const issues: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH) issues.push(`at least ${PASSWORD_MIN_LENGTH} characters`);
  if (!/[A-Z]/.test(password)) issues.push('an uppercase letter');
  if (!/[0-9]/.test(password)) issues.push('a number');

  return issues.length ? `Password needs ${issues.join(', ')}` : null;
}
