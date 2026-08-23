ALTER TYPE "public"."expense_status" ADD VALUE 'pending';--> statement-breakpoint
CREATE TYPE "public"."expense_source" AS ENUM('manual', 'email');--> statement-breakpoint
CREATE TYPE "public"."inbound_email_job_status" AS ENUM('pending', 'processed', 'rejected', 'failed');--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "source" "expense_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "submitted_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "inbound_email_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resend_email_id" text NOT NULL,
	"from_email" text NOT NULL,
	"to_email" text NOT NULL,
	"subject" text,
	"status" "inbound_email_job_status" DEFAULT 'pending' NOT NULL,
	"expense_id" uuid,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	CONSTRAINT "inbound_email_jobs_resend_email_id_unique" UNIQUE("resend_email_id")
);
--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD CONSTRAINT "inbound_email_jobs_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_inbound_email_jobs_status" ON "inbound_email_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_inbound_email_jobs_created" ON "inbound_email_jobs" USING btree ("created_at");
