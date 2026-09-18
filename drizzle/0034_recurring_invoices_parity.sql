-- Recurring invoice templates: name, send mode, end limits, next run cache.
ALTER TABLE "recurring_invoices" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "recurring_invoices" SET "name" = 'Recurring invoice' WHERE "name" IS NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "on_generate" text DEFAULT 'draft' NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "ends_on" date;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "max_occurrences" integer;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "occurrence_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "next_run_on" date;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_day_of_month_range" CHECK (
  "day_of_month" >= 1 AND "day_of_month" <= 28
);--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_on_generate" CHECK (
  "on_generate" IN ('draft', 'send')
);--> statement-breakpoint
-- Link generated invoices back to their template.
ALTER TABLE "invoices" ADD COLUMN "recurring_invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_recurring_invoice_id_recurring_invoices_id_fk" FOREIGN KEY ("recurring_invoice_id") REFERENCES "public"."recurring_invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoices_recurring" ON "invoices" USING btree ("recurring_invoice_id");
