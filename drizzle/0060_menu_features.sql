-- Per-person, per-company choice of optional menu items. Null shows everything.
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "menu_features" text[];
--> statement-breakpoint
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "menu_suggestions_dismissed" text[] DEFAULT '{}' NOT NULL;
