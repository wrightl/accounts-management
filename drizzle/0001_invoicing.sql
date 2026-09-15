ALTER TABLE "company_settings" ADD COLUMN "invoice_number_prefix" text DEFAULT 'DD' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "invoice_next_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "invoice_seq_year" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "pdf_blob_path" text;
