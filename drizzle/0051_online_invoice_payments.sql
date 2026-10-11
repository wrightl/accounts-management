-- Public invoice links and online card payments through Stripe Connect.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripe_connect_account_id" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "stripe_connect_charges_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "companies_stripe_connect_account_id_unique" ON "companies" USING btree ("stripe_connect_account_id");
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "public_token" text;
--> statement-breakpoint
UPDATE "invoices" SET "public_token" = replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '') WHERE "public_token" IS NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "public_token" SET DEFAULT replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "public_token" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "viewed_at" timestamp with time zone;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_invoices_public_token" ON "invoices" USING btree ("public_token");
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "stripe_checkout_session_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_payments_stripe_checkout_session" ON "payments" USING btree ("stripe_checkout_session_id");
