-- The date a reimbursement is paid on. Optional while a run is pending; runs
-- already paid take it from when they were paid.
ALTER TABLE "reimbursements" ADD COLUMN "reimbursement_date" date;
--> statement-breakpoint
UPDATE "reimbursements"
SET "reimbursement_date" = ("paid_at" AT TIME ZONE 'Europe/London')::date
WHERE "paid_at" IS NOT NULL;
