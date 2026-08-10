import { Router, Response } from 'express';
import { PropertyStatus, ReviewStatus } from '../types/enums';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import { emailService, isEmailConfigured, verifyEmailTransport } from '../services/email.service';
import config from '../config/config';
import logger from '../utils/logger';
import { db } from '../lib/supabase';
import { parsePagination, totalPages } from '../utils/pagination';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

interface PropertyRow {
  id: string;
  name: string;
  type: string;
  city: string;
  country: string;
  status: PropertyStatus;
  createdAt: string;
  subscriptionTier?: string;
  subscriptionStatus?: string;
  rejectionReason?: string | null;
}

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  propertyId: string | null;
  createdAt: string;
}

interface ReviewRow {
  id: string;
  guestId: string;
  propertyId: string;
  reviewerId: string;
  status: ReviewStatus;
  flagReason?: string | null;
  updatedAt: string;
  createdAt: string;
}

async function attachAdminUsers(properties: PropertyRow[]): Promise<(PropertyRow & { users: UserRow[] })[]> {
  if (properties.length === 0) return [];
  const ids = properties.map((p) => p.id);
  const users = await db.select<UserRow>(
    'User',
    { propertyId: { in: ids }, role: 'PROPERTY_ADMIN' },
    { select: 'id,email,firstName,lastName,createdAt,propertyId,role' }
  );
  return properties.map((p) => ({ ...p, users: users.filter((u) => u.propertyId === p.id) }));
}

// ─── Pending Properties ────────────────────────────────────────────────────────

router.get(
  '/properties/pending',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const properties = await db.select<PropertyRow>(
      'Property',
      { status: PropertyStatus.PENDING_VERIFICATION },
      { order: 'createdAt.asc' }
    );

    const data = await attachAdminUsers(properties);
    res.json({ success: true, data });
  })
);

// ─── All Properties ────────────────────────────────────────────────────────────

router.get(
  '/properties',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>, 20, 100);
    const status = req.query.status as PropertyStatus | undefined;

    const filters: Record<string, PropertyStatus> = {};
    if (status) filters.status = status;
    const { data: properties, total } = await db.selectAndCount<PropertyRow>(
      'Property',
      filters,
      { order: 'createdAt.desc', limit, offset }
    );

    const enriched = await attachAdminUsers(properties);

    res.json({
      success: true,
      data: enriched,
      pagination: { page, limit, total, totalPages: totalPages(total, limit) },
    });
  })
);

// ─── Approve Property ─────────────────────────────────────────────────────────

router.post(
  '/properties/:id/approve',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const property = await db.updateOne<PropertyRow>(
      'Property',
      { id: req.params.id },
      {
        status: PropertyStatus.ACTIVE,
        verifiedAt: new Date().toISOString(),
        verifiedBy: req.user!.id,
        updatedAt: new Date().toISOString(),
      }
    );

    if (!property) {
      res.status(404).json({ success: false, message: 'Property not found' });
      return;
    }

    // Activate EVERY user attached to this property (not just PROPERTY_ADMIN, and
    // not capped) — a single PATCH filtered by propertyId, awaited before we respond.
    // This write must never be fire-and-forget: on serverless the instance freezes
    // once the response flushes, silently leaving approved owners unable to log in.
    await db.update('User', { propertyId: property.id }, {
      isActive: true,
      updatedAt: new Date().toISOString(),
    });

    const admins = await db.select<UserRow>(
      'User',
      { propertyId: property.id, role: 'PROPERTY_ADMIN' },
      { select: 'id,email,firstName', limit: 1 }
    );

    const admin = admins[0];
    if (admin) {
      try {
        await emailService.sendPropertyApprovedEmail(admin.email, admin.firstName, property.name);
      } catch (err) {
        logger.error('Failed to send approval email', err);
      }
    }

    logger.info(`Property approved: ${property.name} (${property.id}) by ${req.user!.email}`);

    res.json({ success: true, data: property, message: 'Property approved and owner notified' });
  })
);

// ─── Reject Property ─────────────────────────────────────────────────────────

router.post(
  '/properties/:id/reject',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { reason } = req.body;

    const property = await db.updateOne<PropertyRow>(
      'Property',
      { id: req.params.id },
      {
        status: PropertyStatus.REJECTED,
        rejectionReason: reason || 'Did not meet verification requirements',
        verifiedBy: req.user!.id,
        updatedAt: new Date().toISOString(),
      }
    );

    if (!property) {
      res.status(404).json({ success: false, message: 'Property not found' });
      return;
    }

    const admins = await db.select<UserRow>(
      'User',
      { propertyId: property.id, role: 'PROPERTY_ADMIN' },
      { select: 'email,firstName', limit: 1 }
    );
    const admin = admins[0];
    if (admin) {
      emailService
        .sendPropertyRejectedEmail(admin.email, admin.firstName, property.name, reason)
        .catch((err) => logger.error('Failed to send rejection email', err));
    }

    res.json({ success: true, message: 'Property rejected and owner notified' });
  })
);

// ─── Suspend Property ──────────────────────────────────────────────────────────

router.post(
  '/properties/:id/suspend',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    await db.update('Property', { id: req.params.id }, {
      status: PropertyStatus.SUSPENDED,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true, message: 'Property suspended' });
  })
);

// ─── Flagged Reviews ──────────────────────────────────────────────────────────

