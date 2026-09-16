ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "platform_admin" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "suspended_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "suspended_reason" text;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"maintenance_banner" text,
	"recurring_invoices_enabled" boolean DEFAULT false NOT NULL,
	"default_receipt_ocr_provider" text DEFAULT 'local' NOT NULL,
	"default_receipt_ocr_model" text DEFAULT 'google/gemini-2.5-flash' NOT NULL,
	"last_cron_daily_at" timestamp with time zone,
	"last_cron_inbound_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "platform_settings" ("id") VALUES (1) ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" text NOT NULL,
	"source" text NOT NULL,
	"message" text NOT NULL,
	"digest" text,
	"company_id" uuid,
	"actor_user_id" uuid,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_logs" ADD CONSTRAINT "platform_logs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "platform_logs" ADD CONSTRAINT "platform_logs_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_logs_level_created" ON "platform_logs" USING btree ("level","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_logs_source" ON "platform_logs" USING btree ("source");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_platform_logs_created" ON "platform_logs" USING btree ("created_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "company_support_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"author_user_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_support_notes" ADD CONSTRAINT "company_support_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "company_support_notes" ADD CONSTRAINT "company_support_notes_author_user_id_users_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_company_support_notes_company" ON "company_support_notes" USING btree ("company_id");
--> statement-breakpoint
-- Seed break-glass platform admins from known bootstrap emails when present.
UPDATE "users"
SET "platform_admin" = true
WHERE lower("email") IN ('lee@dotanddashconsulting.com');
