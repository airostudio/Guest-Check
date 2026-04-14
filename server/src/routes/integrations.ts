import { Router, Request, Response } from 'express';
import { BookingSource, BookingStatus } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { authenticate, requirePropertyAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../utils/logger';
import prisma from '../lib/prisma';

const router = Router();

// ─── API Key Management ───────────────────────────────────────────────────────

router.get('/api-keys', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const keys = await prisma.apiKey.findMany({
    where: { propertyId: req.user!.propertyId! },
    select: {
      id: true,
      name: true,
      key: true,
      permissions: true,
      lastUsedAt: true,
      expiresAt: true,
      isActive: true,
      createdAt: true,
    },
  });

  // Mask the key - only show last 8 chars
  const masked = keys.map((k) => ({
    ...k,
    key: `gc_...${k.key.slice(-8)}`,
  }));

  res.json({ success: true, data: masked });
});

router.post(
  '/api-keys',
  authenticate,
  requirePropertyAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, permissions, expiresInDays } = req.body;
    const propertyId = req.user!.propertyId!;

    const key = `gc_live_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
      : null;

    const apiKey = await prisma.apiKey.create({
      data: {
        propertyId,
        key,
        name: name || 'Default API Key',
        permissions: permissions || ['read_reviews', 'write_bookings'],
        expiresAt,
      },
    });

    // Return the full key ONCE - it won't be shown again
    res.status(201).json({
      success: true,
      data: apiKey,
      message: 'Save this API key securely — it will only be shown once.',
    });
  }
);

router.delete(
  '/api-keys/:id',
  authenticate,
  requirePropertyAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    await prisma.apiKey.updateMany({
      where: { id: req.params.id, propertyId: req.user!.propertyId! },
      data: { isActive: false },
    });
    res.json({ success: true, message: 'API key revoked' });
  }
);

// ─── Platform Integrations ────────────────────────────────────────────────────

router.get('/platforms', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const integrations = await prisma.integration.findMany({
    where: { propertyId: req.user!.propertyId! },
    select: {
      id: true,
      platform: true,
      isActive: true,
      lastSyncAt: true,
      externalId: true,
      createdAt: true,
    },
  });
  res.json({ success: true, data: integrations });
});

router.post(
  '/platforms/:platform',
  authenticate,
  requirePropertyAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { platform } = req.params;
    const { accessToken, externalId } = req.body;
    const propertyId = req.user!.propertyId!;
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    const integration = await prisma.integration.upsert({
      where: { propertyId_platform: { propertyId, platform: platform as BookingSource } },
      update: { accessToken, externalId, isActive: true, webhookSecret },
      create: {
        propertyId,
        platform: platform as BookingSource,
        accessToken,
        externalId,
        webhookSecret,
      },
    });

    res.json({
      success: true,
      data: {
        ...integration,
        webhookUrl: `${process.env.API_BASE_URL || 'https://api.guestcheck.io'}/api/integrations/webhooks/${platform}`,
        webhookSecret,
      },
    });
  }
);

// ─── Booking.com Webhook ──────────────────────────────────────────────────────

router.post(
  '/webhooks/booking-com',
  async (req: Request, res: Response): Promise<void> => {
    // Verify webhook signature
    const signature = req.headers['x-booking-signature'] as string;
    logger.info('Booking.com webhook received', { type: req.body?.type });

    try {
      const payload = req.body;

      // Booking.com sends different event types
      if (payload.type === 'reservation') {
        await processBookingComReservation(payload);
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Booking.com webhook error', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

async function processBookingComReservation(payload: Record<string, unknown>) {
  const data = payload.data as Record<string, unknown>;
  if (!data) return;

  // Find the integration for this property
  const externalPropertyId = String(data.hotel_id || '');
  const integration = await prisma.integration.findFirst({
    where: { platform: BookingSource.BOOKING_COM, externalId: externalPropertyId, isActive: true },
  });

  if (!integration) {
    logger.warn('No integration found for Booking.com property', { externalPropertyId });
    return;
  }

  const guestData = data.guest as Record<string, unknown> | undefined;
  const bookingData = data.booking as Record<string, unknown> | undefined;
  if (!guestData || !bookingData) return;

  // Find or create guest
  let guest = await prisma.guest.findFirst({
    where: { email: String(guestData.email || '') },
  });

  if (!guest) {
    guest = await prisma.guest.create({
      data: {
        firstName: String(guestData.first_name || ''),
        lastName: String(guestData.last_name || ''),
        email: guestData.email ? String(guestData.email) : undefined,
        phone: guestData.phone ? String(guestData.phone) : undefined,
        nationality: guestData.nationality ? String(guestData.nationality) : undefined,
      },
    });
  }

  // Create booking
  await prisma.booking.upsert({
    where: {
      id: `bkgcom_${String(bookingData.id || '')}`,
    },
    update: {
      status: mapBookingComStatus(String(bookingData.status || '')),
    },
    create: {
      id: `bkgcom_${String(bookingData.id || '')}`,
      guestId: guest.id,
      propertyId: integration.propertyId,
      checkIn: new Date(String(bookingData.check_in || '')),
      checkOut: new Date(String(bookingData.check_out || '')),
      source: BookingSource.BOOKING_COM,
      externalId: String(bookingData.id || ''),
      status: mapBookingComStatus(String(bookingData.status || '')),
    },
  });
}

function mapBookingComStatus(status: string): BookingStatus {
  const statusMap: Record<string, BookingStatus> = {
    confirmed: BookingStatus.CONFIRMED,
    checked_in: BookingStatus.CHECKED_IN,
    checked_out: BookingStatus.CHECKED_OUT,
    cancelled: BookingStatus.CANCELLED,
    no_show: BookingStatus.NO_SHOW,
  };
  return statusMap[status] || BookingStatus.CONFIRMED;
}

// ─── Airbnb Webhook ────────────────────────────────────────────────────────────

router.post(
  '/webhooks/airbnb',
  async (req: Request, res: Response): Promise<void> => {
    logger.info('Airbnb webhook received', { type: req.body?.type });

    try {
      const { type, data } = req.body;

      if (type === 'reservation.created' || type === 'reservation.updated') {
        await processAirbnbReservation(data);
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Airbnb webhook error', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  }
);

async function processAirbnbReservation(data: Record<string, unknown>) {
  const listingId = String(data.listing_id || '');
  const integration = await prisma.integration.findFirst({
    where: { platform: BookingSource.AIRBNB, externalId: listingId, isActive: true },
  });

  if (!integration) return;

  const guestData = data.guest as Record<string, unknown> | undefined;
  if (!guestData) return;

  let guest = await prisma.guest.findFirst({
    where: { email: String(guestData.email || '') },
  });

  if (!guest) {
    guest = await prisma.guest.create({
      data: {
        firstName: String(guestData.first_name || ''),
        lastName: String(guestData.last_name || ''),
        email: guestData.email ? String(guestData.email) : undefined,
        phone: guestData.phone ? String(guestData.phone) : undefined,
      },
    });
  }

  const reservationCode = String(data.confirmation_code || '');
  await prisma.booking.upsert({
    where: { id: `airbnb_${reservationCode}` },
    update: { status: BookingStatus.CONFIRMED },
    create: {
      id: `airbnb_${reservationCode}`,
      guestId: guest.id,
      propertyId: integration.propertyId,
      checkIn: new Date(String(data.start_date || '')),
      checkOut: new Date(String(data.end_date || '')),
      source: BookingSource.AIRBNB,
      externalId: reservationCode,
    },
  });
}

// ─── Generic API Endpoint for External Booking Systems ────────────────────────

router.post(
  '/bookings/external',
  async (req: Request, res: Response): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      res.status(401).json({ success: false, message: 'API key required' });
      return;
    }

    const key = await prisma.apiKey.findUnique({
      where: { key: apiKey },
      include: { property: true },
    });

    if (!key || !key.isActive) {
      res.status(401).json({ success: false, message: 'Invalid API key' });
      return;
    }

    const { guest: guestData, booking: bookingData } = req.body;

    let guest = await prisma.guest.findFirst({
      where: { email: guestData.email },
    });

    if (!guest) {
      guest = await prisma.guest.create({ data: guestData });
    }

    const booking = await prisma.booking.create({
      data: {
        ...bookingData,
        guestId: guest.id,
        propertyId: key.propertyId,
        source: BookingSource.API,
        checkIn: new Date(bookingData.checkIn),
        checkOut: new Date(bookingData.checkOut),
      },
    });

    res.status(201).json({ success: true, data: { guestId: guest.id, bookingId: booking.id } });
  }
);

export default router;
