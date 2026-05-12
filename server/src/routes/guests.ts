import { Router, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import { RiskLevel, ReviewStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { calculateRiskLevel } from '../utils/riskScore';
import prisma from '../lib/prisma';

const router = Router();

// ─── Search Guests ────────────────────────────────────────────────────────────

router.get(
  '/search',
  authenticate,
  [query('q').trim().isLength({ min: 2 })],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const searchTerm = req.query.q as string;
    const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
    const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 50);
    const skip = (page - 1) * limit;

    const [guests, total] = await Promise.all([
      prisma.guest.findMany({
        where: {
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
          ],
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          nationality: true,
          averageRating: true,
          totalReviews: true,
          riskLevel: true,
          profileImage: true,
        },
        skip,
        take: limit,
        orderBy: { totalReviews: 'desc' },
      }),
      prisma.guest.count({
        where: {
          OR: [
            { firstName: { contains: searchTerm, mode: 'insensitive' } },
            { lastName: { contains: searchTerm, mode: 'insensitive' } },
            { email: { contains: searchTerm, mode: 'insensitive' } },
            { phone: { contains: searchTerm } },
          ],
        },
      }),
    ]);

    res.json({
      success: true,
      data: guests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  }
);

// ─── Get Guest Profile ────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const propertyId = req.user!.propertyId;

  const guest = await prisma.guest.findUnique({
    where: { id },
    include: {
      phoneNumbers: { select: { number: true, isPrimary: true } },
      reviews: {
        where: { status: ReviewStatus.PUBLISHED },
        select: {
          id: true,
          overallRating: true,
          cleanliness: true,
          communication: true,
          ruleAdherence: true,
          noiseLevel: true,
          propertyRespect: true,
          publicComment: true,
          // Always fetch privateNote — filtered per-property in post-processing below
          privateNote: true,
          wouldWelcomeBack: true,
          stayMonth: true,
          stayYear: true,
          isVerifiedStay: true,
          createdAt: true,
          property: {
            select: {
              id: true,
              name: true,
              type: true,
              city: true,
              country: true,
              logoUrl: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      },
      bookings: {
        where: { propertyId: propertyId ?? undefined },
        select: {
          id: true,
          checkIn: true,
          checkOut: true,
          status: true,
          source: true,
        },
        orderBy: { checkIn: 'desc' },
        take: 5,
      },
    },
  });

  if (!guest) {
    res.status(404).json({ success: false, message: 'Guest not found' });
    return;
  }

  // Filter private notes: only show own property's private note
  const reviewsWithPrivacy = guest.reviews.map((review) => ({
    ...review,
    privateNote: review.property?.id === propertyId ? review.privateNote : undefined,
  }));

  res.json({
    success: true,
    data: {
      ...guest,
      reviews: reviewsWithPrivacy,
    },
  });
});

// ─── Create or Find Guest ────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  [
    body('firstName').trim().isLength({ min: 2 }),
    body('lastName').trim().isLength({ min: 2 }),
    body('email').optional().isEmail().normalizeEmail(),
    body('phone').optional().isMobilePhone('any'),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { firstName, lastName, email, phone, nationality, idType, idLast4 } = req.body;

    // Try to find existing guest by email or phone
    let guest = null;
    if (email) {
      guest = await prisma.guest.findFirst({ where: { email } });
    }
    if (!guest && phone) {
      guest = await prisma.guest.findFirst({ where: { phone } });
    }

    if (guest) {
      res.json({ success: true, data: guest, isExisting: true });
      return;
    }

    guest = await prisma.guest.create({
      data: {
        firstName,
        lastName,
        email,
        phone,
        nationality,
        idType,
        idLast4,
        riskLevel: RiskLevel.UNREVIEWED,
      },
    });

    res.status(201).json({ success: true, data: guest, isExisting: false });
  }
);

// ─── Lookup Guest by Phone ────────────────────────────────────────────────────
// Used for reception caller ID integration

router.get(
  '/lookup/phone/:number',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { number } = req.params;
    // Normalize phone number (strip non-digits for flexible matching)
    const normalized = number.replace(/\D/g, '');
    if (normalized.length < 7) {
      res.status(400).json({ success: false, message: 'Phone number must contain at least 7 digits' });
      return;
    }

    const guests = await prisma.guest.findMany({
      where: {
        OR: [
          { phone: { contains: normalized } },
          { phoneNumbers: { some: { number: { contains: normalized } } } },
        ],
      },
      include: {
        reviews: {
          where: { status: ReviewStatus.PUBLISHED },
          select: {
            overallRating: true,
            publicComment: true,
            wouldWelcomeBack: true,
            property: { select: { name: true, city: true } },
            createdAt: true,
          },
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
      take: 5,
    });

    res.json({
      success: true,
      data: guests,
      message: guests.length === 0 ? 'No guest found with this phone number' : undefined,
    });
  }
);

// ─── Update Guest (merge/correct data) ───────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const propertyId = req.user!.propertyId;

    // Only allow updating guests the property has hosted
    if (propertyId && req.user!.role !== 'SUPER_ADMIN') {
      const booking = await prisma.booking.findFirst({
        where: { guestId: id, propertyId },
        select: { id: true },
      });
      if (!booking) {
        res.status(403).json({ success: false, message: 'You can only update guests your property has hosted' });
        return;
      }
    }

    const { firstName, lastName, email, phone, nationality, notes } = req.body;

    const guest = await prisma.guest.update({
      where: { id },
      data: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(email && { email }),
        ...(phone && { phone }),
        ...(nationality && { nationality }),
        ...(notes !== undefined && { notes }),
      },
    });

    res.json({ success: true, data: guest });
  }
);

// ─── Recalculate Guest Risk Score ─────────────────────────────────────────────

export async function refreshGuestScore(guestId: string): Promise<void> {
  const reviews = await prisma.review.findMany({
    where: { guestId, status: ReviewStatus.PUBLISHED },
    select: { overallRating: true },
  });

  if (reviews.length === 0) {
    await prisma.guest.update({
      where: { id: guestId },
      data: { averageRating: null, totalReviews: 0, riskLevel: RiskLevel.UNREVIEWED },
    });
    return;
  }

  const average = reviews.reduce((sum: number, r: { overallRating: number }) => sum + r.overallRating, 0) / reviews.length;
  const riskLevel = calculateRiskLevel(average);

  await prisma.guest.update({
    where: { id: guestId },
    data: {
      averageRating: Math.round(average * 10) / 10,
      totalReviews: reviews.length,
      riskLevel,
    },
  });
}

export default router;
