import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole, PropertyType } from '../types/enums';
import crypto from 'crypto';
import config from '../config/config';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../types';
import { emailService } from '../services/email.service';
import logger from '../utils/logger';
import { db } from '../lib/supabase';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

interface UserRow {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  phone: string | null;
  avatarUrl: string | null;
  propertyId: string | null;
  emailVerified: boolean;
  verificationToken: string | null;
  verificationExpiry: string | null;
  resetToken: string | null;
  resetTokenExpiry: string | null;
  lastLoginAt: string | null;
  isActive: boolean;
}

interface PropertyRow {
  id: string;
  name: string;
  type: PropertyType;
  city: string;
  country: string;
  status: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt: string | null;
  logoUrl: string | null;
}

// ─── Register Property + Admin User ──────────────────────────────────────────

router.post('/register', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const {
    email, password, firstName, lastName, phone: applicantPhone, jobTitle,
    propertyName, propertyType, propertyCity,
    propertyCountry, propertyAddress, propertyPostcode,
    propertyPhone, propertyWebsite, vatNumber,
    numberOfRooms, starRating,
    legalBusinessName, businessRegNumber,
    countryOfIncorporation, yearsInOperation,
    bookingPlatforms, listingUrlBookingCom, listingUrlAirbnb, listingUrlOther,
    industryMemberships, howHeard, declarations,
  } = req.body;

  // The five legal declarations are the platform's evidence that the applicant
  // accepted the review-integrity terms. Refuse the application without them.
  const REQUIRED_DECLARATIONS = [
    'isAuthorised', 'onlyRealReviews', 'noFalseReviews', 'agreeTerms', 'understandsReview',
  ] as const;
  const missingDeclaration = REQUIRED_DECLARATIONS.find(
    (k) => declarations?.[k] !== true
  );
  if (missingDeclaration) {
    res.status(400).json({
      success: false,
      message: 'All declarations must be accepted to submit an application',
    });
    return;
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    res.status(400).json({ success: false, message: 'A valid email address is required' });
    return;
  }
  if (!password || password.length < 10) {
    res.status(400).json({ success: false, message: 'Password must be at least 10 characters' });
    return;
  }
  if (!businessRegNumber || businessRegNumber.trim().length < 3) {
    res.status(400).json({ success: false, message: 'Business registration number is required' });
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

  const normalizedEmail = email.toLowerCase().trim();

  try {
    const existing = await db.selectOne<UserRow>('User', { email: normalizedEmail });
    if (existing) {
      res.status(409).json({ success: false, message: 'An account with this email already exists' });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const propertyId = crypto.randomBytes(12).toString('base64url');
    const userId = crypto.randomBytes(12).toString('base64url');

    const applicationData = {
      applicantJobTitle: jobTitle || '',
      applicantPhone: applicantPhone || '',
      numberOfRooms: numberOfRooms || '',
      starRating: starRating || '',
      legalBusinessName: legalBusinessName || '',
      countryOfIncorporation: countryOfIncorporation || '',
      yearsInOperation: yearsInOperation || '',
      bookingPlatforms: Array.isArray(bookingPlatforms) ? bookingPlatforms : [],
      listingUrlBookingCom: listingUrlBookingCom || '',
      listingUrlAirbnb: listingUrlAirbnb || '',
      listingUrlOther: listingUrlOther || '',
      industryMemberships: industryMemberships || '',
      howHeard: howHeard || '',
      submittedFromIp: req.ip ?? null,
      submittedAt: now,
    };

    const property = await db.insert<PropertyRow>('Property', {
      id: propertyId,
      name: propertyName.trim(),
      type: propertyType,
      address: propertyAddress.trim(),
      city: propertyCity.trim(),
      country: propertyCountry.trim(),
      postcode: propertyPostcode?.trim() || null,
      phone: propertyPhone?.trim() || null,
      website: propertyWebsite?.trim() || null,
      vatNumber: vatNumber?.trim() || null,
      businessRegNumber: businessRegNumber?.trim() || null,
      applicationData,
      declarations,
      declarationsAcceptedAt: now,
      billingEmail: normalizedEmail,
      status: 'PENDING_VERIFICATION',
      subscriptionTier: 'FREE_TRIAL',
      subscriptionStatus: 'TRIALING',
      createdAt: now,
      updatedAt: now,
    });

    try {
      await db.insert<UserRow>('User', {
        id: userId,
        email: normalizedEmail,
        password: hashedPassword,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role: UserRole.PROPERTY_ADMIN,
        phone: applicantPhone?.trim() || null,
        propertyId: property.id,
        emailVerified: true,
        isActive: false,
        createdAt: now,
        updatedAt: now,
      });
    } catch (userErr) {
      await db.delete('Property', { id: property.id }).catch(() => {});
      const msg = (userErr as Error).message || '';
      if (msg.includes('duplicate') || msg.includes('23505')) {
        res.status(409).json({ success: false, message: 'An account with this email already exists' });
        return;
      }
      throw userErr;
    }

    logger.info(`New application: ${normalizedEmail} for property "${property.name}" (${property.id})`);

    // Notify admin with full application details
    emailService.sendNewApplicationAlert({
      applicantName: `${firstName.trim()} ${lastName.trim()}`,
      applicantEmail: normalizedEmail,
      applicantPhone: applicantPhone || '',
      jobTitle: jobTitle || '',
      propertyName: propertyName.trim(),
      propertyType,
      propertyAddress: propertyAddress.trim(),
      propertyCity: propertyCity.trim(),
      propertyCountry: propertyCountry.trim(),
      numberOfRooms: numberOfRooms || '',
      legalBusinessName: legalBusinessName || '',
      businessRegNumber: businessRegNumber.trim(),
      vatNumber: vatNumber || '',
      countryOfIncorporation: countryOfIncorporation || '',
      yearsInOperation: yearsInOperation || '',
      propertyWebsite: propertyWebsite || '',
      propertyPhone: propertyPhone || '',
      bookingPlatforms: Array.isArray(bookingPlatforms) ? bookingPlatforms : [],
      listingUrlBookingCom: listingUrlBookingCom || '',
      listingUrlAirbnb: listingUrlAirbnb || '',
      listingUrlOther: listingUrlOther || '',
      industryMemberships: industryMemberships || '',
      howHeard: howHeard || '',
    }).catch((err) => logger.error('Failed to send admin application alert', err));

    // Send acknowledgement to applicant
    emailService.sendApplicationReceived(normalizedEmail, firstName.trim(), propertyName.trim())
      .catch((err) => logger.error('Failed to send application received email', err));

    res.status(201).json({
      success: true,
      message: 'Application submitted! Our team will review your details and contact you within 24 hours.',
    });
  } catch (err) {
    logger.error('Registration error', err);
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
}));

// ─── Verify Email ─────────────────────────────────────────────────────────────

router.get('/verify-email/:token', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { token } = req.params;

  const user = await db.selectOne<UserRow>('User', {
    verificationToken: token,
    verificationExpiry: { gt: new Date() },
  });

  if (!user) {
    res.status(400).json({ success: false, message: 'Invalid or expired verification link' });
    return;
  }

  await db.update('User', { id: user.id }, {
    emailVerified: true,
    verificationToken: null,
    verificationExpiry: null,
    updatedAt: new Date().toISOString(),
  });

  res.json({ success: true, message: 'Email verified successfully. You can now log in.' });
}));

