import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { ReviewStatus, SubscriptionTier } from '../types/enums';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { refreshGuestScore } from './guests';
import { db } from '../lib/supabase';
import { parsePagination, totalPages } from '../utils/pagination';
import config from '../config/config';

function planLimits(tier: SubscriptionTier | undefined) {
  switch (tier) {
    case SubscriptionTier.ENTERPRISE:   return config.plans.enterprise;
    case SubscriptionTier.PROFESSIONAL: return config.plans.professional;
    case SubscriptionTier.BASIC:        return config.plans.basic;
    default:                            return config.plans.freeTrial;
  }
}

const router = Router();

interface ReviewRow {
  id: string;
  guestId: string;
  propertyId: string;
  reviewerId: string;
  bookingId: string | null;
  overallRating: number;
  cleanliness: number | null;
  communication: number | null;
  ruleAdherence: number | null;
  noiseLevel: number | null;
  propertyRespect: number | null;
  publicComment: string | null;
  privateNote: string | null;
  wouldWelcomeBack: boolean | null;
  stayMonth: number | null;
  stayYear: number | null;
  isVerifiedStay: boolean;
  status: ReviewStatus;
  flagReason: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GuestRef {
  id: string;
  firstName: string;
  lastName: string;
  nationality?: string | null;
  averageRating?: number | null;
  riskLevel?: string;
}

interface PropertyRef {
  id: string;
  name: string;
  city?: string;
  country?: string;
}

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
}

interface BookingRow {
  id: string;
  guestId: string;
  propertyId: string;
}

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

    const limits = planLimits(req.user!.subscriptionTier);
    if (limits.reviewsPerMonth !== -1) {
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const monthCount = await db.count('Review', {
        propertyId,
        createdAt: { gte: startOfMonth.toISOString() },
      });
      if (monthCount >= limits.reviewsPerMonth) {
        res.status(429).json({
          success: false,
          message: `You've used all ${limits.reviewsPerMonth} reviews this month on your current plan. Upgrade to continue.`,
        });
        return;
      }
    }

    const guest = await db.selectOne<GuestRef>('Guest', { id: guestId }, { select: 'id,firstName,lastName' });
    if (!guest) {
      res.status(404).json({ success: false, message: 'Guest not found' });
      return;
    }

    if (bookingId) {
      const existing = await db.selectOne<ReviewRow>('Review', { bookingId, reviewerId: req.user!.id });
      if (existing) {
        res.status(409).json({ success: false, message: 'You have already reviewed this booking' });
        return;
      }
    }

    let isVerifiedStay = false;
    if (bookingId) {
      const booking = await db.selectOne<BookingRow>('Booking', { id: bookingId, guestId, propertyId });
      isVerifiedStay = !!booking;
    }

    const now = new Date().toISOString();
    const review = await db.insert<ReviewRow>('Review', {
      id: crypto.randomBytes(12).toString('base64url'),
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
      status: ReviewStatus.PUBLISHED,
      createdAt: now,
      updatedAt: now,
    });

    const property = await db.selectOne<PropertyRef>('Property', { id: propertyId }, { select: 'id,name' });

    refreshGuestScore(guestId).catch(console.error);

    res.status(201).json({ success: true, data: { ...review, guest, property } });
  }
);

// ─── Get Review ───────────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const review = await db.selectOne<ReviewRow>('Review', { id: req.params.id });

  if (!review) {
    res.status(404).json({ success: false, message: 'Review not found' });
    return;
  }

  const [guest, property, reviewer] = await Promise.all([
    db.selectOne<GuestRef>('Guest', { id: review.guestId }, { select: 'id,firstName,lastName,riskLevel' }),
    db.selectOne<PropertyRef>('Property', { id: review.propertyId }, { select: 'id,name,city,country' }),
    db.selectOne<UserRef>('User', { id: review.reviewerId }, { select: 'id,firstName,lastName' }),
  ]);

  const sanitized = {
    ...review,
    guest,
    property,
    reviewer,
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

    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>, 20, 50);

    const { data: reviews, total } = await db.selectAndCount<ReviewRow>(
      'Review',
      { propertyId, status: ReviewStatus.PUBLISHED },
      { order: 'createdAt.desc', limit, offset: (page - 1) * limit }
    );

    const guestIds = Array.from(new Set(reviews.map((r) => r.guestId)));
    const reviewerIds = Array.from(new Set(reviews.map((r) => r.reviewerId)));

    const [guests, reviewers] = await Promise.all([
      guestIds.length
        ? db.select<GuestRef>('Guest', { id: { in: guestIds } }, { select: 'id,firstName,lastName,nationality,averageRating,riskLevel' })
        : Promise.resolve([] as GuestRef[]),
      reviewerIds.length
        ? db.select<UserRef>('User', { id: { in: reviewerIds } }, { select: 'id,firstName,lastName' })
        : Promise.resolve([] as UserRef[]),
    ]);

    const gById = new Map(guests.map((g) => [g.id, g]));
    const uById = new Map(reviewers.map((u) => [u.id, u]));

    const enriched = reviews.map((r) => ({
      ...r,
      guest: gById.get(r.guestId) ?? null,
      reviewer: uById.get(r.reviewerId) ?? null,
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: { page, limit, total, totalPages: totalPages(total, limit) },
    });
  }
);

