import { Router, Response } from 'express';
import { PrismaClient, PropertyStatus, ReviewStatus } from '@prisma/client';
import { authenticate, requireSuperAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// ─── Pending Properties ────────────────────────────────────────────────────────

router.get(
  '/properties/pending',
  authenticate,
  requireSuperAdmin,
  async (_req: AuthRequest, res: Response): Promise<void> => {
    const properties = await prisma.property.findMany({
      where: { status: PropertyStatus.PENDING_VERIFICATION },
      include: {
        users: {
          where: { role: 'PROPERTY_ADMIN' },
          select: { id: true, email: true, firstName: true, lastName: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json({ success: true, data: properties });
  }
);

// ─── All Properties ────────────────────────────────────────────────────────────

router.get(
  '/properties',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
    const status = req.query.status as PropertyStatus | undefined;

    const [properties, total] = await Promise.all([
      prisma.property.findMany({
        where: status ? { status } : undefined,
        include: {
          users: { select: { id: true, email: true, role: true } },
          _count: { select: { reviews: true, bookings: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.property.count({ where: status ? { status } : undefined }),
    ]);

    res.json({
      success: true,
      data: properties,
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
    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: {
        status: PropertyStatus.ACTIVE,
        verifiedAt: new Date(),
        verifiedBy: req.user!.id,
      },
      include: {
        users: {
          where: { role: 'PROPERTY_ADMIN' },
          select: { email: true, firstName: true },
        },
      },
    });

    // Notify the property admin
    const admin = property.users[0];
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

    const property = await prisma.property.update({
      where: { id: req.params.id },
      data: {
        status: PropertyStatus.REJECTED,
        rejectionReason: reason || 'Did not meet verification requirements',
        verifiedBy: req.user!.id,
      },
      include: {
        users: {
          where: { role: 'PROPERTY_ADMIN' },
          select: { email: true, firstName: true },
        },
      },
    });

    const admin = property.users[0];
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
    await prisma.property.update({
      where: { id: req.params.id },
      data: { status: PropertyStatus.SUSPENDED },
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
    const reviews = await prisma.review.findMany({
      where: { status: ReviewStatus.FLAGGED },
      include: {
        guest: { select: { id: true, firstName: true, lastName: true } },
        property: { select: { id: true, name: true } },
        reviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { updatedAt: 'asc' },
    });

    res.json({ success: true, data: reviews });
  }
);

// ─── Moderate Review ──────────────────────────────────────────────────────────

router.post(
  '/reviews/:id/moderate',
  authenticate,
  requireSuperAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { action } = req.body; // 'approve' | 'remove'

    const newStatus =
      action === 'approve' ? ReviewStatus.PUBLISHED : ReviewStatus.REMOVED;

    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: {
        status: newStatus,
        moderatedAt: new Date(),
        moderatedBy: req.user!.id,
      },
    });

    // Refresh guest score if removed
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
      prisma.property.count({ where: { status: PropertyStatus.ACTIVE } }),
      prisma.property.count({ where: { status: PropertyStatus.PENDING_VERIFICATION } }),
      prisma.guest.count(),
      prisma.review.count({ where: { status: ReviewStatus.PUBLISHED } }),
      prisma.review.count({ where: { status: ReviewStatus.FLAGGED } }),
      prisma.guest.count({ where: { riskLevel: 'HIGH_RISK' } }),
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
