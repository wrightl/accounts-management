CREATE TYPE "public"."vat_pence_source" AS ENUM('derived', 'receipt', 'manual');--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "vat_pence_source" "vat_pence_source" DEFAULT 'derived' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "receipt_vat_pence" integer;