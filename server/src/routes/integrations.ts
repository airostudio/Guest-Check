import { Router, Request, Response } from 'express';
import { BookingSource, BookingStatus, RiskLevel } from '../types/enums';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { authenticate, requirePropertyAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import logger from '../utils/logger';
import { db } from '../lib/supabase';
import { normalizePhone } from '../utils/phone';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

interface ApiKeyRow {
  id: string;
  propertyId: string;
  name: string;
  key: string;
  permissions: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface IntegrationRow {
  id: string;
  propertyId: string;
  platform: BookingSource;
  accessToken: string | null;
  externalId: string | null;
  webhookSecret: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface GuestRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
}

interface BookingRow {
  id: string;
  guestId: string;
  propertyId: string;
}

// ─── API Key Management ───────────────────────────────────────────────────────

router.get('/api-keys', authenticate, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const keys = await db.select<ApiKeyRow>(
    'ApiKey',
    { propertyId: req.user!.propertyId! },
    { select: 'id,name,key,permissions,lastUsedAt,expiresAt,isActive,createdAt' }
  );

  const masked = keys.map((k) => ({ ...k, key: `gc_...${k.key.slice(-8)}` }));

  res.json({ success: true, data: masked });
}));

router.post(
  '/api-keys',
  authenticate,
  requirePropertyAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { name, permissions, expiresInDays } = req.body;
    const propertyId = req.user!.propertyId!;

    const key = `gc_live_${uuidv4().replace(/-/g, '')}`;
    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000).toISOString()
      : null;

    const apiKey = await db.insert<ApiKeyRow>('ApiKey', {
      id: crypto.randomBytes(12).toString('base64url'),
      propertyId,
      key,
      name: name || 'Default API Key',
      permissions: permissions || ['read_reviews', 'write_bookings'],
      expiresAt,
      isActive: true,
      createdAt: new Date().toISOString(),
    });

    res.status(201).json({
      success: true,
      data: apiKey,
      message: 'Save this API key securely — it will only be shown once.',
    });
  })
);

router.delete(
  '/api-keys/:id',
  authenticate,
  requirePropertyAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    await db.update('ApiKey',
      { id: req.params.id, propertyId: req.user!.propertyId! },
      { isActive: false }
    );
    res.json({ success: true, message: 'API key revoked' });
  })
);

// ─── Platform Integrations ────────────────────────────────────────────────────

router.get('/platforms', authenticate, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const integrations = await db.select<IntegrationRow>(
    'Integration',
    { propertyId: req.user!.propertyId! },
    { select: 'id,platform,isActive,lastSyncAt,externalId,createdAt' }
  );
  res.json({ success: true, data: integrations });
}));

