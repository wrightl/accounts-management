DELETE FROM "company_memberships"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'platform_admin');--> statement-breakpoint
UPDATE "users"
SET "company_id" = null
WHERE "role" = 'platform_admin' AND "company_id" IS NOT NULL;
