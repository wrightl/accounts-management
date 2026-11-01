-- The PDF actually sent to the client, for invoices issued before the company joined alfa.
ALTER TABLE "invoices" ADD COLUMN "original_document_path" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_document_filename" text;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_document_size" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "original_document_sha256" text;
