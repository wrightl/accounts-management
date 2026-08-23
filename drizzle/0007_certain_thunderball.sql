ALTER TABLE "quotes" ADD COLUMN "sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "pdf_blob_path" text;