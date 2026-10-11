-- Weekly close checklist sign-offs, reminder schedules and late payment charges.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "reminders_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "reminder_schedule_days" integer[] DEFAULT '{-3,1,7,14}'::integer[] NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "late_payment_charges" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "send_jobs" ADD COLUMN IF NOT EXISTS "reminder_step" integer;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN IF NOT EXISTS "late_payment_for_invoice_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "invoices" ADD CONSTRAINT "invoices_late_payment_for_invoice_id_invoices_id_fk" FOREIGN KEY ("late_payment_for_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "weekly_closes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"closed_by_user_id" uuid,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"bank_reconciled_through" date,
	"snapshot" jsonb NOT NULL,
	CONSTRAINT "weekly_closes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "weekly_closes_closed_by_user_id_users_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_weekly_closes_company" ON "weekly_closes" USING btree ("company_id","closed_at");
