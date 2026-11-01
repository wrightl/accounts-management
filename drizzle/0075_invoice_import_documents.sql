-- The uploaded PDF behind a draft. It moves to the invoice when the draft is saved.
ALTER TABLE "invoice_import_drafts" ADD COLUMN "document_path" text;
--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" ADD COLUMN "document_filename" text;
--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" ADD COLUMN "document_size" integer;
--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" ADD COLUMN "document_sha256" text;
--> statement-breakpoint
CREATE INDEX "idx_invoice_import_drafts_company_sha" ON "invoice_import_drafts" ("company_id", "document_sha256");
