-- GuestCheck — Complete Database Setup
-- Run this entire script in the Supabase SQL Editor to set up the schema and
-- seed the initial admin account.
-- ─────────────────────────────────────────────────────────────────────────────

-- Required for gen_random_uuid() and bcrypt password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums ─────────────────────────────────────────────────────────────────────

CREATE TYPE "PropertyType" AS ENUM (
  'HOTEL', 'HOSTEL', 'BED_AND_BREAKFAST', 'VACATION_RENTAL',
  'APARTMENT', 'BOUTIQUE_HOTEL', 'RESORT', 'CARAVAN_PARK', 'OTHER'
);

CREATE TYPE "UserRole" AS ENUM (
  'SUPER_ADMIN', 'PROPERTY_ADMIN', 'PROPERTY_MANAGER', 'RECEPTIONIST'
);

CREATE TYPE "SubscriptionTier" AS ENUM (
  'FREE_TRIAL', 'BASIC', 'PROFESSIONAL', 'ENTERPRISE'
);

CREATE TYPE "SubscriptionStatus" AS ENUM (
  'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'UNPAID', 'PAUSED'
);

CREATE TYPE "PropertyStatus" AS ENUM (
  'PENDING_VERIFICATION', 'ACTIVE', 'SUSPENDED', 'REJECTED'
);

CREATE TYPE "BookingSource" AS ENUM (
  'BOOKING_COM', 'AIRBNB', 'EXPEDIA', 'HOTELS_COM', 'DIRECT', 'MANUAL', 'API'
);

CREATE TYPE "BookingStatus" AS ENUM (
  'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW'
);

CREATE TYPE "RiskLevel" AS ENUM (
  'EXCELLENT', 'GOOD', 'AVERAGE', 'POOR', 'HIGH_RISK', 'UNREVIEWED'
);

CREATE TYPE "ReviewStatus" AS ENUM (
  'PUBLISHED', 'FLAGGED', 'REMOVED', 'UNDER_REVIEW'
);

-- ── Tables ─────────────────────────────────────────────────────────────────────

