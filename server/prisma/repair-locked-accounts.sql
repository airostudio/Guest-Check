-- ─────────────────────────────────────────────────────────────────────────────
-- ONE-TIME REPAIR: unlock accounts stranded by the dropped activation write.
--
-- Context: registration creates users with "isActive" = false and the admin
-- approval endpoint flips them to true. That activation PATCH was previously
-- fire-and-forget, so on serverless it was frequently dropped after the
-- response flushed — leaving owners of APPROVED properties unable to log in.
--
-- The endpoint now awaits the write. This script repairs accounts already
-- stranded by the old behaviour.
--
-- Safe to run more than once. Run it in the Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- Preview what will change BEFORE running the update.
SELECT u.id, u.email, u.role, u."isActive", p.name AS property, p.status
FROM "User" u
JOIN "Property" p ON p.id = u."propertyId"
WHERE p.status = 'ACTIVE'
  AND u."isActive" = false;

-- Apply the repair: any user whose property is ACTIVE should be able to log in.
UPDATE "User" u
SET "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP
FROM "Property" p
WHERE p.id = u."propertyId"
  AND p.status = 'ACTIVE'
  AND u."isActive" = false;

-- Confirm nothing is left stranded (should return zero rows).
SELECT u.email, u."isActive", p.status
FROM "User" u
JOIN "Property" p ON p.id = u."propertyId"
WHERE p.status = 'ACTIVE'
  AND u."isActive" = false;
