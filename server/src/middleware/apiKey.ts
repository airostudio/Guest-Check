import { Response, NextFunction } from 'express';

import { AuthRequest } from '../types';
import { db } from '../lib/supabase';
import logger from '../utils/logger';
import { UserRole, SubscriptionTier, SubscriptionStatus } from '../types/enums';

interface ApiKeyRow {
  id: string;
  propertyId: string;
  key: string;
  isActive: boolean;
  expiresAt: string | null;
}

interface PropertyRow {
  id: string;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  status: string;
}

interface UserRow {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  propertyId: string | null;
}

export const authenticateApiKey = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ success: false, message: 'API key required' });
    return;
  }

  const key = await db.selectOne<ApiKeyRow>('ApiKey', { key: apiKey });

  if (!key || !key.isActive) {
    res.status(401).json({ success: false, message: 'Invalid or revoked API key' });
    return;
  }

  if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
    res.status(401).json({ success: false, message: 'API key has expired' });
    return;
  }

  const property = await db.selectOne<PropertyRow>(
    'Property',
    { id: key.propertyId },
    { select: 'id,subscriptionTier,subscriptionStatus,status' }
  );

  if (!property) {
    res.status(401).json({ success: false, message: 'Invalid API key configuration' });
    return;
  }

  // An API key must not outlive its property's standing.
  if (property.status !== 'ACTIVE') {
    res.status(403).json({ success: false, message: 'Property is not active' });
    return;
  }

  db.update('ApiKey', { id: key.id }, { lastUsedAt: new Date().toISOString() })
    .catch((err) => logger.warn('Failed to update API key lastUsedAt', { id: key.id, err }));

  const admins = await db.select<UserRow>(
    'User',
    { propertyId: key.propertyId, role: 'PROPERTY_ADMIN', isActive: true },
    { select: 'id,email,firstName,lastName,role,propertyId', limit: 1 }
  );
  const adminUser = admins[0];

  // Downstream handlers dereference req.user!. Previously a property with no
  // active PROPERTY_ADMIN left it undefined and still called next(), turning
  // into a TypeError inside the route.
  if (!adminUser) {
    res.status(403).json({
      success: false,
      message: 'This API key has no active administrator account associated with it',
    });
    return;
  }

  req.user = {
    id: adminUser.id,
    email: adminUser.email,
    firstName: adminUser.firstName,
    lastName: adminUser.lastName,
    role: adminUser.role,
    propertyId: key.propertyId,
    subscriptionTier: property.subscriptionTier,
    subscriptionStatus: property.subscriptionStatus,
  };

  next();
};
