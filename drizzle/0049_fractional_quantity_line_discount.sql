-- Fractional line quantities (e.g. 1.5 days) and per-line percentage discounts.
ALTER TABLE "invoice_line_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 3);
--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "quote_line_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 3);
--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "order_line_items" ALTER COLUMN "quantity" SET DATA TYPE numeric(12, 3);
--> statement-breakpoint
ALTER TABLE "order_line_items" ADD COLUMN IF NOT EXISTS "discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL;
