-- Imports are staged on the server, so commit never trusts rows sent back by the browser, large files
-- can commit in chunks, and a mistaken import can be undone as a batch.
CREATE TABLE "invoice_import_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"kind" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"filename" text,
	"column_mapping" jsonb,
	"date_format" text,
	"client_resolutions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_client_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"skipped_rows" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone,
	"undone_at" timestamp with time zone,
	CONSTRAINT "invoice_import_batches_kind_known" CHECK ("kind" in ('csv', 'pdf')),
	CONSTRAINT "invoice_import_batches_status_known" CHECK ("status" in ('draft', 'committed', 'undone', 'discarded'))
);
--> statement-breakpoint
CREATE INDEX "idx_invoice_import_batches_company" ON "invoice_import_batches" ("company_id", "created_at");
--> statement-breakpoint
CREATE TABLE "invoice_import_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL REFERENCES "invoice_import_batches"("id") ON DELETE cascade,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"position" integer NOT NULL,
	"status" text NOT NULL,
	"parsed" jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"invoice_id" uuid REFERENCES "invoices"("id") ON DELETE set null,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_import_drafts_status_known" CHECK ("status" in ('needs_review', 'ready', 'skipped', 'committed'))
);
--> statement-breakpoint
CREATE INDEX "idx_invoice_import_drafts_batch" ON "invoice_import_drafts" ("batch_id", "position");
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "import_batch_id" uuid REFERENCES "invoice_import_batches"("id") ON DELETE set null;
--> statement-breakpoint
CREATE INDEX "idx_invoices_import_batch" ON "invoices" ("import_batch_id");
