-- One inbound email can create several expenses (one per attachment).
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "inbound_email_job_id" uuid
  REFERENCES "inbound_email_jobs"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_inbound_email_job" ON "expenses" USING btree ("inbound_email_job_id");
--> statement-breakpoint
UPDATE "expenses" e SET "inbound_email_job_id" = j."id"
  FROM "inbound_email_jobs" j
  WHERE j."expense_id" = e."id" AND e."inbound_email_job_id" IS NULL;
