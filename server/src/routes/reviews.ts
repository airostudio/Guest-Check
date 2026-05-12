import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { ReviewStatus } from '@prisma/client';
import { authenticate, requirePropertyAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import { refreshGuestScore } from './guests';
import prisma from '../lib/prisma';

const router = Router();

// ─── Create Review ────────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  [
    body('guestId').notEmpty(),
    body('overallRating').isInt({ min: 0, max: 6 }),
    body('cleanliness').optional().isInt({ min: 0, max: 6 }),
    body('communication').optional().isInt({ min: 0, max: 6 }),
    body('ruleAdherence').optional().isInt({ min: 0, max: 6 }),
    body('noiseLevel').optional().isInt({ min: 0, max: 6 }),
    body('propertyRespect').optional().isInt({ min: 0, max: 6 }),
    body('publicComment').optional().trim().isLength({ max: 2000 }),
    body('privateNote').optional().trim().isLength({ max: 2000 }),
    body('wouldWelcomeBack').optional().isBoolean(),
    body('stayMonth').optional().isInt({ min: 1, max: 12 }),
    body('stayYear').optional().isInt({ min: 2000, max: 2100 }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const {
      guestId, bookingId, overallRating, cleanliness, communication,
      ruleAdherence, noiseLevel, propertyRespect, publicComment,
      privateNote, wouldWelcomeBack, stayMonth, stayYear,
    } = req.body;

    const propertyId = req.user!.propertyId;
    if (!propertyId) {
      res.status(400).json({ success: false, message: 'You must be associated with a property to leave reviews' });
      return;
    }

    // Check guest exists
    const guest = await prisma.guest.findUnique({ where: { id: guestId } });
    if (!guest) {
      res.status(404).json({ success: false, message: 'Guest not found' });
      return;
    }

    // Prevent duplicate reviews for same booking
    if (bookingId) {
      const existing = await prisma.review.findFirst({
        where: { bookingId, reviewerId: req.user!.id },
      });
      if (existing) {
        res.status(409).json({ success: false, message: 'You have already reviewed this booking' });
        return;
      }
    }

    // Verify booking belongs to this property (if provided)
    let isVerifiedStay = false;
    if (bookingId) {
      const booking = await prisma.booking.findFirst({
        where: { id: bookingId, guestId, propertyId },
      });
      isVerifiedStay = !!booking;
    }

    const review = await prisma.review.create({
      data: {
        guestId,
        propertyId,
        reviewerId: req.user!.id,
        bookingId: bookingId || null,
        overallRating,
        cleanliness: cleanliness ?? null,
        communication: communication ?? null,
        ruleAdherence: ruleAdherence ?? null,
        noiseLevel: noiseLevel ?? null,
        propertyRespect: propertyRespect ?? null,
        publicComment: publicComment || null,
        privateNote: privateNote || null,
        wouldWelcomeBack: wouldWelcomeBack ?? null,
        stayMonth: stayMonth ?? null,
        stayYear: stayYear ?? null,
        isVerifiedStay,
      },
      include: {
        guest: { select: { id: true, firstName: true, lastName: true } },
        property: { select: { id: true, name: true } },
      },
    });

    // Refresh guest aggregate score asynchronously
    refreshGuestScore(guestId).catch(console.error);

    res.status(201).json({ success: true, data: review });
  }
);

// ─── Get Review ───────────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const review = await prisma.review.findUnique({
    where: { id: req.params.id },
    include: {
      guest: { select: { id: true, firstName: true, lastName: true, riskLevel: true } },
      property: { select: { id: true, name: true, city: true, country: true } },
      reviewer: { select: { id: true, firstName: true, lastName: true } },
    },
  });

  if (!review) {
    res.status(404).json({ success: false, message: 'Review not found' });
    return;
  }

  // Only show private note to the reviewing property
  const sanitized = {
    ...review,
    privateNote:
      review.propertyId === req.user!.propertyId || req.user!.role === 'SUPER_ADMIN'
        ? review.privateNote
        : undefined,
  };

  res.json({ success: true, data: sanitized });
});

// ─── List Reviews by Property ────────────────────────────────────────────────

