ALTER TYPE "public"."role" ADD VALUE IF NOT EXISTS 'pending';--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "quote_next_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "quote_seq_year" integer;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "singleton" boolean DEFAULT true NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "company_settings_singleton" ON "company_settings" USING btree ("singleton");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_reimb_items_expense" ON "reimbursement_items" USING btree ("expense_id");--> statement-breakpoint
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_singleton_true" CHECK ("company_settings"."singleton" = true);