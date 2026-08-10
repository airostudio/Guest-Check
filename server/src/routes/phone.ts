import { Router, Response } from 'express';
import { ReviewStatus, RiskLevel } from '../types/enums';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ratingToLabel } from '../utils/riskScore';
import { db, OrCondition } from '../lib/supabase';
import { phoneMatchVariants } from '../utils/phone';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

interface GuestRow {
  id: string;
  firstName: string;
  lastName: string;
  nationality: string | null;
  averageRating: number | null;
  totalReviews: number;
  riskLevel: RiskLevel;
  phone: string | null;
}

interface ReviewRow {
  id: string;
  guestId: string;
  propertyId: string;
  overallRating: number;
  publicComment: string | null;
  wouldWelcomeBack: boolean | null;
  isVerifiedStay: boolean;
  stayMonth: number | null;
  stayYear: number | null;
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
  roomNumber: string | null;
}

interface PropertyRef {
  id: string;
  name: string;
  city: string;
  country: string;
}

// ─── Caller ID Lookup ─────────────────────────────────────────────────────────

router.get(
  '/caller/:number',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const searchVariants = phoneMatchVariants(req.params.number);

    if (searchVariants.length === 0) {
      res.status(400).json({ success: false, message: 'Invalid phone number' });
      return;
    }

    // Match against the digits-only columns. Matching the formatted `phone`
    // column against a digits-only query never succeeded — reception was told
    // "unknown caller" for guests that were on file.
    const phoneFilter: OrCondition[] = searchVariants.map((v) => ({
      column: 'phoneNormalized', op: 'ilike', value: `*${v}`,
    }));
    const guestPhoneFilter: OrCondition[] = searchVariants.map((v) => ({
      column: 'numberNormalized', op: 'ilike', value: `*${v}`,
    }));

    const [directGuests, phoneRecords] = await Promise.all([
      db.select<GuestRow>('Guest', {}, {
        or: phoneFilter,
        select: 'id,firstName,lastName,nationality,averageRating,totalReviews,riskLevel,phone',
        limit: 5,
      }),
      db.select<{ guestId: string }>('GuestPhone', {}, { or: guestPhoneFilter, select: 'guestId', limit: 10 }),
    ]);

    const extraIds = phoneRecords.map((p) => p.guestId).filter((gid) => !directGuests.find((g) => g.id === gid));
    const extra = extraIds.length
      ? await db.select<GuestRow>('Guest', { id: { in: extraIds } }, {
          select: 'id,firstName,lastName,nationality,averageRating,totalReviews,riskLevel,phone',
        })
      : [];

    const guests = [...directGuests, ...extra].slice(0, 3);

    if (guests.length === 0) {
      res.json({
        success: true,
        data: null,
        message: 'Unknown caller - no guest record found',
      });
      return;
    }

    const guestIds = guests.map((g) => g.id);

    const [reviews, bookings] = await Promise.all([
      db.select<ReviewRow>(
        'Review',
        { guestId: { in: guestIds }, status: ReviewStatus.PUBLISHED },
        {
          // Explicit select — without it PostgREST returns every column and the
          // spread below leaked other properties' privateNote to any receptionist.
          select: 'id,guestId,propertyId,overallRating,publicComment,wouldWelcomeBack,isVerifiedStay,stayMonth,stayYear,status,createdAt',
          order: 'createdAt.desc',
        }
      ),
      db.select<BookingRow>(
        'Booking',
        req.user!.propertyId
          ? { guestId: { in: guestIds }, propertyId: req.user!.propertyId }
          : { guestId: { in: guestIds } },
        { select: 'id,guestId,propertyId,checkIn,checkOut,status,roomNumber', order: 'checkIn.desc' }
      ),
    ]);

    const reviewPropertyIds = Array.from(new Set(reviews.map((r) => r.propertyId)));
    const properties = reviewPropertyIds.length
      ? await db.select<PropertyRef>(
          'Property',
          { id: { in: reviewPropertyIds } },
          { select: 'id,name,city,country' }
        )
      : [];
    const pById = new Map(properties.map((p) => [p.id, p]));

    const reviewsByGuest = new Map<string, ReviewRow[]>();
    for (const r of reviews) {
      const arr = reviewsByGuest.get(r.guestId) ?? [];
      if (arr.length < 5) arr.push(r);
      reviewsByGuest.set(r.guestId, arr);
    }

    const bookingsByGuest = new Map<string, BookingRow[]>();
    for (const b of bookings) {
      const arr = bookingsByGuest.get(b.guestId) ?? [];
      if (arr.length < 3) arr.push(b);
      bookingsByGuest.set(b.guestId, arr);
    }

    const callerCards = guests.map((guest) => {
      const avgRating = guest.averageRating;
      // `0` is a legitimate (worst) rating — a truthiness check reported
      // "No reviews yet" for the highest-risk guests.
      const riskLabel =
        avgRating !== null && avgRating !== undefined && guest.totalReviews > 0
          ? ratingToLabel(avgRating)
          : 'No reviews yet';
      const guestReviews = reviewsByGuest.get(guest.id) ?? [];
      const guestBookings = bookingsByGuest.get(guest.id) ?? [];

      const recommendCount = guestReviews.filter((r) => r.wouldWelcomeBack === true).length;
      const notRecommendCount = guestReviews.filter((r) => r.wouldWelcomeBack === false).length;

      return {
        id: guest.id,
        name: `${guest.firstName} ${guest.lastName}`,
        nationality: guest.nationality,
        averageRating: guest.averageRating,
        totalReviews: guest.totalReviews,
        riskLevel: guest.riskLevel,
        riskLabel,
        recommendCount,
        notRecommendCount,
        alert: buildAlert(guest.riskLevel),
        recentReviews: guestReviews.map((r) => ({
          ...r,
          property: pById.get(r.propertyId) ?? null,
        })),
        previousBookings: guestBookings,
      };
    });

    res.json({ success: true, data: callerCards });
  })
);

function buildAlert(riskLevel: string): { type: 'danger' | 'warning' | 'success' | 'info'; title: string; message: string } | null {
  switch (riskLevel) {
    case 'HIGH_RISK':
      return {
        type: 'danger',
        title: 'HIGH RISK GUEST',
        message: 'This guest has a very poor review history. Exercise extreme caution before accepting this booking.',
      };
    case 'POOR':
      return {
        type: 'warning',
        title: 'Below Average Guest',
        message: 'This guest has received below-average reviews from other properties.',
      };
    case 'EXCELLENT':
      return {
        type: 'success',
        title: 'Excellent Guest',
        message: 'This is a highly rated guest — welcome them warmly and consider a loyalty perk!',
      };
    case 'GOOD':
      return {
        type: 'success',
        title: 'Good Guest',
        message: 'This guest has a good review history.',
      };
    default:
      return null;
  }
}

export default router;
