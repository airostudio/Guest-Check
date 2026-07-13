import { Router, Response } from 'express';
import { PropertyStatus, ReviewStatus } from '@prisma/client';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';
import { db } from '../lib/supabase';

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
  async (_req: AuthRequest, res: Response): Promise<void> => {
    const properties = await db.select<PropertyRow>(
      'Property',
      { status: PropertyStatus.PENDING_VERIFICATION },
      { order: 'createdAt.asc' }
    );

    const data = await attachAdminUsers(properties);
    res.json({ success: true, data });
  }
);

// ─── All Properties ────────────────────────────────────────────────────────────

router.get(
  '/properties',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
    const status = req.query.status as PropertyStatus | undefined;

    const filters: Record<string, PropertyStatus> = {};
    if (status) filters.status = status;
    const { data: properties, total } = await db.selectAndCount<PropertyRow>(
      'Property',
      filters,
      { order: 'createdAt.desc', limit, offset: (page - 1) * limit }
    );

    const enriched = await attachAdminUsers(properties);

    res.json({
      success: true,
      data: enriched,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }
);

// ─── Approve Property ─────────────────────────────────────────────────────────

router.post(
  '/properties/:id/approve',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
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

    const admins = await db.select<UserRow>(
      'User',
      { propertyId: property.id, role: 'PROPERTY_ADMIN' },
      { select: 'id,email,firstName', limit: 5 }
    );

    // Activate all users for this property now that it's approved
    for (const admin of admins) {
      db.update('User', { id: admin.id }, { isActive: true, updatedAt: new Date().toISOString() })
        .catch(() => {});
    }

    const admin = admins[0];
    if (admin) {
      emailService
        .sendPropertyApprovedEmail(admin.email, admin.firstName, property.name)
        .catch((err) => logger.error('Failed to send approval email', err));
    }

    logger.info(`Property approved: ${property.name} (${property.id}) by ${req.user!.email}`);

    res.json({ success: true, data: property, message: 'Property approved and owner notified' });
  }
);

// ─── Reject Property ─────────────────────────────────────────────────────────

router.post(
  '/properties/:id/reject',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
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
  }
);

// ─── Suspend Property ──────────────────────────────────────────────────────────

router.post(
  '/properties/:id/suspend',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    await db.update('Property', { id: req.params.id }, {
      status: PropertyStatus.SUSPENDED,
      updatedAt: new Date().toISOString(),
    });
    res.json({ success: true, message: 'Property suspended' });
  }
);

// ─── Flagged Reviews ──────────────────────────────────────────────────────────

router.get(
  '/reviews/flagged',
  authenticate,
  requireSuperAdmin,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    const reviews = await db.select<ReviewRow>(
      'Review',
      { status: ReviewStatus.FLAGGED },
      { order: 'updatedAt.asc' }
    );

    res.json({ success: true, data: reviews });
  }
);

// ─── Moderate Review ──────────────────────────────────────────────────────────

router.post(
  '/reviews/:id/moderate',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
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
  }
);

// ─── Platform Stats ────────────────────────────────────────────────────────────

router.get(
  '/stats',
  authenticate,
  requireSuperAdmin,
  async (_req: AuthRequest, res: Response): Promise<void> => {
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
  }
);

export default router;
