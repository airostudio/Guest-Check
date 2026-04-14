import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole, PropertyType } from '@prisma/client';
import crypto from 'crypto';
import config from '../config/config';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';
import prisma from '../lib/prisma';

const router = Router();

// ─── Register Property + Admin User ──────────────────────────────────────────

router.post('/register', async (req: Request, res: Response): Promise<void> => {
  const {
    email, password, firstName, lastName,
    propertyName, propertyType, propertyCity,
    propertyCountry, propertyAddress, propertyPostcode,
    propertyPhone, propertyWebsite, vatNumber,
  } = req.body;

  // Manual validation — clear, specific error messages
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ success: false, message: 'A valid email address is required' });
    return;
  }
  if (!password || password.length < 8) {
    res.status(400).json({ success: false, message: 'Password must be at least 8 characters' });
    return;
  }
  if (!firstName || firstName.trim().length < 2) {
    res.status(400).json({ success: false, message: 'First name must be at least 2 characters' });
    return;
  }
  if (!lastName || lastName.trim().length < 2) {
    res.status(400).json({ success: false, message: 'Last name must be at least 2 characters' });
    return;
  }
  if (!propertyName || propertyName.trim().length < 2) {
    res.status(400).json({ success: false, message: 'Property name must be at least 2 characters' });
    return;
  }
  if (!propertyType || !Object.values(PropertyType).includes(propertyType as PropertyType)) {
    res.status(400).json({ success: false, message: 'Please select a valid property type' });
    return;
  }
  if (!propertyAddress || propertyAddress.trim().length < 5) {
    res.status(400).json({ success: false, message: 'Please enter a full street address' });
    return;
  }
  if (!propertyCity || propertyCity.trim().length < 2) {
    res.status(400).json({ success: false, message: 'City is required' });
    return;
  }
  if (!propertyCountry || propertyCountry.trim().length < 2) {
    res.status(400).json({ success: false, message: 'Country is required' });
    return;
  }

  try {
    // Check for duplicate email
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    // Sequential creates — avoids pgbouncer transaction issues with Supabase
    const property = await prisma.property.create({
      data: {
        name: propertyName.trim(),
        type: propertyType as PropertyType,
        address: propertyAddress.trim(),
        city: propertyCity.trim(),
        country: propertyCountry.trim(),
        postcode: propertyPostcode?.trim() || null,
        phone: propertyPhone?.trim() || null,
        website: propertyWebsite?.trim() || null,
        vatNumber: vatNumber?.trim() || null,
        billingEmail: email.toLowerCase().trim(),
      },
    });

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: UserRole.PROPERTY_ADMIN,
        propertyId: property.id,
        // Email is marked verified so they can log in immediately.
        // The property itself still requires admin approval before going live.
        emailVerified: true,
        verificationToken,
        verificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    logger.info(`New registration: ${user.email} for property "${property.name}" (${property.id})`);

    // Send welcome / verification email — non-blocking, failure is not fatal
    emailService
      .sendVerificationEmail(user.email, user.firstName, verificationToken)
      .catch((err) => logger.error('Failed to send verification email', err));

    res.status(201).json({
      success: true,
      message: 'Registration successful! You can now sign in. Your property will be reviewed within 24 hours.',
    });
  } catch (err) {
    logger.error('Registration error', err);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
});

// ─── Verify Email ─────────────────────────────────────────────────────────────

router.get('/verify-email/:token', async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;

  const user = await prisma.user.findFirst({
    where: {
      verificationToken: token,
      verificationExpiry: { gt: new Date() },
    },
  });

  if (!user) {
    res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { emailVerified: true, verificationToken: null, verificationExpiry: null },
  });

  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
      include: {
        property: {
          select: {
            id: true, name: true, status: true,
            subscriptionTier: true, subscriptionStatus: true, trialEndsAt: true,
          },
        },
      },
    });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Your account has been deactivated' });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, propertyId: user.propertyId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }).catch(() => {});

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          property: user.property,
        },
      },
    });
  } catch (err) {
    logger.error('Login error', err);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// ─── Get Current User ─────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true, email: true, firstName: true, lastName: true,
      role: true, phone: true, avatarUrl: true, lastLoginAt: true,
      property: {
        select: {
          id: true, name: true, type: true, city: true, country: true,
          status: true, subscriptionTier: true, subscriptionStatus: true,
          trialEndsAt: true, logoUrl: true,
        },
      },
    },
  });

  res.json({ success: true, data: user });
});

// ─── Forgot Password ──────────────────────────────────────────────────────────

router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ success: false, message: 'Email is required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken, resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000) },
      });
      emailService
        .sendPasswordResetEmail(user.email, user.firstName, resetToken)
        .catch((err) => logger.error('Failed to send password reset email', err));
    }

    // Always return success — prevents email enumeration
    res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) {
    logger.error('Forgot password error', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// ─── Reset Password ───────────────────────────────────────────────────────────

router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body;

  if (!token || !password || password.length < 8) {
    res.status(400).json({ success: false, message: 'A valid token and password (min 8 chars) are required' });
    return;
  }

  try {
    const user = await prisma.user.findFirst({
      where: { resetToken: token, resetTokenExpiry: { gt: new Date() } },
    });

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await bcrypt.hash(password, 12),
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    logger.error('Reset password error', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

// ─── Change Password ──────────────────────────────────────────────────────────

router.post('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'Current password and new password (min 8 chars) are required' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await bcrypt.hash(newPassword, 12) },
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
});

export default router;
