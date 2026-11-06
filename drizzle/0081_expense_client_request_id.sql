-- The phone sends one id per captured expense, so a retry after going offline can't save it twice.
ALTER TABLE "expenses" ADD COLUMN "client_request_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_expenses_client_request" ON "expenses" ("company_id", "client_request_id") WHERE "client_request_id" is not null;
