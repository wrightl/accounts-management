-- How an emailed expense was paid: what the sender says, and the card on the receipt.
CREATE TYPE "public"."expense_payment_source" AS ENUM('personal', 'company');
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "stated_payment_source" "expense_payment_source";
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "stated_payment_source_via" text;
--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_stated_payment_source_via_known"
  CHECK ("stated_payment_source_via" is null or "stated_payment_source_via" in ('email', 'reply'));
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "receipt_card_last4" text;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "card_last4s" text[] DEFAULT '{}' NOT NULL;
--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD COLUMN IF NOT EXISTS "payment_question_sent_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD COLUMN IF NOT EXISTS "answers_job_id" uuid
  REFERENCES "inbound_email_jobs"("id") ON DELETE SET NULL;
