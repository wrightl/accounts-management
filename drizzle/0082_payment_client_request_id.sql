-- The phone sends one id per Record payment, so a retry after a dropped connection can't record it twice.
ALTER TABLE "payments" ADD COLUMN "client_request_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_payments_client_request" ON "payments" ("invoice_id", "client_request_id") WHERE "client_request_id" is not null;
