import { describe, it, expect } from 'vitest';
import { parsePagination, totalPages } from '../src/utils/pagination';
import { validatePassword, PASSWORD_MIN_LENGTH } from '../src/utils/password';
import { normalizePhone, phoneMatchVariants } from '../src/utils/phone';
import { calculateRiskLevel, ratingToLabel } from '../src/utils/riskScore';
import { RiskLevel } from '../src/types/enums';

describe('pagination', () => {
  it('falls back to defaults for junk input rather than emitting NaN', () => {
    // `?limit=abc` previously produced NaN, which went into the PostgREST URL
    // and came back a 400 — surfacing as an unhandled rejection.
    expect(parsePagination({ limit: 'abc' })).toEqual({ page: 1, limit: 20, offset: 0 });
    expect(parsePagination({ page: 'xyz' }).page).toBe(1);
  });

  it('rejects zero and negative values', () => {
    expect(parsePagination({ limit: '0' }).limit).toBe(20);
    expect(parsePagination({ limit: '-5' }).limit).toBe(20);
    expect(parsePagination({ page: '-3' }).offset).toBe(0);
  });

  it('clamps to the maximum page size', () => {
    expect(parsePagination({ limit: '5000' }, 20, 50).limit).toBe(50);
  });

  it('computes offset from page', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 });
  });

  it('never returns Infinity or NaN for totalPages', () => {
    expect(totalPages(0, 20)).toBe(0);     // was NaN
    expect(totalPages(100, 0)).toBe(0);    // was Infinity
    expect(totalPages(NaN, 20)).toBe(0);
    expect(totalPages(21, 20)).toBe(2);
  });
});

describe('password policy', () => {
  it('accepts a password meeting every rule', () => {
    expect(validatePassword('Str0ngPassword')).toBeNull();
  });

  it('lists every unmet requirement at once', () => {
    // Each rule used to overwrite the previous message, so an empty password
    // reported only "must include a number".
    const msg = validatePassword('abc');
    expect(msg).toContain(`${PASSWORD_MIN_LENGTH} characters`);
    expect(msg).toContain('uppercase');
    expect(msg).toContain('number');
  });

  it('requires an uppercase letter and a digit', () => {
    expect(validatePassword('alllowercase1')).toContain('uppercase');
    expect(validatePassword('NoDigitsInHere')).toContain('number');
  });

  it('rejects empty and non-string input', () => {
    expect(validatePassword('')).toBeTruthy();
    expect(validatePassword(undefined)).toBeTruthy();
    expect(validatePassword(12345678901)).toBeTruthy();
  });
});

describe('phone normalisation', () => {
  it('strips formatting so a stored number matches a dialled one', () => {
    // Caller ID compares digits-only input against the stored value; without
    // normalisation a formatted number could never match.
    expect(normalizePhone('+44 20 1234 5678')).toBe('442012345678');
    expect(normalizePhone('(02) 1234-5678')).toBe('0212345678');
  });

  it('handles null and empty input', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('produces suffix variants so country/trunk prefixes still match', () => {
    const v = phoneMatchVariants('+61 412 345 678');
    expect(v).toContain('61412345678');
    expect(v.some((x) => x.endsWith('412345678'))).toBe(true);
  });

  it('returns nothing for a number too short to be meaningful', () => {
    expect(phoneMatchVariants('12345')).toEqual([]);
  });
});

describe('risk scoring', () => {
  it('maps ratings to the documented bands', () => {
    expect(calculateRiskLevel(6)).toBe(RiskLevel.EXCELLENT);
    expect(calculateRiskLevel(5.5)).toBe(RiskLevel.EXCELLENT);
    expect(calculateRiskLevel(4.0)).toBe(RiskLevel.GOOD);
    expect(calculateRiskLevel(2.5)).toBe(RiskLevel.AVERAGE);
    expect(calculateRiskLevel(1.0)).toBe(RiskLevel.POOR);
    expect(calculateRiskLevel(0.5)).toBe(RiskLevel.HIGH_RISK);
  });

  it('treats a 0 rating as the worst band, not as "no reviews"', () => {
    // 0 is falsy, which previously made the caller card report "No reviews yet"
    // for the highest-risk guest possible.
    expect(calculateRiskLevel(0)).toBe(RiskLevel.HIGH_RISK);
    expect(ratingToLabel(0)).toBeTruthy();
  });

  it('reports an unreviewed guest distinctly from a badly reviewed one', () => {
    expect(calculateRiskLevel(null)).toBe(RiskLevel.UNREVIEWED);
  });

  it('bands the boundary consistently with the stored rounded value', () => {
    // refreshGuestScore rounds before banding, so two guests both displaying
    // "4.0" must land in the same band.
    expect(calculateRiskLevel(Math.round(3.95 * 10) / 10)).toBe(RiskLevel.GOOD);
    expect(calculateRiskLevel(4.0)).toBe(RiskLevel.GOOD);
  });
});