router.get(
  '/reviews/flagged',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const reviews = await db.select<ReviewRow>(
      'Review',
      { status: ReviewStatus.FLAGGED },
      { order: 'updatedAt.asc', limit: 200 }
    );

    // The client renders review.guest.firstName / review.reviewer.firstName /
    // review.property.name. Returning bare rows made the Flagged Reviews tab
    // throw and unmount the entire Admin Dashboard as soon as one review was
    // flagged — which is exactly when moderation is needed.
    const guestIds = Array.from(new Set(reviews.map((r) => r.guestId)));
    const reviewerIds = Array.from(new Set(reviews.map((r) => r.reviewerId)));
    const propertyIds = Array.from(new Set(reviews.map((r) => r.propertyId)));

    const [guests, reviewers, properties] = await Promise.all([
      guestIds.length
        ? db.select<{ id: string; firstName: string; lastName: string }>(
            'Guest', { id: { in: guestIds } }, { select: 'id,firstName,lastName' })
        : Promise.resolve([]),
      reviewerIds.length
        ? db.select<{ id: string; firstName: string; lastName: string; email: string }>(
            'User', { id: { in: reviewerIds } }, { select: 'id,firstName,lastName,email' })
        : Promise.resolve([]),
      propertyIds.length
        ? db.select<{ id: string; name: string }>(
            'Property', { id: { in: propertyIds } }, { select: 'id,name' })
        : Promise.resolve([]),
    ]);

    const gById = new Map(guests.map((g) => [g.id, g]));
    const uById = new Map(reviewers.map((u) => [u.id, u]));
    const pById = new Map(properties.map((p) => [p.id, p]));

    const UNKNOWN = { firstName: 'Unknown', lastName: '' };

    const enriched = reviews.map((r) => ({
      ...r,
      guest: gById.get(r.guestId) ?? { id: r.guestId, ...UNKNOWN },
      reviewer: uById.get(r.reviewerId) ?? { id: r.reviewerId, ...UNKNOWN, email: '' },
      property: pById.get(r.propertyId) ?? { id: r.propertyId, name: 'Unknown property' },
    }));

    res.json({ success: true, data: enriched });
  })
);

// ─── Moderate Review ──────────────────────────────────────────────────────────

router.post(
  '/reviews/:id/moderate',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { action } = req.body;

    const newStatus =
      action === 'approve' ? ReviewStatus.PUBLISHED : ReviewStatus.REMOVED;

    const review = await db.updateOne<ReviewRow>(
      'Review',
      { id: req.params.id },
      {
        status: newStatus,
        moderatedAt: new Date().toISOString(),
        moderatedBy: req.user!.id,
        updatedAt: new Date().toISOString(),
      }
    );

    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found' });
      return;
    }

    if (action === 'remove') {
      const { refreshGuestScore } = await import('./guests');
      refreshGuestScore(review.guestId).catch(console.error);
    }

    res.json({ success: true, message: `Review ${action === 'approve' ? 'approved' : 'removed'}` });
  })
);

// ─── Platform Stats ────────────────────────────────────────────────────────────

router.get(
  '/stats',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const [
      totalProperties,
      pendingProperties,
      totalGuests,
      totalReviews,
      flaggedReviews,
      highRiskGuests,
    ] = await Promise.all([
      db.count('Property', { status: PropertyStatus.ACTIVE }),
      db.count('Property', { status: PropertyStatus.PENDING_VERIFICATION }),
      db.count('Guest'),
      db.count('Review', { status: ReviewStatus.PUBLISHED }),
      db.count('Review', { status: ReviewStatus.FLAGGED }),
      db.count('Guest', { riskLevel: 'HIGH_RISK' }),
    ]);

    res.json({
      success: true,
      data: {
        totalProperties,
        pendingProperties,
        totalGuests,
        totalReviews,
        flaggedReviews,
        highRiskGuests,
      },
    });
  })
);

// ─── Waitlist ─────────────────────────────────────────────────────────────────

interface WaitlistRow {
  id: string;
  email: string;
  source: string | null;
  notified: boolean;
  createdAt: string;
}

// Signups are stored regardless of whether the notification email went out, so
// this is the authoritative list — it works even with SMTP unconfigured.
router.get(
  '/waitlist',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>, 50, 200);

    const { data, total } = await db.selectAndCount<WaitlistRow>(
      'Waitlist',
      {},
      { select: 'id,email,source,notified,createdAt', order: 'createdAt.desc', limit, offset }
    );

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: totalPages(total, limit) },
    });
  })
);

// ─── Email diagnostics ────────────────────────────────────────────────────────

// Authenticated replacement for the deleted public /api/debug endpoint. Reports
// whether SMTP can actually connect, so a misconfigured mailer is visible
// instead of silently swallowing every notification.
router.get(
  '/email/status',
  authenticate,
  requireSuperAdmin,
  asyncHandler(async (_req: AuthRequest, res: Response): Promise<void> => {
    const transport = await verifyEmailTransport();
    const pendingNotification = await db.count('Waitlist', { notified: false });

    res.json({
      success: true,
      data: {
        provider: 'resend',
        configured: isEmailConfigured(),
        transport,
        notifyAddress: config.waitlistNotifyEmail,
        fromAddress: config.resend.fromEmail,
        waitlistSignupsAwaitingNotification: pendingNotification,
      },
    });
  })
);

export default router;
