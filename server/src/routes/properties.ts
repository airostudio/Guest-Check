import { Router, Response } from 'express';
import { UserRole } from '@prisma/client';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { authenticate, requirePropertyAdmin } from '../middleware/auth';
import { AuthRequest } from '../types';
import prisma from '../lib/prisma';

const router = Router();

// ─── Get My Property ──────────────────────────────────────────────────────────

router.get('/mine', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const propertyId = req.user!.propertyId;
  if (!propertyId) {
    res.status(404).json({ success: false, message: 'No property associated with your account' });
    return;
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    include: {
      users: {
        select: {
          id: true, firstName: true, lastName: true, email: true,
          role: true, lastLoginAt: true, isActive: true,
        },
      },
      _count: {
        select: { reviews: true, bookings: true, apiKeys: true },
      },
    },
  });

  res.json({ success: true, data: property });
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

    const updated = await prisma.property.update({
      where: { id: propertyId },
      data: {
        ...(name && { name }),
        ...(phone !== undefined && { phone }),
        ...(website !== undefined && { website }),
        ...(address && { address }),
        ...(city && { city }),
        ...(country && { country }),
        ...(postcode !== undefined && { postcode }),
        ...(description !== undefined && { description }),
        ...(billingEmail && { billingEmail }),
        ...(vatNumber !== undefined && { vatNumber }),
      },
    });

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

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ success: false, message: 'A user with this email already exists' });
      return;
    }

    // Generate cryptographically secure temporary password
    const tempPassword = crypto.randomBytes(12).toString('base64url') + 'Gc1!';
    const hashed = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.create({
      data: {
        email,
        firstName,
        lastName,
        password: hashed,
        role: role as UserRole,
        propertyId,
        emailVerified: true, // Property admin is vouching for them
      },
      select: {
        id: true, email: true, firstName: true, lastName: true, role: true,
      },
    });

    res.status(201).json({
      success: true,
      data: { ...user, temporaryPassword: tempPassword },
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

    // Cannot remove yourself
    if (userId === req.user!.id) {
      res.status(400).json({ success: false, message: 'You cannot remove yourself' });
      return;
    }

    await prisma.user.updateMany({
      where: { id: userId, propertyId },
      data: { isActive: false },
    });

    res.json({ success: true, message: 'Team member removed' });
  }
);

export default router;
