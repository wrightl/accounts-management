ALTER TABLE "expense_receipts" ADD COLUMN "content_sha256" text;--> statement-breakpoint
CREATE INDEX "idx_receipts_sha256" ON "expense_receipts" USING btree ("content_sha256");