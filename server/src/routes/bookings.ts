import { Router, Response } from 'express';
import { body, validationResult } from 'express-validator';
import { BookingSource, BookingStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import prisma from '../lib/prisma';

const router = Router();

// ─── Create Booking (manual or via API) ──────────────────────────────────────

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

    const booking = await prisma.booking.create({
      data: {
        guestId,
        propertyId,
        checkIn: new Date(checkIn),
        checkOut: new Date(checkOut),
        roomNumber: roomNumber || null,
        numberOfGuests: numberOfGuests || 1,
        totalAmount: totalAmount || null,
        currency: currency || 'USD',
        source: source || BookingSource.MANUAL,
        externalId: externalId || null,
        externalUrl: externalUrl || null,
        notes: notes || null,
      },
      include: {
        guest: { select: { id: true, firstName: true, lastName: true, riskLevel: true } },
      },
    });

    res.status(201).json({ success: true, data: booking });
  }
);

// ─── List Bookings for Property ───────────────────────────────────────────────

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

  const where: Record<string, unknown> = { propertyId };
  if (status && Object.values(BookingStatus).includes(status)) where.status = status;
  if (upcoming) {
    where.checkIn = { gte: new Date() };
    where.status = BookingStatus.CONFIRMED;
  }

  const [bookings, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        guest: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nationality: true,
            averageRating: true,
            riskLevel: true,
            profileImage: true,
          },
        },
        reviews: { select: { id: true, overallRating: true } },
      },
      orderBy: { checkIn: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);

  res.json({
    success: true,
    data: bookings,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});

// ─── Upcoming Arrivals with Risk Alerts ───────────────────────────────────────
// Declared before /:id to prevent Express from matching 'upcoming' as an :id param

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

    const arrivals = await prisma.booking.findMany({
      where: {
        propertyId,
        status: BookingStatus.CONFIRMED,
        checkIn: { gte: new Date(), lte: until },
      },
      include: {
        guest: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nationality: true,
            averageRating: true,
            totalReviews: true,
            riskLevel: true,
            profileImage: true,
          },
        },
      },
      orderBy: { checkIn: 'asc' },
    });

    const withAlerts = arrivals.map((booking) => ({
      ...booking,
      alert:
        booking.guest.riskLevel === 'HIGH_RISK' || booking.guest.riskLevel === 'POOR'
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

// ─── Get Single Booking ────────────────────────────────────────────────────────

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const booking = await prisma.booking.findUnique({
    where: { id: req.params.id },
    include: {
      guest: true,
      reviews: {
        include: {
          reviewer: { select: { firstName: true, lastName: true } },
        },
      },
    },
  });

  if (!booking) {
    res.status(404).json({ success: false, message: 'Booking not found' });
    return;
  }

  if (booking.propertyId !== req.user!.propertyId && req.user!.role !== 'SUPER_ADMIN') {
    res.status(403).json({ success: false, message: 'Access denied' });
    return;
  }

  res.json({ success: true, data: booking });
});

// ─── Update Booking Status ────────────────────────────────────────────────────

router.patch(
  '/:id/status',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { status } = req.body;

    if (!status || !Object.values(BookingStatus).includes(status as BookingStatus)) {
      res.status(400).json({ success: false, message: 'Invalid booking status' });
      return;
    }

    const booking = await prisma.booking.findUnique({ where: { id: req.params.id } });

    if (!booking) {
      res.status(404).json({ success: false, message: 'Booking not found' });
      return;
    }

    if (booking.propertyId !== req.user!.propertyId && req.user!.role !== 'SUPER_ADMIN') {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }

    const updated = await prisma.booking.update({
      where: { id: booking.id },
      data: { status: status as BookingStatus },
    });

    res.json({ success: true, data: updated });
  }
);

export default router;
