import { Request } from 'express';
import { UserRole, SubscriptionTier, SubscriptionStatus } from '@prisma/client';

export interface AuthUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  propertyId: string | null;
  subscriptionTier?: SubscriptionTier;
  subscriptionStatus?: SubscriptionStatus;
}

export interface AuthRequest extends Request {
  user?: AuthUser;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  propertyId: string | null;
}

export interface PaginationQuery {
  page?: string;
  limit?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  errors?: string[];
}

// Risk score thresholds (0-6 scale)
export const RISK_THRESHOLDS = {
  EXCELLENT: 5.5,
  GOOD: 4.0,
  AVERAGE: 2.5,
  POOR: 1.0,
  HIGH_RISK: 0,
} as const;

// Subscription plan limits
export interface PlanLimits {
  reviewsPerMonth: number;   // -1 = unlimited
  guestLookups: number;      // -1 = unlimited
  apiAccess: boolean;
  phoneIntegration: boolean;
  teamMembers: number;       // -1 = unlimited
}
