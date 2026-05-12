import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import crypto from 'crypto';
import { BookingSource, BookingStatus, RiskLevel } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db, Filter } from '../lib/supabase';

const router = Router();

interface BookingRow {
  id: string;
  guestId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  roomNumber: string | null;
  numberOfGuests: number;
  totalAmount: number | null;
  currency: string | null;
  source: BookingSource;
  externalId: string | null;
  externalUrl: string | null;
  status: BookingStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GuestRef {
  id: string;
  firstName: string;
  lastName: string;
  nationality?: string | null;
  averageRating?: number | null;
  totalReviews?: number;
  riskLevel: RiskLevel;
  profileImage?: string | null;
}

interface ReviewRef {
  id: string;
  overallRating: number;
  bookingId: string | null;
  reviewerId?: string;
}

interface UserRef {
  id: string;
  firstName: string;
  lastName: string;
}

async function attachGuests<T extends { guestId: string }>(rows: T[], select: string): Promise<(T & { guest: GuestRef | null })[]> {
  if (rows.length === 0) return [];
  const ids = Array.from(new Set(rows.map((r) => r.guestId)));
  const guests = await db.select<GuestRef>('Guest', { id: { in: ids } }, { select });
  const byId = new Map(guests.map((g) => [g.id, g]));
  return rows.map((r) => ({ ...r, guest: byId.get(r.guestId) ?? null }));
}

// ─── Create Booking ──────────────────────────────────────────────────────────

router.post(
  '/',
  authenticate,
  [
    body('guestId').notEmpty(),
    body('checkIn').isISO8601(),
    body('checkOut').isISO8601().custom((value, { req }) => {
      if (new Date(value) <= new Date(req.body.checkIn)) {
        throw new Error('checkOut must be after checkIn');
      }
      return true;
    }),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const {
      guestId, checkIn, checkOut, roomNumber, numberOfGuests,
      totalAmount, currency, source, externalId, externalUrl, notes,
    } = req.body;

    const propertyId = req.user!.propertyId;
    if (!propertyId) {
      res.status(400).json({ success: false, message: 'No property associated' });
      return;
    }

    const now = new Date().toISOString();
    const booking = await db.insert<BookingRow>('Booking', {
      id: crypto.randomBytes(12).toString('base64url'),
      guestId,
      propertyId,
      checkIn: new Date(checkIn).toISOString(),
      checkOut: new Date(checkOut).toISOString(),
      roomNumber: roomNumber || null,
      numberOfGuests: numberOfGuests || 1,
      totalAmount: totalAmount || null,
      currency: currency || 'USD',
      source: source || BookingSource.MANUAL,
      externalId: externalId || null,
      externalUrl: externalUrl || null,
      notes: notes || null,
      status: BookingStatus.CONFIRMED,
      createdAt: now,
      updatedAt: now,
    });

    const guest = await db.selectOne<GuestRef>('Guest', { id: guestId }, { select: 'id,firstName,lastName,riskLevel' });

    res.status(201).json({ success: true, data: { ...booking, guest } });
  }
);

// ─── List Bookings ───────────────────────────────────────────────────────────

router.get('/', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const propertyId = req.user!.propertyId;
  if (!propertyId) {
    res.status(400).json({ success: false, message: 'No property associated' });
    return;
  }

  const page = Math.max(1, parseInt(req.query.page as string || '1', 10));
  const limit = Math.min(parseInt(req.query.limit as string || '20', 10), 100);
  const status = req.query.status as BookingStatus | undefined;
  const upcoming = req.query.upcoming === 'true';

  const filters: Record<string, Filter> = { propertyId };
  if (status && Object.values(BookingStatus).includes(status)) filters.status = status;
  if (upcoming) {
    filters.checkIn = { gte: new Date() };
    filters.status = BookingStatus.CONFIRMED;
  }

  const { data: bookings, total } = await db.selectAndCount<BookingRow>(
    'Booking',
    filters,
    { order: 'checkIn.desc', limit, offset: (page - 1) * limit }
  );

  const withGuests = await attachGuests(bookings, 'id,firstName,lastName,nationality,averageRating,riskLevel,profileImage');

  const bookingIds = bookings.map((b) => b.id);
  const reviews = bookingIds.length
    ? await db.select<ReviewRef>('Review', { bookingId: { in: bookingIds } }, { select: 'id,overallRating,bookingId' })
    : [];
  const reviewsByBooking = new Map<string, ReviewRef[]>();
  for (const r of reviews) {
    if (!r.bookingId) continue;
    const arr = reviewsByBooking.get(r.bookingId) ?? [];
    arr.push(r);
    reviewsByBooking.set(r.bookingId, arr);
  }

  const enriched = withGuests.map((b) => ({ ...b, reviews: reviewsByBooking.get(b.id) ?? [] }));

  res.json({
    success: true,
    data: enriched,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ─── Upcoming Arrivals with Risk Alerts ──────────────────────────────────────

router.get(
  '/upcoming/arrivals',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const propertyId = req.user!.propertyId;
    if (!propertyId) {
      res.status(400).json({ success: false, message: 'No property associated' });
      return;
    }

    const days = parseInt(req.query.days as string || '7', 10);
    const until = new Date();
    until.setDate(until.getDate() + days);

    const now = new Date().toISOString();
    const arrivals = await db.select<BookingRow>(
      'Booking',
      {
        propertyId,
        status: BookingStatus.CONFIRMED,
        checkIn: { gte: now, lte: until.toISOString() },
      },
      { order: 'checkIn.asc' }
    );

    const withGuests = await attachGuests(arrivals, 'id,firstName,lastName,nationality,averageRating,totalReviews,riskLevel,profileImage');

    const withAlerts = withGuests.map((booking) => ({
      ...booking,
      alert:
        booking.guest && (booking.guest.riskLevel === 'HIGH_RISK' || booking.guest.riskLevel === 'POOR')
          ? {
              level: booking.guest.riskLevel,
              message:
                booking.guest.riskLevel === 'HIGH_RISK'
                  ? 'HIGH RISK: This guest has a very poor review history'
                  : 'CAUTION: This guest has a below-average review history',
            }
          : null,
    }));

    res.json({ success: true, data: withAlerts });
  }
);

// ─── Get Single Booking ──────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const booking = await db.selectOne<BookingRow>('Booking', { id: req.params.id });

  if (!booking) {
    res.status(404).json({ success: false, message: 'Booking not found' });
    return;
  }

  if (booking.propertyId !== req.user!.propertyId && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }

  const [guest, reviews] = await Promise.all([
    db.selectOne<GuestRef>('Guest', { id: booking.guestId }),
    db.select<ReviewRef>('Review', { bookingId: booking.id }),
  ]);

  const reviewerIds = Array.from(new Set(reviews.map((r) => r.reviewerId).filter(Boolean) as string[]));
  const reviewers = reviewerIds.length
    ? await db.select<UserRef>('User', { id: { in: reviewerIds } }, { select: 'id,firstName,lastName' })
    : [];
  const userById = new Map(reviewers.map((u) => [u.id, u]));

  const reviewsWithUsers = reviews.map((r) => ({
    ...r,
    reviewer: r.reviewerId ? userById.get(r.reviewerId) ?? null : null,
  }));

  res.json({ success: true, data: { ...booking, guest, reviews: reviewsWithUsers } });
});

// ─── Update Booking Status ───────────────────────────────────────────────────

router.patch(
  '/:id/status',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { status } = req.body;

    if (!status || !Object.values(BookingStatus).includes(status as BookingStatus)) {
      res.status(400).json({ success: false, message: 'Invalid booking status' });
      return;
    }

    const booking = await db.selectOne<BookingRow>('Booking', { id: req.params.id });

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    if (booking.propertyId !== req.user!.propertyId && req.user!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const updated = await db.updateOne<BookingRow>('Booking', { id: booking.id }, {
      status: status as BookingStatus,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, data: updated });
  }
);

export default router;