// ─── Login ────────────────────────────────────────────────────────────────────

router.post('/login', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, message: 'Email and password are required' });
    return;
  }

  try {
    const user = await db.selectOne<UserRow>('User', { email: email.toLowerCase().trim() });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: 'Your account is pending verification. You will receive an email once your application has been reviewed.',
      });
      return;
    }

    let property: PropertyRow | null = null;
    if (user.propertyId) {
      property = await db.selectOne<PropertyRow>(
        'Property',
        { id: user.propertyId },
        // Must match /auth/me — the client's Property type marks type/city/
        // country as required and Dashboard renders "{name} · {city}". A thinner
        // payload here left a dangling separator for the whole session.
        { select: 'id,name,type,city,country,status,subscriptionTier,subscriptionStatus,trialEndsAt,logoUrl' }
      );
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, propertyId: user.propertyId },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    db.update('User', { id: user.id }, { lastLoginAt: new Date().toISOString() }).catch(() => {});

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
          property,
        },
      },
    });
  } catch (err) {
    logger.error('Login error', err);
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
}));

// ─── Get Current User ─────────────────────────────────────────────────────────

router.get('/me', authenticate, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await db.selectOne<UserRow>(
    'User',
    { id: req.user!.id },
    { select: 'id,email,firstName,lastName,role,phone,avatarUrl,lastLoginAt,propertyId' }
  );

  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }

  let property: PropertyRow | null = null;
  if (user.propertyId) {
    property = await db.selectOne<PropertyRow>(
      'Property',
      { id: user.propertyId },
      { select: 'id,name,type,city,country,status,subscriptionTier,subscriptionStatus,trialEndsAt,logoUrl' }
    );
  }

  res.json({ success: true, data: { ...user, property } });
}));

// ─── Forgot Password ──────────────────────────────────────────────────────────

router.post('/forgot-password', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ success: false, message: 'Email is required' });
    return;
  }

  try {
    const user = await db.selectOne<UserRow>('User', { email: email.toLowerCase().trim() });

    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await db.update('User', { id: user.id }, {
        resetToken,
        resetTokenExpiry: expiry,
        updatedAt: new Date().toISOString(),
      });
      emailService
        .sendPasswordResetEmail(user.email, user.firstName, resetToken)
        .catch((err) => logger.error('Failed to send password reset email', err));
    }

    res.json({ success: true, message: 'If an account exists for that email, a reset link has been sent.' });
  } catch (err) {
    logger.error('Forgot password error', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}));

// ─── Reset Password ───────────────────────────────────────────────────────────

router.post('/reset-password', asyncHandler(async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body;

  if (!token || !password || password.length < 8) {
    res.status(400).json({ success: false, message: 'A valid token and password (min 8 chars) are required' });
    return;
  }

  try {
    const user = await db.selectOne<UserRow>('User', {
      resetToken: token,
      resetTokenExpiry: { gt: new Date() },
    });

    if (!user) {
      res.status(400).json({ success: false, message: 'Invalid or expired reset link' });
      return;
    }

    await db.update('User', { id: user.id }, {
      password: await bcrypt.hash(password, 12),
      resetToken: null,
      resetTokenExpiry: null,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    logger.error('Reset password error', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}));

// ─── Change Password ──────────────────────────────────────────────────────────

router.post('/change-password', authenticate, asyncHandler(async (req: AuthRequest, res: Response): Promise<void> => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword || newPassword.length < 8) {
    res.status(400).json({ success: false, message: 'Current password and new password (min 8 chars) are required' });
    return;
  }

  try {
    const user = await db.selectOne<UserRow>('User', { id: req.user!.id });

    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      res.status(400).json({ success: false, message: 'Current password is incorrect' });
      return;
    }

    await db.update('User', { id: user.id }, {
      password: await bcrypt.hash(newPassword, 12),
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (err) {
    logger.error('Change password error', err);
    res.status(500).json({ success: false, message: 'Something went wrong. Please try again.' });
  }
}));

export default router;