router.get(
  '/property/mine',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const propertyId = req.user!.propertyId;
    if (!propertyId) {
      res.status(400).json({ success: false, message: 'No property associated' });
      return;
    }

    const page = parseInt(req.query.page as string || '1', 10);
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where: { propertyId, status: ReviewStatus.PUBLISHED },
        include: {
          guest: {
            select: {
              id: true, firstName: true, lastName: true,
              nationality: true, averageRating: true, riskLevel: true,
            },
          },
          reviewer: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.review.count({ where: { propertyId, status: ReviewStatus.PUBLISHED } }),
    ]);

    res.json({
      success: true,
      data: reviews,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }
);

// ─── Update Review ────────────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });

    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found' });
      return;
    }

    // Only the reviewer or property admin can edit, and only within 30 days
    const isReviewer = review.reviewerId === req.user!.id;
    const isPropertyAdmin =
      review.propertyId === req.user!.propertyId && req.user!.role === 'PROPERTY_ADMIN';
    const withinEditWindow =
      new Date().getTime() - review.createdAt.getTime() < 30 * 24 * 60 * 60 * 1000;

    if (!isReviewer && !isPropertyAdmin) {
      res.status(403).json({ success: false, message: 'You cannot edit this review' });
      return;
    }

    if (!withinEditWindow && req.user!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Reviews can only be edited within 30 days' });
      return;
    }

    const {
      overallRating, cleanliness, communication, ruleAdherence,
      noiseLevel, propertyRespect, publicComment, privateNote, wouldWelcomeBack,
    } = req.body;

    const updated = await prisma.review.update({
      where: { id: review.id },
      data: {
        ...(overallRating !== undefined && { overallRating }),
        ...(cleanliness !== undefined && { cleanliness }),
        ...(communication !== undefined && { communication }),
        ...(ruleAdherence !== undefined && { ruleAdherence }),
        ...(noiseLevel !== undefined && { noiseLevel }),
        ...(propertyRespect !== undefined && { propertyRespect }),
        ...(publicComment !== undefined && { publicComment }),
        ...(privateNote !== undefined && { privateNote }),
        ...(wouldWelcomeBack !== undefined && { wouldWelcomeBack }),
      },
    });

    refreshGuestScore(review.guestId).catch(console.error);

    res.json({ success: true, data: updated });
  }
);

// ─── Flag Review ───────────────────────────────────────────────────────────────

router.post(
  '/:id/flag',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { reason } = req.body;

    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found' });
      return;
    }

    if (review.propertyId !== req.user!.propertyId && req.user!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await prisma.review.update({
      where: { id: review.id },
      data: {
        status: ReviewStatus.FLAGGED,
        flagReason: reason || 'Flagged for review',
      },
    });

    res.json({ success: true, message: 'Review flagged for moderation' });
  }
);

// ─── Property review stats ────────────────────────────────────────────────────

router.get(
  '/stats/mine',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const propertyId = req.user!.propertyId;
    if (!propertyId) {
      res.status(400).json({ success: false, message: 'No property associated' });
      return;
    }

    const [total, avgResult, riskBreakdown, recentActivity] = await Promise.all([
      prisma.review.count({ where: { propertyId, status: ReviewStatus.PUBLISHED } }),
      prisma.review.aggregate({
        where: { propertyId, status: ReviewStatus.PUBLISHED },
        _avg: { overallRating: true, cleanliness: true, communication: true, ruleAdherence: true },
      }),
      prisma.guest.groupBy({
        by: ['riskLevel'],
        where: {
          reviews: { some: { propertyId, status: ReviewStatus.PUBLISHED } },
        },
        _count: { riskLevel: true },
      }),
      prisma.review.findMany({
        where: { propertyId, status: ReviewStatus.PUBLISHED },
        select: {
          id: true,
          overallRating: true,
          publicComment: true,
          createdAt: true,
          guest: { select: { id: true, firstName: true, lastName: true, riskLevel: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalReviews: total,
        averages: avgResult._avg,
        riskBreakdown,
        recentActivity,
      },
    });
  }
);

export default router;
