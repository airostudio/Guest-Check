import { Response, NextFunction } from 'express';

import { AuthRequest } from '../types';
import prisma from '../lib/prisma';


// Authenticate via API key for external booking system integrations
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

  const key = await prisma.apiKey.findUnique({
    where: { key: apiKey },
    include: {
      property: {
        include: { users: { where: { role: 'PROPERTY_ADMIN' }, take: 1 } },
      },
    },
  });

  if (!key || !key.isActive) {
    res.status(401).json({ success: false, message: 'Invalid or revoked API key' });
    return;
  }

  if (key.expiresAt && key.expiresAt < new Date()) {
    res.status(401).json({ success: false, message: 'API key has expired' });
    return;
  }

  // Update last used timestamp (fire-and-forget)
  prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const adminUser = key.property.users[0];
  if (adminUser) {
    req.user = {
      id: adminUser.id,
      email: adminUser.email,
      firstName: adminUser.firstName,
      lastName: adminUser.lastName,
      role: adminUser.role,
      propertyId: key.propertyId,
      subscriptionTier: key.property.subscriptionTier,
      subscriptionStatus: key.property.subscriptionStatus,
    };
  }

  next();
};
