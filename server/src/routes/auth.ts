import { Router, Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient, UserRole, PropertyType } from '@prisma/client';
import crypto from 'crypto';
import config from '../config/config';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

// ─── Register Property + Admin User ────────────────────────────────────────

router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
    body('firstName').trim().isLength({ min: 2 }),
    body('lastName').trim().isLength({ min: 2 }),
    body('propertyName').trim().isLength({ min: 2 }),
    body('propertyType').isIn(Object.values(PropertyType)),
    body('propertyCity').trim().isLength({ min: 2 }),
    body('propertyCountry').trim().isLength({ min: 2 }),
    body('propertyAddress').trim().isLength({ min: 5 }),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const {
      email, password, firstName, lastName,
      propertyName, propertyType, propertyCity,
      propertyCountry, propertyAddress, propertyPostcode,
      propertyPhone, propertyWebsite, vatNumber,
    } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const verificationToken = crypto.randomBytes(32).toString('hex');

    const [property, user] = await prisma.$transaction(async (tx) => {
      const prop = await tx.property.create({
        data: {
          name: propertyName,
          type: propertyType as PropertyType,
          address: propertyAddress,
          city: propertyCity,
          country: propertyCountry,
          postcode: propertyPostcode,
          phone: propertyPhone,
          website: propertyWebsite,
          vatNumber,
          billingEmail: email,
        },
      });

      const u = await tx.user.create({
        data: {
          email,
          password: hashedPassword,
          firstName,
          lastName,
          role: UserRole.PROPERTY_ADMIN,
          propertyId: prop.id,
          verificationToken,
          verificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return [prop, u];
    });

    // Send verification email (non-blocking)
    emailService
      .sendVerificationEmail(email, firstName, verificationToken)
      .catch((err) => logger.error('Failed to send verification email', err));

    logger.info(`New registration: ${email} for property ${property.name}`);

    res.status(201).json({
      success: true,
      message:
        'Registration successful! Please check your email to verify your account. Your property listing will be reviewed within 24 hours.',
      data: { propertyId: property.id },
    });
  }
);

// ─── Verify Email ────────────────────────────────────────────────────────────

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
    data: {
      emailVerified: true,
      verificationToken: null,
      verificationExpiry: null,
    },
  });

  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
});

// ─── Login ────────────────────────────────────────────────────────────────────

router.post(
  '/login',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        property: {
          select: {
            id: true,
            name: true,
            status: true,
            subscriptionTier: true,
            subscriptionStatus: true,
            trialEndsAt: true,
          },
        },
      },
    });

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Your account has been deactivated' });
      return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({
        success: false,
        message: 'Please verify your email address before logging in',
      });
      return;
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, propertyId: user.propertyId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    // Update last login
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
  }
);

// ─── Get Current User ─────────────────────────────────────────────────────────

router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      avatarUrl: true,
      lastLoginAt: true,
      property: {
        select: {
          id: true,
          name: true,
          type: true,
          city: true,
          country: true,
          status: true,
          subscriptionTier: true,
          subscriptionStatus: true,
          trialEndsAt: true,
          logoUrl: true,
        },
      },
    },
  });

  res.json({ success: true, data: user });
});

// ─── Forgot Password ─────────────────────────────────────────────────────────

router.post(
  '/forgot-password',
  [body('email').isEmail().normalizeEmail()],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetToken,
          resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      emailService
        .sendPasswordResetEmail(email, user.firstName, resetToken)
        .catch((err) => logger.error('Failed to send password reset email', err));
    }

    res.json({
      success: true,
      message: 'If an account with that email exists, you will receive a password reset link shortly.',
    });
  }
);

// ─── Reset Password ────────────────────────────────────────────────────────────

router.post(
  '/reset-password',
  [
    body('token').notEmpty(),
    body('password')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  ],
  async (req: Request, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { token, password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: { gt: new Date() },
      },
    });

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  }
);

// ─── Change Password ───────────────────────────────────────────────────────────

router.post(
  '/change-password',
  authenticate,
  [
    body('currentPassword').notEmpty(),
    body('newPassword')
      .isLength({ min: 8 })
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { currentPassword, newPassword } = req.body;
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
  }
);

export default router;
