ALTER TABLE "invoice_import_drafts" ADD COLUMN "client_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" ADD COLUMN "client_created" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_import_drafts" ADD CONSTRAINT "invoice_import_drafts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_import_drafts_client" ON "invoice_import_drafts" USING btree ("client_id");--> statement-breakpoint
-- Saved drafts take the client their invoice got.
UPDATE "invoice_import_drafts" d SET "client_id" = i."client_id"
FROM "invoices" i
WHERE d."invoice_id" = i."id" AND i."company_id" = d."company_id";--> statement-breakpoint
-- Open drafts take the batch's choice for their client in the file, if it still exists.
UPDATE "invoice_import_drafts" d SET "client_id" = c."id"
FROM "invoice_import_batches" b, "clients" c
WHERE d."batch_id" = b."id"
  AND d."client_id" IS NULL
  AND d."status" <> 'committed'
  AND c."company_id" = d."company_id"
  AND c."id"::text = b."client_resolutions" ->> (d."parsed" -> 'client' ->> 'key');--> statement-breakpoint
UPDATE "invoice_import_drafts" d SET "client_created" = true
FROM "invoice_import_batches" b
WHERE d."batch_id" = b."id" AND d."client_id" = ANY(b."created_client_ids");--> statement-breakpoint
ALTER TABLE "invoice_import_batches" DROP COLUMN "column_mapping";--> statement-breakpoint
ALTER TABLE "invoice_import_batches" DROP COLUMN "date_format";--> statement-breakpoint
ALTER TABLE "invoice_import_batches" DROP COLUMN "client_resolutions";--> statement-breakpoint
ALTER TABLE "invoice_import_batches" DROP COLUMN "created_client_ids";