router.post(
  '/platforms/:platform',
  authenticate,
  requirePropertyAdmin,
  asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
    const { platform } = req.params;
    const { accessToken, externalId } = req.body;
    const propertyId = req.user!.propertyId!;
    const webhookSecret = crypto.randomBytes(32).toString('hex');
    const now = new Date().toISOString();

    const existing = await db.selectOne<IntegrationRow>(
      'Integration',
      { propertyId, platform: platform as BookingSource }
    );

    let integration: IntegrationRow;
    if (existing) {
      const updated = await db.updateOne<IntegrationRow>(
        'Integration',
        { id: existing.id },
        { accessToken, externalId, isActive: true, webhookSecret, updatedAt: now }
      );
      integration = updated ?? existing;
    } else {
      integration = await db.insert<IntegrationRow>('Integration', {
        id: crypto.randomBytes(12).toString('base64url'),
        propertyId,
        platform: platform as BookingSource,
        accessToken,
        externalId,
        webhookSecret,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    res.json({
      success: true,
      data: {
        ...integration,
        webhookUrl: `${process.env.API_BASE_URL || 'https://api.guestcheck.io'}/api/integrations/webhooks/${platform}`,
        webhookSecret,
      },
    });
  })
);

// ─── Booking.com Webhook ──────────────────────────────────────────────────────

router.post(
  '/webhooks/booking-com',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['x-booking-signature'] as string;
    logger.info('Booking.com webhook received', { type: req.body?.type });

    try {
      const payload = req.body;
      const data = payload.data as Record<string, unknown> | undefined;
      const externalPropertyId = data ? String(data.hotel_id || '') : '';

      if (externalPropertyId) {
        const integration = await db.selectOne<IntegrationRow>(
          'Integration',
          { platform: BookingSource.BOOKING_COM, externalId: externalPropertyId, isActive: true }
        );

        if (integration?.webhookSecret) {
          if (!signature) {
            logger.warn('Booking.com webhook missing signature', { externalPropertyId });
            res.status(401).json({ error: 'Missing webhook signature' });
            return;
          }
          const expected = crypto
            .createHmac('sha256', integration.webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');
          const sigBuf = Buffer.from(signature);
          const expBuf = Buffer.from(expected);
          if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            logger.warn('Booking.com webhook signature mismatch', { externalPropertyId });
            res.status(401).json({ error: 'Invalid webhook signature' });
            return;
          }
        }
      }

      if (payload.type === 'reservation') {
        await processBookingComReservation(payload);
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Booking.com webhook error', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  })
);

async function findOrCreateGuest(input: {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  nationality?: string;
}): Promise<GuestRow> {
  let guest: GuestRow | null = null;
  if (input.email) {
    guest = await db.selectOne<GuestRow>('Guest', { email: input.email });
  }
  if (!guest && input.phone) {
    const normalized = normalizePhone(input.phone);
    if (normalized) {
      guest = await db.selectOne<GuestRow>('Guest', { phoneNormalized: normalized });
    }
  }
  if (guest) return guest;

  const now = new Date().toISOString();
  return db.insert<GuestRow>('Guest', {
    id: crypto.randomBytes(12).toString('base64url'),
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email ?? null,
    phone: input.phone ?? null,
    phoneNormalized: normalizePhone(input.phone) || null,
    nationality: input.nationality ?? null,
    totalReviews: 0,
    riskLevel: RiskLevel.UNREVIEWED,
    createdAt: now,
    updatedAt: now,
  });
}

async function upsertBooking(id: string, createData: Record<string, unknown>, updateData: Record<string, unknown>): Promise<void> {
  const existing = await db.selectOne<BookingRow>('Booking', { id });
  const now = new Date().toISOString();
  if (existing) {
    await db.update('Booking', { id }, { ...updateData, updatedAt: now });
  } else {
    await db.insert('Booking', { id, ...createData, createdAt: now, updatedAt: now });
  }
}

async function processBookingComReservation(payload: Record<string, unknown>) {
  const data = payload.data as Record<string, unknown>;
  if (!data) return;

  const externalPropertyId = String(data.hotel_id || '');
  const integration = await db.selectOne<IntegrationRow>(
    'Integration',
    { platform: BookingSource.BOOKING_COM, externalId: externalPropertyId, isActive: true }
  );

  if (!integration) {
    logger.warn('No integration found for Booking.com property', { externalPropertyId });
    return;
  }

  const guestData = data.guest as Record<string, unknown> | undefined;
  const bookingData = data.booking as Record<string, unknown> | undefined;
  if (!guestData || !bookingData) return;

  const guest = await findOrCreateGuest({
    firstName: String(guestData.first_name || ''),
    lastName: String(guestData.last_name || ''),
    email: guestData.email ? String(guestData.email) : undefined,
    phone: guestData.phone ? String(guestData.phone) : undefined,
    nationality: guestData.nationality ? String(guestData.nationality) : undefined,
  });

  const status = mapBookingComStatus(String(bookingData.status || ''));
  const bookingId = `bkgcom_${String(bookingData.id || '')}`;

  await upsertBooking(bookingId, {
    guestId: guest.id,
    propertyId: integration.propertyId,
    checkIn: new Date(String(bookingData.check_in || '')).toISOString(),
    checkOut: new Date(String(bookingData.check_out || '')).toISOString(),
    source: BookingSource.BOOKING_COM,
    externalId: String(bookingData.id || ''),
    status,
    numberOfGuests: 1,
    currency: 'USD',
  }, { status });
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
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const signature = req.headers['x-airbnb-signature'] as string;
    logger.info('Airbnb webhook received', { type: req.body?.type });

    try {
      const { type, data } = req.body;
      const listingId = data ? String(data.listing_id || '') : '';

      if (listingId) {
        const integration = await db.selectOne<IntegrationRow>(
          'Integration',
          { platform: BookingSource.AIRBNB, externalId: listingId, isActive: true }
        );

        if (integration?.webhookSecret) {
          if (!signature) {
            logger.warn('Airbnb webhook missing signature', { listingId });
            res.status(401).json({ error: 'Missing webhook signature' });
            return;
          }
          const expected = crypto
            .createHmac('sha256', integration.webhookSecret)
            .update(JSON.stringify(req.body))
            .digest('hex');
          const sigBuf = Buffer.from(signature);
          const expBuf = Buffer.from(expected);
          if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            logger.warn('Airbnb webhook signature mismatch', { listingId });
            res.status(401).json({ error: 'Invalid webhook signature' });
            return;
          }
        }
      }

      if (type === 'reservation.created' || type === 'reservation.updated') {
        await processAirbnbReservation(data);
      }

      res.json({ received: true });
    } catch (err) {
      logger.error('Airbnb webhook error', err);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  })
);

async function processAirbnbReservation(data: Record<string, unknown>) {
  const listingId = String(data.listing_id || '');
  const integration = await db.selectOne<IntegrationRow>(
    'Integration',
    { platform: BookingSource.AIRBNB, externalId: listingId, isActive: true }
  );

  if (!integration) return;

  const guestData = data.guest as Record<string, unknown> | undefined;
  if (!guestData) return;

  const guest = await findOrCreateGuest({
    firstName: String(guestData.first_name || ''),
    lastName: String(guestData.last_name || ''),
    email: guestData.email ? String(guestData.email) : undefined,
    phone: guestData.phone ? String(guestData.phone) : undefined,
  });

  const reservationCode = String(data.confirmation_code || '');
  const bookingId = `airbnb_${reservationCode}`;

  await upsertBooking(bookingId, {
    guestId: guest.id,
    propertyId: integration.propertyId,
    checkIn: new Date(String(data.start_date || '')).toISOString(),
    checkOut: new Date(String(data.end_date || '')).toISOString(),
    source: BookingSource.AIRBNB,
    externalId: reservationCode,
    status: BookingStatus.CONFIRMED,
    numberOfGuests: 1,
    currency: 'USD',
  }, { status: BookingStatus.CONFIRMED });
}

// ─── Generic API Endpoint for External Booking Systems ────────────────────────

router.post(
  '/bookings/external',
  asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string;
    if (!apiKey) {
      res.status(401).json({ success: false, message: 'API key required' });
      return;
    }

    const key = await db.selectOne<ApiKeyRow>('ApiKey', { key: apiKey });

    if (!key || !key.isActive) {
      res.status(401).json({ success: false, message: 'Invalid API key' });
      return;
    }

    // This route reimplements API-key auth and previously omitted the expiry
    // check that middleware/apiKey.ts performs — keys issued with expiresInDays
    // retained write access to the tenant indefinitely.
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      res.status(401).json({ success: false, message: 'API key has expired' });
      return;
    }

    const { guest: guestData, booking: bookingData } = req.body;

    if (!guestData || !bookingData) {
      res.status(400).json({ success: false, message: 'guest and booking are required' });
      return;
    }

    if (!bookingData.checkIn || !bookingData.checkOut) {
      res.status(400).json({ success: false, message: 'checkIn and checkOut are required' });
      return;
    }

    const checkIn = new Date(bookingData.checkIn);
    const checkOut = new Date(bookingData.checkOut);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime()) || checkOut <= checkIn) {
      res.status(400).json({ success: false, message: 'Invalid check-in/check-out dates' });
      return;
    }

    const guest = await findOrCreateGuest({
      firstName: String(guestData.firstName || guestData.first_name || ''),
      lastName: String(guestData.lastName || guestData.last_name || ''),
      email: guestData.email ? String(guestData.email) : undefined,
      phone: guestData.phone ? String(guestData.phone) : undefined,
      nationality: guestData.nationality ? String(guestData.nationality) : undefined,
    });

    const now = new Date().toISOString();
    const booking = await db.insert<BookingRow>('Booking', {
      id: crypto.randomBytes(12).toString('base64url'),
      guestId: guest.id,
      propertyId: key.propertyId,
      source: BookingSource.API,
      checkIn: checkIn.toISOString(),
      checkOut: checkOut.toISOString(),
      roomNumber: bookingData.roomNumber ? String(bookingData.roomNumber) : null,
      numberOfGuests: bookingData.numberOfGuests ? Number(bookingData.numberOfGuests) : 1,
      totalAmount: bookingData.totalAmount ? Number(bookingData.totalAmount) : null,
      currency: bookingData.currency ? String(bookingData.currency) : 'USD',
      externalId: bookingData.externalId ? String(bookingData.externalId) : null,
      externalUrl: bookingData.externalUrl ? String(bookingData.externalUrl) : null,
      notes: bookingData.notes ? String(bookingData.notes) : null,
      status: BookingStatus.CONFIRMED,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({ success: true, data: { guestId: guest.id, bookingId: booking.id } });
  })
);

export default router;