// ─── Update Review ────────────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const review = await db.selectOne<ReviewRow>('Review', { id: req.params.id });

    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found' });
      return;
    }

    const isReviewer = review.reviewerId === req.user!.id;
    const isPropertyAdmin =
      review.propertyId === req.user!.propertyId && req.user!.role === 'PROPERTY_ADMIN';
    const withinEditWindow =
      Date.now() - new Date(review.createdAt).getTime() < 30 * 24 * 60 * 60 * 1000;

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

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (overallRating !== undefined) patch.overallRating = overallRating;
    if (cleanliness !== undefined) patch.cleanliness = cleanliness;
    if (communication !== undefined) patch.communication = communication;
    if (ruleAdherence !== undefined) patch.ruleAdherence = ruleAdherence;
    if (noiseLevel !== undefined) patch.noiseLevel = noiseLevel;
    if (propertyRespect !== undefined) patch.propertyRespect = propertyRespect;
    if (publicComment !== undefined) patch.publicComment = publicComment;
    if (privateNote !== undefined) patch.privateNote = privateNote;
    if (wouldWelcomeBack !== undefined) patch.wouldWelcomeBack = wouldWelcomeBack;

    const updated = await db.updateOne<ReviewRow>('Review', { id: review.id }, patch);

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

    const review = await db.selectOne<ReviewRow>('Review', { id: req.params.id });
    if (!review) {
      res.status(404).json({ success: false, message: 'Review not found' });
      return;
    }

    if (review.propertyId !== req.user!.propertyId && req.user!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    await db.update('Review', { id: review.id }, {
      status: ReviewStatus.FLAGGED,
      flagReason: reason || 'Flagged for review',
      updatedAt: new Date().toISOString(),
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

    const reviews = await db.select<ReviewRow>(
      'Review',
      { propertyId, status: ReviewStatus.PUBLISHED },
      { select: 'id,overallRating,cleanliness,communication,ruleAdherence,publicComment,createdAt,guestId' }
    );

    const total = reviews.length;
    const avg = (key: keyof ReviewRow) => {
      const vals = reviews.map((r) => r[key]).filter((v): v is number => typeof v === 'number');
      return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    };

    const recent = [...reviews]
      .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1))
      .slice(0, 5);
    const recentGuestIds = Array.from(new Set(recent.map((r) => r.guestId)));
    const recentGuests = recentGuestIds.length
      ? await db.select<GuestRef>('Guest', { id: { in: recentGuestIds } }, { select: 'id,firstName,lastName,riskLevel' })
      : [];
    const gById = new Map(recentGuests.map((g) => [g.id, g]));

    const allGuestIds = Array.from(new Set(reviews.map((r) => r.guestId)));
    const guestRiskRows = allGuestIds.length
      ? await db.select<{ riskLevel: string }>('Guest', { id: { in: allGuestIds } }, { select: 'riskLevel' })
      : [];
    const riskBreakdown = guestRiskRows.reduce<Record<string, number>>((acc, g) => {
      acc[g.riskLevel] = (acc[g.riskLevel] ?? 0) + 1;
      return acc;
    }, {});

    res.json({
      success: true,
      data: {
        totalReviews: total,
        averages: {
          overallRating: avg('overallRating'),
          cleanliness: avg('cleanliness'),
          communication: avg('communication'),
          ruleAdherence: avg('ruleAdherence'),
        },
        riskBreakdown: Object.entries(riskBreakdown).map(([riskLevel, count]) => ({ riskLevel, _count: { riskLevel: count } })),
        recentActivity: recent.map((r) => ({
          id: r.id,
          overallRating: r.overallRating,
          publicComment: r.publicComment,
          createdAt: r.createdAt,
          guest: gById.get(r.guestId) ?? null,
        })),
      },
    });
  }
);

export default router;
