CREATE TYPE "public"."send_job_kind" AS ENUM('invoice_send', 'invoice_remind');--> statement-breakpoint
CREATE TYPE "public"."send_job_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "send_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "send_job_kind" NOT NULL,
	"invoice_id" uuid NOT NULL,
	"status" "send_job_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_send_jobs_status" ON "send_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_send_jobs_invoice" ON "send_jobs" USING btree ("invoice_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_send_jobs_pending" ON "send_jobs" USING btree ("kind","invoice_id") WHERE "send_jobs"."status" = 'pending';--> statement-breakpoint
UPDATE "invoices" SET "status" = 'sent' WHERE "status" = 'overdue';--> statement-breakpoint
UPDATE "expenses" SET "category" = NULL WHERE "category" = '';--> statement-breakpoint
UPDATE "expenses" SET "category" = 'Other' WHERE "category" IS NOT NULL AND "category" NOT IN (
	'Travel', 'Meals', 'Software', 'Office', 'Marketing',
	'Professional fees', 'Equipment', 'Training', 'Other'
);--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_category_known" CHECK ("expenses"."category" is null or "expenses"."category" in (
        'Travel', 'Meals', 'Software', 'Office', 'Marketing',
        'Professional fees', 'Equipment', 'Training', 'Other'
      ));