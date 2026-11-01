-- Whether reminders and overdue alerts apply to an invoice. Imports start switched off, so a new
-- system never chases old debts unasked. Past imports already being chased carry on.
ALTER TABLE "invoices" ADD COLUMN "chase_enabled" boolean DEFAULT true NOT NULL;
--> statement-breakpoint
UPDATE "invoices" i SET "chase_enabled" = false
WHERE i."source" = 'import'
	AND NOT EXISTS (
		SELECT 1 FROM "send_jobs" j WHERE j."invoice_id" = i."id" AND j."kind" = 'invoice_remind'
	);
