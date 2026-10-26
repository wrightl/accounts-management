-- Keep the body of an inbound expense email exactly as it was sent (HTML,
-- plain text, or both) so reviewers can read it next to the receipts.
-- Earlier emails were not kept, so these stay null for them.
ALTER TABLE "inbound_email_jobs" ADD COLUMN IF NOT EXISTS "body_html" text;
--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD COLUMN IF NOT EXISTS "body_text" text;
