import { Router, Response } from 'express';
import { body, query, validationResult } from 'express-validator';
import crypto from 'crypto';
import { RiskLevel, ReviewStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { calculateRiskLevel } from '../utils/riskScore';
import { db } from '../lib/supabase';

const router = Router();

interface GuestRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  idType: string | null;
  idLast4: string | null;
  profileImage: string | null;
  notes: string | null;
  averageRating: number | null;
  totalReviews: number;
  riskLevel: RiskLevel;
  createdAt: string;
  updatedAt: string;
}

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
  createdAt: string;
}

interface BookingRow {
  id: string;
  guestId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  status: string;
  source: string;
}

interface PropertyRow {
  id: string;
  name: string;
  type: string;
  city: string;
  country: string;
  logoUrl: string | null;
}

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
    const offset = (page - 1) * limit;

    const orFilter = [
      `firstName.ilike.*${searchTerm}*`,
      `lastName.ilike.*${searchTerm}*`,
      `email.ilike.*${searchTerm}*`,
      `phone.ilike.*${searchTerm}*`,
    ].join(',');

    const { data: guests, total } = await db.selectAndCount<GuestRow>(
      'Guest',
      {},
      {
        or: orFilter,
        select: 'id,firstName,lastName,email,phone,nationality,averageRating,totalReviews,riskLevel,profileImage',
        order: 'totalReviews.desc',
        limit,
        offset,
      }
    );

    res.json({
      success: true,
      data: guests,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }
);

// ─── Get Guest Profile ────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { id } = req.params;
  const propertyId = req.user!.propertyId;

  const guest = await db.selectOne<GuestRow>('Guest', { id });

  if (!guest) {
    res.status(404).json({ success: false, message: 'Guest not found' });
    return;
  }

  const [phoneNumbers, reviews, bookings] = await Promise.all([
    db.select<{ number: string; isPrimary: boolean }>(
      'GuestPhone',
      { guestId: id },
      { select: 'number,isPrimary' }
    ),
    db.select<ReviewRow>(
      'Review',
      { guestId: id, status: ReviewStatus.PUBLISHED },
      { order: 'createdAt.desc' }
    ),
    db.select<BookingRow>(
      'Booking',
      propertyId ? { guestId: id, propertyId } : { guestId: id },
      { select: 'id,checkIn,checkOut,status,source', order: 'checkIn.desc', limit: 5 }
    ),
  ]);

  // Fetch properties for the reviews
  const reviewPropertyIds = Array.from(new Set(reviews.map((r) => r.propertyId)));
  const properties = reviewPropertyIds.length
    ? await db.select<PropertyRow>(
        'Property',
        { id: { in: reviewPropertyIds } },
        { select: 'id,name,type,city,country,logoUrl' }
      )
    : [];
  const propertyById = new Map(properties.map((p) => [p.id, p]));

  const reviewsWithPrivacy = reviews.map((r) => ({
    ...r,
    property: propertyById.get(r.propertyId) ?? null,
    privateNote: r.propertyId === propertyId ? r.privateNote : undefined,
  }));

  res.json({
    success: true,
    data: {
      ...guest,
      phoneNumbers,
      reviews: reviewsWithPrivacy,
      bookings,
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

    let guest: GuestRow | null = null;
    if (email) {
      guest = await db.selectOne<GuestRow>('Guest', { email });
    }
    if (!guest && phone) {
      guest = await db.selectOne<GuestRow>('Guest', { phone });
    }

    if (guest) {
      res.json({ success: true, data: guest, isExisting: true });
      return;
    }

    const now = new Date().toISOString();
    guest = await db.insert<GuestRow>('Guest', {
      id: crypto.randomBytes(12).toString('base64url'),
      firstName,
      lastName,
      email: email ?? null,
      phone: phone ?? null,
      nationality: nationality ?? null,
      idType: idType ?? null,
      idLast4: idLast4 ?? null,
      totalReviews: 0,
      riskLevel: RiskLevel.UNREVIEWED,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ success: true, data: guest, isExisting: false });
  }
);

// ─── Lookup Guest by Phone ────────────────────────────────────────────────────

router.get(
  '/lookup/phone/:number',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { number } = req.params;
    const normalized = number.replace(/\D/g, '');
    if (normalized.length < 7) {
      res.status(400).json({ success: false, message: 'Phone number must contain at least 7 digits' });
      return;
    }

    const [directMatches, phoneRecords] = await Promise.all([
      db.select<GuestRow>('Guest', { phone: { ilike: `*${normalized}*` } }, { limit: 5 }),
      db.select<{ guestId: string }>('GuestPhone', { number: { ilike: `*${normalized}*` } }, { select: 'guestId', limit: 10 }),
    ]);

    const extraIds = phoneRecords.map((p) => p.guestId).filter((gid) => !directMatches.find((g) => g.id === gid));
    const extra = extraIds.length
      ? await db.select<GuestRow>('Guest', { id: { in: extraIds } })
      : [];

    const guests = [...directMatches, ...extra].slice(0, 5);

    const reviewsByGuest: Record<string, unknown[]> = {};
    if (guests.length) {
      const guestIds = guests.map((g) => g.id);
      const reviews = await db.select<ReviewRow & { property?: PropertyRow }>(
        'Review',
        { guestId: { in: guestIds }, status: ReviewStatus.PUBLISHED },
        { order: 'createdAt.desc' }
      );
      const propertyIds = Array.from(new Set(reviews.map((r) => r.propertyId)));
      const properties = propertyIds.length
        ? await db.select<PropertyRow>('Property', { id: { in: propertyIds } }, { select: 'id,name,city' })
        : [];
      const pById = new Map(properties.map((p) => [p.id, p]));
      for (const r of reviews) {
        const list = reviewsByGuest[r.guestId] ?? (reviewsByGuest[r.guestId] = []);
        if (list.length < 3) {
          list.push({
            overallRating: r.overallRating,
            publicComment: r.publicComment,
            wouldWelcomeBack: r.wouldWelcomeBack,
            createdAt: r.createdAt,
            property: pById.get(r.propertyId) ?? null,
          });
        }
      }
    }

    const enriched = guests.map((g) => ({ ...g, reviews: reviewsByGuest[g.id] ?? [] }));

    res.json({
      success: true,
      data: enriched,
      message: enriched.length === 0 ? 'No guest found with this phone number' : undefined,
    });
  }
);

