import { Router, Request, Response } from 'express';
import { BookingStatus, ReviewStatus } from '../types/enums';
import { db } from '../lib/supabase';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';

const router = Router();

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET;

  // Fail CLOSED. An unset secret in production would leave this endpoint
  // publicly callable — each call emails every property admin, so an attacker
  // could exhaust the SMTP quota and burn sender reputation platform-wide.
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('CRON_SECRET is not set — refusing to run cron job');
      res.status(503).json({ success: false, message: 'Cron is not configured' });
      return false;
    }
    return true; // local development only
  }

  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
    return false;
  }
  return true;
}

// ─── GET /api/cron/review-nudge ──────────────────────────────────────────────
// Called daily by Vercel Cron at 08:00 UTC.
// Finds yesterday's checkouts with no review and emails the property admins.
//
// MUST be registered for GET: Vercel Cron always invokes with GET and there is
// no way to configure the method in vercel.json's "crons" block. POST is kept
// so the job can still be triggered manually.

const reviewNudgeHandler = async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return;

  // Vercel runs in UTC; anchor explicitly rather than relying on server-local
  // midnight so behaviour is identical in development.
  const now = new Date();
  const todayStart = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()
  ));

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setUTCDate(yesterdayStart.getUTCDate() - 1);

  interface BookingRow {
    id: string;
    guestId: string;
    propertyId: string;
    checkOut: string;
    status: string;
  }

  interface ReviewRow { bookingId: string | null }

  interface GuestRow { id: string; firstName: string; lastName: string }

  interface PropertyRow { id: string; name: string }

  interface UserRow { id: string; propertyId: string; email: string; firstName: string }

  // Step 1: Bookings that checked out yesterday.
  // Include BOTH statuses: properties that correctly mark guests CHECKED_OUT are
  // exactly the ones that should be nudged. Filtering on CONFIRMED alone inverted
  // the intent and skipped every well-run property.
  const checkouts = await db.select<BookingRow>('Booking', {
    checkOut: { gte: yesterdayStart.toISOString(), lt: todayStart.toISOString() },
    status: { in: [BookingStatus.CONFIRMED, BookingStatus.CHECKED_OUT] },
  });

  if (checkouts.length === 0) {
    res.json({ success: true, nudgesSent: 0, message: 'No checkouts yesterday' });
    return;
  }

  // Step 2: Find which bookings already have a review.
  // Only PUBLISHED/FLAGGED count as reviewed — a REMOVED review means the
  // property still needs to leave one.
  const bookingIds = checkouts.map((b) => b.id);
  const reviews = await db.select<ReviewRow>(
    'Review',
    { bookingId: { in: bookingIds }, status: { neq: ReviewStatus.REMOVED } },
    { select: 'bookingId' }
  );
  const reviewedIds = new Set(reviews.map((r) => r.bookingId).filter(Boolean) as string[]);
  const unreviewed = checkouts.filter((b) => !reviewedIds.has(b.id));

  if (unreviewed.length === 0) {
    res.json({ success: true, nudgesSent: 0, message: 'All checkouts already reviewed' });
    return;
  }

  // Step 3: Fetch guests, properties, and admins in parallel
  const guestIds = Array.from(new Set(unreviewed.map((b) => b.guestId)));
  const propertyIds = Array.from(new Set(unreviewed.map((b) => b.propertyId)));

  const [guests, properties, admins] = await Promise.all([
    db.select<GuestRow>('Guest', { id: { in: guestIds } }, { select: 'id,firstName,lastName' }),
    db.select<PropertyRow>('Property', { id: { in: propertyIds } }, { select: 'id,name' }),
    db.select<UserRow>('User', { propertyId: { in: propertyIds }, role: 'PROPERTY_ADMIN' }, { select: 'id,propertyId,email,firstName' }),
  ]);

  const guestById = new Map(guests.map((g) => [g.id, g]));
  const propById  = new Map(properties.map((p) => [p.id, p]));

  // Group unreviewed bookings by property
  const byProperty = new Map<string, BookingRow[]>();
  for (const b of unreviewed) {
    const arr = byProperty.get(b.propertyId) ?? [];
    arr.push(b);
    byProperty.set(b.propertyId, arr);
  }

  // Step 4: One email per admin per property
  let nudgesSent = 0;
  const sends: Promise<void>[] = [];

  for (const [propertyId, bookings] of byProperty) {
    const property = propById.get(propertyId);
    const propertyAdmins = admins.filter((a) => a.propertyId === propertyId);
    if (!property || propertyAdmins.length === 0) continue;

    const checkoutList = bookings
      .map((b) => {
        const g = guestById.get(b.guestId);
        return g ? { guestName: `${g.firstName} ${g.lastName}`, bookingId: b.id } : null;
      })
      .filter((x): x is { guestName: string; bookingId: string } => x !== null);

    if (checkoutList.length === 0) continue;

    for (const admin of propertyAdmins) {
      sends.push(
        emailService
          .sendReviewNudgeEmail(admin.email, admin.firstName, property.name, checkoutList)
          .then(() => { nudgesSent++; })
          .catch((err: unknown) => { logger.error(`Review nudge email failed for ${admin.email}: ${(err as Error).message}`); })
      );
    }
  }

  await Promise.all(sends);

  logger.info(`review-nudge cron: ${nudgesSent} emails sent for ${unreviewed.length} unreviewed checkouts`);
  res.json({ success: true, nudgesSent, unreviewedCheckouts: unreviewed.length });
};

// GET is what Vercel Cron actually sends; POST allows manual triggering.
router.get('/review-nudge', reviewNudgeHandler);
router.post('/review-nudge', reviewNudgeHandler);

export default router;
