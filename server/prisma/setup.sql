-- GuestCheck — Complete Database Setup (idempotent — safe to run multiple times)
-- Run this entire script in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enums (wrapped so they skip gracefully if already exist) ──────────────────

DO $$ BEGIN CREATE TYPE "PropertyType" AS ENUM (
  'HOTEL','HOSTEL','BED_AND_BREAKFAST','VACATION_RENTAL',
  'APARTMENT','BOUTIQUE_HOTEL','RESORT','CARAVAN_PARK','OTHER'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "UserRole" AS ENUM (
  'SUPER_ADMIN','PROPERTY_ADMIN','PROPERTY_MANAGER','RECEPTIONIST'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "SubscriptionTier" AS ENUM (
  'FREE_TRIAL','BASIC','PROFESSIONAL','ENTERPRISE'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "SubscriptionStatus" AS ENUM (
  'TRIALING','ACTIVE','PAST_DUE','CANCELLED','UNPAID','PAUSED'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "PropertyStatus" AS ENUM (
  'PENDING_VERIFICATION','ACTIVE','SUSPENDED','REJECTED'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "BookingSource" AS ENUM (
  'BOOKING_COM','AIRBNB','EXPEDIA','HOTELS_COM','DIRECT','MANUAL','API'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "BookingStatus" AS ENUM (
  'CONFIRMED','CHECKED_IN','CHECKED_OUT','CANCELLED','NO_SHOW'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "RiskLevel" AS ENUM (
  'EXCELLENT','GOOD','AVERAGE','POOR','HIGH_RISK','UNREVIEWED'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE "ReviewStatus" AS ENUM (
  'PUBLISHED','FLAGGED','REMOVED','UNDER_REVIEW'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Add CARAVAN_PARK to existing enum if it was created without it
DO $$ BEGIN
  ALTER TYPE "PropertyType" ADD VALUE IF NOT EXISTS 'CARAVAN_PARK';
EXCEPTION WHEN others THEN NULL; END $$;

-- ── Tables ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "Property" (
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
  -- Registration application data. Kept separate from "description", which is a
  -- user-editable field exposed in Settings — storing metadata there let the
  -- first Settings save destroy the verification record.
  "applicationData"      JSONB,
  "declarationsAcceptedAt" TIMESTAMP(3),
  "declarations"         JSONB,
  "createdAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Property_city_country_idx" ON "Property"("city","country");
CREATE INDEX IF NOT EXISTS "Property_status_idx"       ON "Property"("status");

-- Backfill for databases created before these columns existed.
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "applicationData"        JSONB;
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "declarationsAcceptedAt" TIMESTAMP(3);
ALTER TABLE "Property" ADD COLUMN IF NOT EXISTS "declarations"           JSONB;

CREATE TABLE IF NOT EXISTS "User" (
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
CREATE INDEX IF NOT EXISTS "User_propertyId_idx" ON "User"("propertyId");

CREATE TABLE IF NOT EXISTS "Guest" (
  "id"            TEXT        NOT NULL DEFAULT gen_random_uuid()::text,
  "firstName"     TEXT        NOT NULL,
  "lastName"      TEXT        NOT NULL,
  "email"         TEXT,
  "phone"         TEXT,
  "phoneNormalized" TEXT,   -- digits only; caller-ID lookup matches on this
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
CREATE INDEX IF NOT EXISTS "Guest_email_idx"     ON "Guest"("email");
CREATE INDEX IF NOT EXISTS "Guest_phone_idx"     ON "Guest"("phone");
CREATE INDEX IF NOT EXISTS "Guest_riskLevel_idx" ON "Guest"("riskLevel");

-- Caller-ID support for databases created before phoneNormalized existed.
ALTER TABLE "Guest" ADD COLUMN IF NOT EXISTS "phoneNormalized" TEXT;
UPDATE "Guest"
   SET "phoneNormalized" = regexp_replace(COALESCE("phone", ''), '[^0-9]', '', 'g')
 WHERE "phoneNormalized" IS NULL AND "phone" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "Guest_phoneNormalized_idx" ON "Guest"("phoneNormalized");

CREATE TABLE IF NOT EXISTS "GuestPhone" (
  "id"        TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "guestId"   TEXT    NOT NULL,
  "number"    TEXT    NOT NULL,
  "numberNormalized" TEXT,  -- digits only; caller-ID lookup matches on this
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GuestPhone_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GuestPhone_guestId_number_key" UNIQUE ("guestId","number"),
  CONSTRAINT "GuestPhone_guestId_fkey" FOREIGN KEY ("guestId")
    REFERENCES "Guest"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "GuestPhone_number_idx" ON "GuestPhone"("number");

ALTER TABLE "GuestPhone" ADD COLUMN IF NOT EXISTS "numberNormalized" TEXT;
UPDATE "GuestPhone"
   SET "numberNormalized" = regexp_replace("number", '[^0-9]', '', 'g')
 WHERE "numberNormalized" IS NULL;
CREATE INDEX IF NOT EXISTS "GuestPhone_numberNormalized_idx" ON "GuestPhone"("numberNormalized");

CREATE TABLE IF NOT EXISTS "Booking" (
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
CREATE INDEX IF NOT EXISTS "Booking_guestId_idx"            ON "Booking"("guestId");
CREATE INDEX IF NOT EXISTS "Booking_propertyId_idx"         ON "Booking"("propertyId");
CREATE INDEX IF NOT EXISTS "Booking_checkIn_idx"            ON "Booking"("checkIn");
CREATE INDEX IF NOT EXISTS "Booking_propertyId_checkIn_idx" ON "Booking"("propertyId","checkIn");
CREATE INDEX IF NOT EXISTS "Booking_externalId_idx"         ON "Booking"("externalId");
CREATE UNIQUE INDEX IF NOT EXISTS "Booking_propertyId_externalId_source_key"
  ON "Booking"("propertyId","externalId","source") WHERE "externalId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "Review" (
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
  CONSTRAINT "Review_guestId_fkey"    FOREIGN KEY ("guestId")    REFERENCES "Guest"("id")    ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT "Review_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT "Review_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "User"("id")     ON DELETE RESTRICT  ON UPDATE CASCADE,
  CONSTRAINT "Review_bookingId_fkey"  FOREIGN KEY ("bookingId")  REFERENCES "Booking"("id")  ON DELETE SET NULL  ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Review_guestId_idx"    ON "Review"("guestId");
CREATE INDEX IF NOT EXISTS "Review_propertyId_idx" ON "Review"("propertyId");
CREATE INDEX IF NOT EXISTS "Review_reviewerId_idx" ON "Review"("reviewerId");
CREATE INDEX IF NOT EXISTS "Review_status_idx"     ON "Review"("status");

CREATE TABLE IF NOT EXISTS "ApiKey" (
  "id"          TEXT    NOT NULL DEFAULT gen_random_uuid()::text,
  "propertyId"  TEXT    NOT NULL,
  "key"         TEXT    NOT NULL,
  "name"        TEXT    NOT NULL,
  "permissions" TEXT[]  NOT NULL DEFAULT ARRAY['read_reviews','write_bookings'],
  "lastUsedAt"  TIMESTAMP(3),
  "expiresAt"   TIMESTAMP(3),
  "isActive"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiKey_pkey"        PRIMARY KEY ("id"),
  CONSTRAINT "ApiKey_key_key"     UNIQUE ("key"),
  CONSTRAINT "ApiKey_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ApiKey_propertyId_idx" ON "ApiKey"("propertyId");

CREATE TABLE IF NOT EXISTS "Integration" (
  "id"            TEXT            NOT NULL DEFAULT gen_random_uuid()::text,
  "propertyId"    TEXT            NOT NULL,
  "platform"      "BookingSource" NOT NULL,
  "accessToken"   TEXT,
  "refreshToken"  TEXT,
  "externalId"    TEXT,
  "webhookSecret" TEXT,
  "isActive"      BOOLEAN         NOT NULL DEFAULT true,
  "lastSyncAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Integration_pkey"                  PRIMARY KEY ("id"),
  CONSTRAINT "Integration_propertyId_platform_key" UNIQUE ("propertyId","platform"),
  CONSTRAINT "Integration_propertyId_fkey" FOREIGN KEY ("propertyId")
    REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Waitlist signups from the coming-soon page. Persisted so a signup survives
-- an SMTP failure — the notification email is a convenience, not the record.
CREATE TABLE IF NOT EXISTS "Waitlist" (
  "id"        TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "email"     TEXT NOT NULL,
  "source"    TEXT,
  "ipAddress" TEXT,
  "notified"  BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Waitlist_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Waitlist_email_key" ON "Waitlist"(lower("email"));

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id"         TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId"     TEXT,
  "action"     TEXT NOT NULL,
  "resource"   TEXT NOT NULL,
  "resourceId" TEXT,
  "details"    JSONB,
  "ipAddress"  TEXT,
  "userAgent"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey"      PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId")
    REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx"              ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_resource_resourceId_idx" ON "AuditLog"("resource","resourceId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx"           ON "AuditLog"("createdAt");

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

-- ── Seed: Demo Property ───────────────────────────────────────────────────────

INSERT INTO "Property" (
  "id","name","type","address","city","country","postcode",
  "phone","website","status","subscriptionTier","subscriptionStatus",
  "billingEmail","createdAt","updatedAt"
) VALUES (
  'demo-property-001','The Grand Demo Hotel','HOTEL','123 Main Street',
  'London','GB','W1A 1AA','+44 20 1234 5678','https://granddemohotel.com',
  'ACTIVE','PROFESSIONAL','ACTIVE','billing@granddemohotel.com',
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
) ON CONFLICT ("id") DO NOTHING;

-- ── Seed: Admin + Demo Staff ──────────────────────────────────────────────────
-- Passwords hashed with bcrypt (blowfish, cost 12) via pgcrypto.
--
--   admin@guestcheck.io           →  Admin@GuestCheck123!
--   manager@granddemohotel.com    →  Manager@Demo123!
--   reception@granddemohotel.com  →  Reception@Demo123!

INSERT INTO "User" (
  "id","email","password","firstName","lastName",
  "role","emailVerified","createdAt","updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'admin@guestcheck.io',
  crypt('Admin@GuestCheck123!', gen_salt('bf', 12)),
  'Super','Admin',
  'SUPER_ADMIN',true,
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@guestcheck.io');

INSERT INTO "User" (
  "id","email","password","firstName","lastName",
  "role","propertyId","emailVerified","createdAt","updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'manager@granddemohotel.com',
  crypt('Manager@Demo123!', gen_salt('bf', 12)),
  'Jane','Smith',
  'PROPERTY_ADMIN','demo-property-001',true,
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'manager@granddemohotel.com');

INSERT INTO "User" (
  "id","email","password","firstName","lastName",
  "role","propertyId","emailVerified","createdAt","updatedAt"
)
SELECT
  gen_random_uuid()::text,
  'reception@granddemohotel.com',
  crypt('Reception@Demo123!', gen_salt('bf', 12)),
  'Tom','Jones',
  'RECEPTIONIST','demo-property-001',true,
  CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'reception@granddemohotel.com');

-- ── Data-integrity constraints ────────────────────────────────────────────────
-- Without these, duplicate reviews inflate or deflate a guest's risk score and
-- concurrent webhooks create split guest records whose review history diverges.

-- One review per reviewer per booking.
CREATE UNIQUE INDEX IF NOT EXISTS "Review_bookingId_reviewerId_key"
  ON "Review"("bookingId","reviewerId")
  WHERE "bookingId" IS NOT NULL;

-- One review per property per guest when there is no booking to tie it to.
CREATE UNIQUE INDEX IF NOT EXISTS "Review_propertyId_guestId_nobooking_key"
  ON "Review"("propertyId","guestId")
  WHERE "bookingId" IS NULL;

-- Guest identity: prevent split records from concurrent find-or-create.
CREATE UNIQUE INDEX IF NOT EXISTS "Guest_email_key"
  ON "Guest"(lower("email")) WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "Guest_phoneNormalized_key"
  ON "Guest"("phoneNormalized")
  WHERE "phoneNormalized" IS NOT NULL AND "phoneNormalized" <> '';

-- ── Verify the seed worked ─────────────────────────────────────────────────────
SELECT email, role, "emailVerified", "isActive",
       left("password", 7) AS hash_prefix  -- should show '$2a$12' for all rows
FROM "User"
WHERE email IN (
  'admin@guestcheck.io',
  'manager@granddemohotel.com',
  'reception@granddemohotel.com'
);