// ─── Update Guest ─────────────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { id } = req.params;
    const propertyId = req.user!.propertyId;

    if (propertyId && req.user!.role !== 'SUPER_ADMIN') {
      const booking = await db.selectOne<BookingRow>(
        'Booking',
        { guestId: id, propertyId },
        { select: 'id' }
      );
      if (!booking) {
        res.status(403).json({ success: false, message: 'You can only update guests your property has hosted' });
        return;
      }
    }

    const { firstName, lastName, email, phone, nationality, notes } = req.body;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (firstName) patch.firstName = firstName;
    if (lastName) patch.lastName = lastName;
    if (email) patch.email = email;
    if (phone) patch.phone = phone;
    if (nationality) patch.nationality = nationality;
    if (notes !== undefined) patch.notes = notes;

    const guest = await db.updateOne<GuestRow>('Guest', { id }, patch);

    if (!guest) {
      res.status(404).json({ success: false, message: 'Guest not found' });
      return;
    }

    res.json({ success: true, data: guest });
  }
);

// ─── Recalculate Guest Risk Score ─────────────────────────────────────────────

export async function refreshGuestScore(guestId: string): Promise<void> {
  const reviews = await db.select<{ overallRating: number }>(
    'Review',
    { guestId, status: ReviewStatus.PUBLISHED },
    { select: 'overallRating' }
  );

  const now = new Date().toISOString();

  if (reviews.length === 0) {
    await db.update('Guest', { id: guestId }, {
      averageRating: null,
      totalReviews: 0,
      riskLevel: RiskLevel.UNREVIEWED,
      updatedAt: now,
    });
    return;
  }

  const average = reviews.reduce((sum, r) => sum + r.overallRating, 0) / reviews.length;
  const riskLevel = calculateRiskLevel(average);

  await db.update('Guest', { id: guestId }, {
    averageRating: Math.round(average * 10) / 10,
    totalReviews: reviews.length,
    riskLevel,
    updatedAt: now,
  });
}

export default router;
