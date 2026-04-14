import { Router, Response } from 'express';
import { ReviewStatus } from '@prisma/client';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { ratingToLabel } from '../utils/riskScore';
import prisma from '../lib/prisma';

const router = Router();

// ─── Caller ID Lookup ─────────────────────────────────────────────────────────
// Called when a known number rings reception — pops up guest profile

router.get(
  '/caller/:number',
  authenticate,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const rawNumber = req.params.number;
    // Strip non-digits for flexible matching
    const digits = rawNumber.replace(/\D/g, '');

    if (digits.length < 7) {
      res.status(400).json({ success: false, message: 'Invalid phone number' });
      return;
    }

    // Search guest phones (try last 10 digits for local-vs-international)
    const searchVariants = [digits, digits.slice(-10), digits.slice(-9)].filter(
      (v, i, arr) => arr.indexOf(v) === i
    );

    const guests = await prisma.guest.findMany({
      where: {
        OR: [
          ...searchVariants.map((v) => ({ phone: { endsWith: v } })),
          ...searchVariants.map((v) => ({
            phoneNumbers: { some: { number: { endsWith: v } } },
          })),
        ],
      },
      include: {
        reviews: {
          where: { status: ReviewStatus.PUBLISHED },
          select: {
            id: true,
            overallRating: true,
            publicComment: true,
            wouldWelcomeBack: true,
            isVerifiedStay: true,
            stayMonth: true,
            stayYear: true,
            property: {
              select: {
                name: true,
                city: true,
                country: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        bookings: {
          where: { propertyId: req.user!.propertyId ?? undefined },
          orderBy: { checkIn: 'desc' },
          take: 3,
          select: {
            id: true,
            checkIn: true,
            checkOut: true,
            status: true,
            roomNumber: true,
          },
        },
      },
      take: 3,
    });

    if (guests.length === 0) {
      res.json({
        success: true,
        data: null,
        message: 'Unknown caller - no guest record found',
      });
      return;
    }

    // Format caller card response
    const callerCards = guests.map((guest) => {
      const avgRating = guest.averageRating;
      const riskLabel = avgRating ? ratingToLabel(avgRating) : 'No reviews yet';

      const recommendCount = guest.reviews.filter((r) => r.wouldWelcomeBack === true).length;
      const notRecommendCount = guest.reviews.filter((r) => r.wouldWelcomeBack === false).length;

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
        recentReviews: guest.reviews,
        previousBookings: guest.bookings,
      };
    });

    res.json({ success: true, data: callerCards });
  }
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
