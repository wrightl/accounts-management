-- Project profitability: tag expenses to a client or order, and link rebilled
-- expenses to the invoice line that recharges them.
ALTER TABLE "expenses" RENAME COLUMN "billable_client_id" TO "client_id";
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "order_id" uuid REFERENCES "orders"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_client" ON "expenses" ("client_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_expenses_order" ON "expenses" ("order_id");
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "expense_id" uuid REFERENCES "expenses"("id") ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_line_items_expense" ON "invoice_line_items" ("expense_id");
