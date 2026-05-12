import { Router, Response } from 'express';
import { UserRole } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authenticate, requirePropertyAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import { db } from '../lib/supabase';

const router = Router();

interface PropertyRow {
  id: string;
  name: string;
  type: string;
  address: string;
  city: string;
  country: string;
  postcode: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  status: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  billingEmail: string | null;
  vatNumber: string | null;
  logoUrl: string | null;
  trialEndsAt: string | null;
}

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  propertyId: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
}

// ─── Get My Property ──────────────────────────────────────────────────────────

router.get('/mine', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const propertyId = req.user!.propertyId;
  if (!propertyId) {
    res.status(404).json({ success: false, message: 'No property associated with your account' });
    return;
  }

  const [property, users, reviewCount, bookingCount, apiKeyCount] = await Promise.all([
    db.selectOne<PropertyRow>('Property', { id: propertyId }),
    db.select<UserRow>(
      'User',
      { propertyId },
      { select: 'id,firstName,lastName,email,role,lastLoginAt,isActive' }
    ),
    db.count('Review', { propertyId }),
    db.count('Booking', { propertyId }),
    db.count('ApiKey', { propertyId }),
  ]);

  if (!property) {
    res.status(404).json({ success: false, message: 'Property not found' });
    return;
  }

  res.json({
    success: true,
    data: {
      ...property,
      users,
      _count: { reviews: reviewCount, bookings: bookingCount, apiKeys: apiKeyCount },
    },
  });
});

// ─── Update Property ──────────────────────────────────────────────────────────

router.patch(
  '/mine',
  authenticate,
  requirePropertyAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const propertyId = req.user!.propertyId!;
    const {
      name, phone, website, address, city, country, postcode,
      description, billingEmail, vatNumber,
    } = req.body;

    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (name) patch.name = name;
    if (phone !== undefined) patch.phone = phone;
    if (website !== undefined) patch.website = website;
    if (address) patch.address = address;
    if (city) patch.city = city;
    if (country) patch.country = country;
    if (postcode !== undefined) patch.postcode = postcode;
    if (description !== undefined) patch.description = description;
    if (billingEmail) patch.billingEmail = billingEmail;
    if (vatNumber !== undefined) patch.vatNumber = vatNumber;

    const updated = await db.updateOne<PropertyRow>('Property', { id: propertyId }, patch);

    res.json({ success: true, data: updated });
  }
);

// ─── Team Management ──────────────────────────────────────────────────────────

router.post(
  '/mine/team',
  authenticate,
  requirePropertyAdmin,
  [
    body('email').isEmail().normalizeEmail(),
    body('firstName').trim().isLength({ min: 2 }),
    body('lastName').trim().isLength({ min: 2 }),
    body('role').isIn(['PROPERTY_MANAGER', 'RECEPTIONIST']),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email, firstName, lastName, role } = req.body;
    const propertyId = req.user!.propertyId!;

    const existing = await db.selectOne<UserRow>('User', { email });
    if (existing) {
      res.status(409).json({ success: false, message: 'A user with this email already exists' });
      return;
    }

    const tempPassword = crypto.randomBytes(12).toString('base64url') + 'Gc1!';
    const hashed = await bcrypt.hash(tempPassword, 12);
    const now = new Date().toISOString();

    const user = await db.insert<UserRow>('User', {
      id: crypto.randomBytes(12).toString('base64url'),
      email,
      firstName,
      lastName,
      password: hashed,
      role: role as UserRole,
      propertyId,
      emailVerified: true,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });

    res.status(201).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        temporaryPassword: tempPassword,
      },
      message: 'Team member added. Share the temporary password with them securely.',
    });
  }
);

router.delete(
  '/mine/team/:userId',
  authenticate,
  requirePropertyAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const { userId } = req.params;
    const propertyId = req.user!.propertyId!;

    if (userId === req.user!.id) {
      res.status(400).json({ success: false, message: 'You cannot remove yourself' });
      return;
    }

    await db.update('User', { id: userId, propertyId }, {
      isActive: false,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Team member removed' });
  }
);

export default router;
