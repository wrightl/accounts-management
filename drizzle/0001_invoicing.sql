ALTER TABLE "company_settings" ADD COLUMN "invoice_number_prefix" text DEFAULT 'DD' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "invoice_next_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "invoice_seq_year" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_blob_path" text;--> statement-breakpoint
INSERT INTO "company_settings" ("name", "legal_name", "bank_name", "financial_year_end_month", "invoice_number_prefix", "invoice_next_seq")
SELECT 'Dot + Dash Consulting', 'Dot and Dash Consulting Ltd', 'Starling', 3, 'DD', 1
WHERE NOT EXISTS (SELECT 1 FROM "company_settings" LIMIT 1);
