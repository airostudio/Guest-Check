import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

import config from '../config/config';
import { AuthRequest, JwtPayload } from '../types';
import { db } from '../lib/supabase';
import { UserRole, SubscriptionTier, SubscriptionStatus } from '@prisma/client';

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  propertyId: string | null;
  emailVerified: boolean;
  isActive: boolean;
}

interface PropertyRow {
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  status: string;
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.token;

    if (!token) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as JwtPayload;

    const user = await db.selectOne<UserRow>(
      'User',
      { id: decoded.userId },
      { select: 'id,email,firstName,lastName,role,propertyId,emailVerified,isActive' }
    );

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, message: 'User not found or deactivated' });
      return;
    }

    if (!user.emailVerified) {
      res.status(403).json({ success: false, message: 'Please verify your email address' });
      return;
    }

    let property: PropertyRow | null = null;
    if (user.propertyId) {
      property = await db.selectOne<PropertyRow>(
        'Property',
        { id: user.propertyId },
        { select: 'subscriptionTier,subscriptionStatus,status' }
      );
    }

    req.user = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      propertyId: user.propertyId,
      subscriptionTier: property?.subscriptionTier,
      subscriptionStatus: property?.subscriptionStatus,
    };

    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ success: false, message: 'Session expired, please log in again' });
    } else {
      res.status(401).json({ success: false, message: 'Invalid authentication token' });
    }
  }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ success: false, message: 'Insufficient permissions' });
      return;
    }

    next();
  };
};

export const requireSuperAdmin = requireRole('SUPER_ADMIN');
export const requirePropertyAdmin = requireRole('SUPER_ADMIN', 'PROPERTY_ADMIN');
export const requireStaff = requireRole('SUPER_ADMIN', 'PROPERTY_ADMIN', 'PROPERTY_MANAGER', 'RECEPTIONIST');

// Ensure user belongs to the property they're operating on
export const requireSameProperty = (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void => {
  const propertyId = req.params.propertyId || req.body.propertyId;

  if (!req.user) {
    res.status(401).json({ success: false, message: 'Authentication required' });
    return;
  }

  if (req.user.role === 'SUPER_ADMIN') {
    next();
    return;
  }

  if (propertyId && req.user.propertyId !== propertyId) {
    res.status(403).json({ success: false, message: 'Access denied to this property' });
    return;
  }

  next();
};
