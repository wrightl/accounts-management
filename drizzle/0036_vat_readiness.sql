-- VAT readiness: company registration flag + default rate; expense header rate.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "vat_registered" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_vat_rate" integer DEFAULT 20 NOT NULL;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vat_rate" integer DEFAULT 0 NOT NULL;
