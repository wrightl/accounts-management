-- AI bookkeeper: spending category suggestions on bank transactions.
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "suggested_category" text;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "suggested_category_reason" text;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "suggested_category_source" text;
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN IF NOT EXISTS "category_suggestion_dismissed" boolean DEFAULT false NOT NULL;
