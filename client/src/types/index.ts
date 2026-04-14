export type UserRole = 'SUPER_ADMIN' | 'PROPERTY_ADMIN' | 'PROPERTY_MANAGER' | 'RECEPTIONIST';
export type RiskLevel = 'EXCELLENT' | 'GOOD' | 'AVERAGE' | 'POOR' | 'HIGH_RISK' | 'UNREVIEWED';
export type PropertyStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'REJECTED';
export type SubscriptionTier = 'FREE_TRIAL' | 'BASIC' | 'PROFESSIONAL' | 'ENTERPRISE';
export type BookingStatus = 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED' | 'NO_SHOW';
export type BookingSource = 'BOOKING_COM' | 'AIRBNB' | 'EXPEDIA' | 'HOTELS_COM' | 'DIRECT' | 'MANUAL' | 'API';

export interface Property {
  id: string;
  name: string;
  type: string;
  city: string;
  country: string;
  status: PropertyStatus;
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: string;
  trialEndsAt?: string;
  logoUrl?: string;
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  property?: Property;
}

export interface Guest {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  nationality?: string;
  averageRating?: number;
  totalReviews: number;
  riskLevel: RiskLevel;
  profileImage?: string;
}

export interface Review {
  id: string;
  guestId: string;
  propertyId: string;
  overallRating: number;
  cleanliness?: number;
  communication?: number;
  ruleAdherence?: number;
  noiseLevel?: number;
  propertyRespect?: number;
  publicComment?: string;
  privateNote?: string;
  wouldWelcomeBack?: boolean;
  isVerifiedStay: boolean;
  stayMonth?: number;
  stayYear?: number;
  createdAt: string;
  property?: {
    id: string;
    name: string;
    type: string;
    city: string;
    country: string;
    logoUrl?: string;
  };
}

export interface Booking {
  id: string;
  guestId: string;
  guest?: Guest;
  checkIn: string;
  checkOut: string;
  roomNumber?: string;
  numberOfGuests: number;
  source: BookingSource;
  status: BookingStatus;
  externalId?: string;
  externalUrl?: string;
}

export interface CallerCard {
  id: string;
  name: string;
  nationality?: string;
  averageRating?: number;
  totalReviews: number;
  riskLevel: RiskLevel;
  riskLabel: string;
  recommendCount: number;
  notRecommendCount: number;
  alert?: {
    type: 'danger' | 'warning' | 'success' | 'info';
    title: string;
    message: string;
  };
  recentReviews: Review[];
  previousBookings: Booking[];
}

export const RISK_COLORS: Record<RiskLevel, string> = {
  EXCELLENT: '#10b981',
  GOOD: '#3b82f6',
  AVERAGE: '#f59e0b',
  POOR: '#f97316',
  HIGH_RISK: '#ef4444',
  UNREVIEWED: '#9ca3af',
};

export const RISK_LABELS: Record<RiskLevel, string> = {
  EXCELLENT: 'Excellent',
  GOOD: 'Good',
  AVERAGE: 'Average',
  POOR: 'Poor',
  HIGH_RISK: 'High Risk',
  UNREVIEWED: 'No Reviews',
};
