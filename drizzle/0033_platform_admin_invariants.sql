-- Clear leftover tenant fields on platform operators (0032 nulled company_id only).
UPDATE "users"
SET "expense_inbound_slug" = NULL
WHERE "role" = 'platform_admin' AND "expense_inbound_slug" IS NOT NULL;--> statement-breakpoint
DELETE FROM "company_memberships"
WHERE "user_id" IN (SELECT "id" FROM "users" WHERE "role" = 'platform_admin')
   OR "role" = 'platform_admin';--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_platform_admin_detached" CHECK (
  "role" <> 'platform_admin'
  OR ("company_id" IS NULL AND "expense_inbound_slug" IS NULL)
);--> statement-breakpoint
ALTER TABLE "company_memberships" ADD CONSTRAINT "company_memberships_tenant_role" CHECK (
  "role" <> 'platform_admin'
);
