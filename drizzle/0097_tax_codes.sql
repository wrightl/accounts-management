CREATE TYPE "public"."tax_code" AS ENUM('standard', 'reduced', 'zero_rated', 'exempt', 'outside_scope', 'reverse_charge', 'export', 'eu_supply', 'postponed_import');--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "default_tax_code" "tax_code";--> statement-breakpoint
ALTER TABLE "credit_note_line_items" ADD COLUMN "tax_code" "tax_code";--> statement-breakpoint
ALTER TABLE "credit_note_line_items" ADD COLUMN "tax_code_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax_code" "tax_code";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "tax_code_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "tax_code" "tax_code";--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN "tax_code_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "tax_code" "tax_code";--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN "tax_code_needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "tax_code" "tax_code";--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN "tax_code_needs_review" boolean DEFAULT false NOT NULL;