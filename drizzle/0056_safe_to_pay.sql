-- "Safe to pay yourself": VAT quarter stagger and cash buffer.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "vat_quarter_end_month" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "safe_to_pay_buffer_months" integer DEFAULT 1 NOT NULL;
