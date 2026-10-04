import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import config from '../config/config';
import { AuthRequest } from '../types';
import { SubscriptionTier } from '../types/enums';
import { db } from '../lib/supabase';
import logger from '../utils/logger';

/**
 * Subscription plan enforcement.
 *
 * config.plans defines five limits per tier, but only reviewsPerMonth was ever
 * checked — guestLookups, teamMembers, apiAccess and phoneIntegration were
 * declared and then ignored. Every tier therefore behaved like ENTERPRISE for
 * the features people actually pay to unlock.
 */

export interface PlanLimits {
  reviewsPerMonth: number; // -1 = unlimited
  guestLookups: number;    // -1 = unlimited
  apiAccess: boolean;
  phoneIntegration: boolean;
  teamMembers: number;     // -1 = unlimited
}

export function planLimits(tier: SubscriptionTier | undefined): PlanLimits {
  switch (tier) {
    case SubscriptionTier.ENTERPRISE:   return config.plans.enterprise;
    case SubscriptionTier.PROFESSIONAL: return config.plans.professional;
    case SubscriptionTier.BASIC:        return config.plans.basic;
    default:                            return config.plans.freeTrial;
  }
}

const TIER_LABEL: Record<string, string> = {
  FREE_TRIAL: 'Free Trial',
  BASIC: 'Basic',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

function tierLabel(tier: SubscriptionTier | undefined): string {
  return TIER_LABEL[tier ?? 'FREE_TRIAL'] ?? 'your current';
}

/** First instant of the current month, in UTC so dev and production agree. */
export function startOfMonthUtc(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/**
 * Gate a route on a boolean plan feature (apiAccess, phoneIntegration).
 * SUPER_ADMIN bypasses — they have no property and must be able to support any.
 */
export function requireFeature(feature: 'apiAccess' | 'phoneIntegration', featureName: string) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role === 'SUPER_ADMIN') {
      next();
      return;
    }

    const limits = planLimits(req.user?.subscriptionTier);
    if (!limits[feature]) {
      res.status(402).json({
        success: false,
        code: 'PLAN_UPGRADE_REQUIRED',
        message: `${featureName} is not included in the ${tierLabel(req.user?.subscriptionTier)} plan. Upgrade to Professional to enable it.`,
      });
      return;
    }
    next();
  };
}

/**
 * Record a guest lookup and tell the caller whether it was within quota.
 *
 * Doubles as the audit trail the platform was missing entirely: guest records
 * hold personal data and cross-property risk scores, so who looked up whom is
 * worth being able to answer.
 *
 * Fails OPEN on a recording error — a telemetry problem must not block
 * reception from checking a guest at the desk.
 */
export async function recordGuestLookup(
  req: AuthRequest,
  params: { method: 'search' | 'profile' | 'phone'; query?: string; guestId?: string }
): Promise<{ allowed: boolean; used: number; limit: number }> {
  const propertyId = req.user?.propertyId;
  const limits = planLimits(req.user?.subscriptionTier);

  // SUPER_ADMIN and unlimited plans are never metered.
  if (!propertyId || req.user?.role === 'SUPER_ADMIN' || limits.guestLookups === -1) {
    return { allowed: true, used: 0, limit: -1 };
  }

  try {
    const used = await db.count('GuestLookup', {
      propertyId,
      createdAt: { gte: startOfMonthUtc() },
    });

    if (used >= limits.guestLookups) {
      return { allowed: false, used, limit: limits.guestLookups };
    }

    await db.insert('GuestLookup', {
      id: crypto.randomBytes(12).toString('base64url'),
      propertyId,
      userId: req.user?.id ?? null,
      guestId: params.guestId ?? null,
      method: params.method,
      query: params.query ? params.query.slice(0, 120) : null,
      createdAt: new Date().toISOString(),
    });

    return { allowed: true, used: used + 1, limit: limits.guestLookups };
  } catch (err) {
    logger.error(`Guest lookup metering failed (allowing request): ${(err as Error).message}`);
    return { allowed: true, used: 0, limit: limits.guestLookups };
  }
}

/** Standard 402 body for an exhausted lookup allowance. */
export function lookupQuotaResponse(used: number, limit: number) {
  return {
    success: false,
    code: 'PLAN_LIMIT_REACHED',
    message:
      `You've used all ${limit} guest lookups included this month (${used}/${limit}). ` +
      `Upgrade your plan for a higher allowance.`,
  };
}