CREATE TABLE "Property" (
  "id"                   TEXT             NOT NULL DEFAULT gen_random_uuid()::text,
  "name"                 TEXT             NOT NULL,
  "type"                 "PropertyType"   NOT NULL,
  "address"              TEXT             NOT NULL,
  "city"                 TEXT             NOT NULL,
  "country"              TEXT             NOT NULL,
  "postcode"             TEXT,
  "phone"                TEXT,
  "website"              TEXT,
  "logoUrl"              TEXT,
  "description"          TEXT,
  "status"               "PropertyStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
  "stripeCustomerId"     TEXT,
  "subscriptionTier"     "SubscriptionTier"   NOT NULL DEFAULT 'FREE_TRIAL',
  "subscriptionStatus"   "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "stripeSubscriptionId" TEXT,
  "trialEndsAt"          TIMESTAMP(3),
  "billingEmail"         TEXT,
  "vatNumber"            TEXT,
  "businessRegNumber"    TEXT,
  "verifiedAt"           TIMESTAMP(3),
  "verifiedBy"           TEXT,
  "rejectionReason"      TEXT,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Property_city_country_idx" ON "Property"("city", "country");
CREATE INDEX "Property_status_idx" ON "Property"("status");

CREATE TABLE "User" (
  "id"                 TEXT       NOT NULL DEFAULT gen_random_uuid()::text,
  "email"              TEXT       NOT NULL,
  "password"           TEXT       NOT NULL,
  "firstName"          TEXT       NOT NULL,
  "lastName"           TEXT       NOT NULL,
  "role"               "UserRole" NOT NULL DEFAULT 'PROPERTY_MANAGER',
  "phone"              TEXT,
  "avatarUrl"          TEXT,
  "propertyId"         TEXT,
  "emailVerified"      BOOLEAN    NOT NULL DEFAULT false,
  "verificationToken"  TEXT,
  "verificationExpiry" TIMESTAMP(3),
  "resetToken"         TEXT,
  "resetTokenExpiry"   TIMESTAMP(3),
  "lastLoginAt"        TIMESTAMP(3),
  "isActive"           BOOLEAN    NOT NULL DEFAULT true,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "User_email_key" UNIQUE ("email"),
  CONSTRAINT "User_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "User_propertyId_idx" ON "User"("propertyId");

CREATE TABLE "Guest" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "firstName"     TEXT        NOT NULL,
  "lastName"      TEXT        NOT NULL,
  "email"         TEXT,
  "phone"         TEXT,
  "nationality"   TEXT,
  "idType"        TEXT,
  "idLast4"       TEXT,
  "profileImage"  TEXT,
  "notes"         TEXT,
  "averageRating" DOUBLE PRECISION,
  "totalReviews"  INTEGER     NOT NULL DEFAULT 0,
  "riskLevel"     "RiskLevel" NOT NULL DEFAULT 'UNREVIEWED',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Guest_email_idx"     ON "Guest"("email");
CREATE INDEX "Guest_phone_idx"     ON "Guest"("phone");
CREATE INDEX "Guest_riskLevel_idx" ON "Guest"("riskLevel");

CREATE TABLE "GuestPhone" (
  "id"        TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "guestId"   TEXT    NOT NULL,
  "number"    TEXT    NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestPhone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestPhone_guestId_number_key" UNIQUE ("guestId", "number"),
  CONSTRAINT "GuestPhone_guestId_fkey" FOREIGN KEY ("guestId")
    REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "GuestPhone_number_idx" ON "GuestPhone"("number");

CREATE TABLE "Booking" (
  "id"             TEXT            NOT NULL DEFAULT gen_random_uuid()::text,
  "guestId"        TEXT            NOT NULL,
  "propertyId"     TEXT            NOT NULL,
  "checkIn"        TIMESTAMP(3)    NOT NULL,
  "checkOut"       TIMESTAMP(3)    NOT NULL,
  "roomNumber"     TEXT,
  "numberOfGuests" INTEGER         NOT NULL DEFAULT 1,
  "totalAmount"    DOUBLE PRECISION,
  "currency"       TEXT            DEFAULT 'USD',
  "source"         "BookingSource" NOT NULL DEFAULT 'MANUAL',
  "externalId"     TEXT,
  "externalUrl"    TEXT,
  "status"         "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
  "notes"          TEXT,
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Booking_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Booking_guestId_fkey" FOREIGN KEY ("guestId")
    REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Booking_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Booking_guestId_idx"            ON "Booking"("guestId");
CREATE INDEX "Booking_propertyId_idx"         ON "Booking"("propertyId");
CREATE INDEX "Booking_checkIn_idx"            ON "Booking"("checkIn");
CREATE INDEX "Booking_propertyId_checkIn_idx" ON "Booking"("propertyId", "checkIn");
CREATE INDEX "Booking_externalId_idx"         ON "Booking"("externalId");
-- Prevents duplicate external bookings per property+source (NULLs are exempt)
CREATE UNIQUE INDEX "Booking_propertyId_externalId_source_key"
  ON "Booking"("propertyId", "externalId", "source")
  WHERE "externalId" IS NOT NULL;

CREATE TABLE "Review" (
  "id"              TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "guestId"         TEXT    NOT NULL,
  "propertyId"      TEXT    NOT NULL,
  "reviewerId"      TEXT    NOT NULL,
  "bookingId"       TEXT,
  "overallRating"   INTEGER NOT NULL,
  "cleanliness"     INTEGER,
  "communication"   INTEGER,
  "ruleAdherence"   INTEGER,
  "noiseLevel"      INTEGER,
  "propertyRespect" INTEGER,
  "publicComment"   TEXT,
  "privateNote"     TEXT,
  "wouldWelcomeBack" BOOLEAN,
  "stayMonth"       INTEGER,
  "stayYear"        INTEGER,
  "status"          "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
  "flagReason"      TEXT,
  "moderatedAt"     TIMESTAMP(3),
  "moderatedBy"     TEXT,
  "isVerifiedStay"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Review_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Review_guestId_fkey" FOREIGN KEY ("guestId")
    REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Review_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId")
    REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Review_bookingId_fkey" FOREIGN KEY ("bookingId")
    REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Review_guestId_idx"    ON "Review"("guestId");
CREATE INDEX "Review_propertyId_idx" ON "Review"("propertyId");
CREATE INDEX "Review_reviewerId_idx" ON "Review"("reviewerId");
CREATE INDEX "Review_status_idx"     ON "Review"("status");

CREATE TABLE "ApiKey" (
  "id"          TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "propertyId"  TEXT    NOT NULL,
  "key"         TEXT    NOT NULL,
  "name"        TEXT    NOT NULL,
  "permissions" TEXT[]  NOT NULL DEFAULT ARRAY['read_reviews','write_bookings'],
  "lastUsedAt"  TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3),
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ApiKey_key_key" UNIQUE ("key"),
  CONSTRAINT "ApiKey_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ApiKey_propertyId_idx" ON "ApiKey"("propertyId");

CREATE TABLE "Integration" (
  "id"            TEXT           NOT NULL DEFAULT gen_random_uuid()::text,
  "propertyId"    TEXT           NOT NULL,
  "platform"      "BookingSource" NOT NULL,
  "accessToken"   TEXT,
  "refreshToken"  TEXT,
  "externalId"    TEXT,
  "webhookSecret" TEXT,
  "isActive"      BOOLEAN        NOT NULL DEFAULT true,
  "lastSyncAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Integration_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Integration_propertyId_platform_key" UNIQUE ("propertyId", "platform"),
  CONSTRAINT "Integration_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AuditLog" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"     TEXT,
  "action"     TEXT NOT NULL,
  "resource"   TEXT NOT NULL,
  "resourceId" TEXT,
  "details"    JSONB,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "AuditLog_userId_idx"              ON "AuditLog"("userId");
CREATE INDEX "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource", "resourceId");
CREATE INDEX "AuditLog_createdAt_idx"           ON "AuditLog"("createdAt");

-- ── Prisma migrations tracking table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                  TEXT        NOT NULL,
  "checksum"            TEXT        NOT NULL,
  "finished_at"         TIMESTAMPTZ,
  "migration_name"      TEXT        NOT NULL,
  "logs"                TEXT,
  "rolled_back_at"      TIMESTAMPTZ,
  "started_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER     NOT NULL DEFAULT 0,
  CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
);

-- ── Seed Data ─────────────────────────────────────────────────────────────────
-- Passwords are hashed with bcrypt (cost 12) via pgcrypto.
-- Super Admin  → admin@guestcheck.io      / Admin@GuestCheck123!
-- Manager      → manager@granddemohotel.com / Manager@Demo123!
-- Receptionist → reception@granddemohotel.com / Reception@Demo123!

-- Demo property (set to ACTIVE so demo staff can log in immediately)
INSERT INTO "Property" (
  "id", "name", "type", "address", "city", "country", "postcode",
  "phone", "website", "status", "subscriptionTier", "subscriptionStatus",
  "billingEmail", "createdAt", "updatedAt"
) VALUES (
  'demo-property-001',
  'The Grand Demo Hotel',
  'HOTEL',
  '123 Main Street',
  'London',
  'GB',
  'W1A 1AA',
  '+44 20 1234 5678',
  'https://granddemohotel.com',
  'ACTIVE',
  'PROFESSIONAL',
  'ACTIVE',
  'billing@granddemohotel.com',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- Super admin (no propertyId — platform-level access)
INSERT INTO "User" (
  "id", "email", "password", "firstName", "lastName",
  "role", "emailVerified", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'admin@guestcheck.io',
  crypt('Admin@GuestCheck123!', gen_salt('bf', 12)),
  'Super', 'Admin',
  'SUPER_ADMIN', true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;

-- Demo property admin
INSERT INTO "User" (
  "id", "email", "password", "firstName", "lastName",
  "role", "propertyId", "emailVerified", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'manager@granddemohotel.com',
  crypt('Manager@Demo123!', gen_salt('bf', 12)),
  'Jane', 'Smith',
  'PROPERTY_ADMIN', 'demo-property-001', true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;

-- Demo receptionist
INSERT INTO "User" (
  "id", "email", "password", "firstName", "lastName",
  "role", "propertyId", "emailVerified", "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid()::text,
  'reception@granddemohotel.com',
  crypt('Reception@Demo123!', gen_salt('bf', 12)),
  'Tom', 'Jones',
  'RECEPTIONIST', 'demo-property-001', true,
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
) ON CONFLICT ("email") DO NOTHING;
