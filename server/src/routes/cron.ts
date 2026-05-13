import { Router, Request, Response } from 'express';
import { BookingStatus } from '@prisma/client';
import { db } from '../lib/supabase';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';

const router = Router();

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // not configured — allow in dev
  if (req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// ─── POST /api/cron/review-nudge ─────────────────────────────────────────────
// Called daily by Vercel Cron at 08:00 UTC.
// Finds confirmed checkouts from yesterday with no review and emails property admins.

router.post('/review-nudge', async (req: Request, res: Response): Promise<void> => {
  if (!verifyCronSecret(req, res)) return;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

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

  // Step 1: All confirmed bookings that checked out yesterday
  const checkouts = await db.select<BookingRow>('Booking', {
    checkOut: { gte: yesterdayStart.toISOString(), lt: todayStart.toISOString() },
    status: BookingStatus.CONFIRMED,
  });

  if (checkouts.length === 0) {
    res.json({ success: true, nudgesSent: 0, message: 'No checkouts yesterday' });
    return;
  }

  // Step 2: Find which bookings already have a review
  const bookingIds = checkouts.map((b) => b.id);
  const reviews = await db.select<ReviewRow>('Review', { bookingId: { in: bookingIds } }, { select: 'bookingId' });
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
});

export default router;
