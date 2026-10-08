ALTER TABLE "send_jobs" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD COLUMN IF NOT EXISTS "locked_until" timestamp with time zone;
