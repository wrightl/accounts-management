-- VAT readiness: company registration flag + default rate; expense header rate.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "vat_registered" boolean DEFAULT false NOT NULL;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "default_vat_rate" integer DEFAULT 20 NOT NULL;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vat_rate" integer DEFAULT 0 NOT NULL;
