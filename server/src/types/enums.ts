/**
 * Domain enums — the single source of truth for the application at runtime.
 *
 * These mirror the enums declared in prisma/schema.prisma (and the Postgres
 * types created by prisma/setup.sql). They are defined here as plain TypeScript
 * rather than imported from `@prisma/client` because the data layer talks to
 * Supabase over HTTPS (see lib/supabase.ts) — Prisma is no longer used at
 * runtime, and pulling in the generated client purely for these constants meant
 * shipping the query engine into every serverless function and depending on an
 * unpinned `prisma generate` at build time.
 *
 * If you change an enum here, update schema.prisma and setup.sql to match.
 */

export const PropertyType = {
  HOTEL: 'HOTEL',
  HOSTEL: 'HOSTEL',
  BED_AND_BREAKFAST: 'BED_AND_BREAKFAST',
  VACATION_RENTAL: 'VACATION_RENTAL',
  APARTMENT: 'APARTMENT',
  BOUTIQUE_HOTEL: 'BOUTIQUE_HOTEL',
  RESORT: 'RESORT',
  CARAVAN_PARK: 'CARAVAN_PARK',
  OTHER: 'OTHER',
} as const;
export type PropertyType = (typeof PropertyType)[keyof typeof PropertyType];

export const UserRole = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  PROPERTY_ADMIN: 'PROPERTY_ADMIN',
  PROPERTY_MANAGER: 'PROPERTY_MANAGER',
  RECEPTIONIST: 'RECEPTIONIST',
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

export const SubscriptionTier = {
  FREE_TRIAL: 'FREE_TRIAL',
  BASIC: 'BASIC',
  PROFESSIONAL: 'PROFESSIONAL',
  ENTERPRISE: 'ENTERPRISE',
} as const;
export type SubscriptionTier = (typeof SubscriptionTier)[keyof typeof SubscriptionTier];

export const SubscriptionStatus = {
  TRIALING: 'TRIALING',
  ACTIVE: 'ACTIVE',
  PAST_DUE: 'PAST_DUE',
  CANCELLED: 'CANCELLED',
  UNPAID: 'UNPAID',
  PAUSED: 'PAUSED',
} as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[keyof typeof SubscriptionStatus];

export const PropertyStatus = {
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
  ACTIVE: 'ACTIVE',
  SUSPENDED: 'SUSPENDED',
  REJECTED: 'REJECTED',
} as const;
export type PropertyStatus = (typeof PropertyStatus)[keyof typeof PropertyStatus];

export const BookingSource = {
  BOOKING_COM: 'BOOKING_COM',
  AIRBNB: 'AIRBNB',
  EXPEDIA: 'EXPEDIA',
  HOTELS_COM: 'HOTELS_COM',
  DIRECT: 'DIRECT',
  MANUAL: 'MANUAL',
  API: 'API',
} as const;
export type BookingSource = (typeof BookingSource)[keyof typeof BookingSource];

export const BookingStatus = {
  CONFIRMED: 'CONFIRMED',
  CHECKED_IN: 'CHECKED_IN',
  CHECKED_OUT: 'CHECKED_OUT',
  CANCELLED: 'CANCELLED',
  NO_SHOW: 'NO_SHOW',
} as const;
export type BookingStatus = (typeof BookingStatus)[keyof typeof BookingStatus];

/** Risk bands map to average rating on the 0–6 scale. See utils/riskScore.ts. */
export const RiskLevel = {
  EXCELLENT: 'EXCELLENT',   // 5.5 – 6.0
  GOOD: 'GOOD',             // 4.0 – 5.4
  AVERAGE: 'AVERAGE',       // 2.5 – 3.9
  POOR: 'POOR',             // 1.0 – 2.4
  HIGH_RISK: 'HIGH_RISK',   // 0.0 – 0.9
  UNREVIEWED: 'UNREVIEWED',
} as const;
export type RiskLevel = (typeof RiskLevel)[keyof typeof RiskLevel];

export const ReviewStatus = {
  PUBLISHED: 'PUBLISHED',
  FLAGGED: 'FLAGGED',
  REMOVED: 'REMOVED',
  UNDER_REVIEW: 'UNDER_REVIEW',
} as const;
export type ReviewStatus = (typeof ReviewStatus)[keyof typeof ReviewStatus];
