-- Invoices issued before a company joined alfa. Imports dated before the company's cutover are
-- brought forward: kept for reference and still owed, but outside P&L, VAT and reserves. No figures
-- change here, because nothing is brought forward until a company sets a cutover.
CREATE TYPE "public"."invoice_source" AS ENUM('alfa', 'import');
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_cutover_date" date;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "source" "invoice_source" DEFAULT 'alfa' NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "brought_forward" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_brought_forward_requires_import" CHECK (NOT "brought_forward" OR "source" = 'import');
--> statement-breakpoint
-- Past imports with a payment are marked by the payment method. Every marked invoice is recorded in
-- the audit log per company, so a wrong mark can be found.
WITH marked AS (
UPDATE "invoices" SET "source" = 'import'
WHERE "id" IN (SELECT "invoice_id" FROM "payments" WHERE "method" = 'import')
RETURNING "id", "company_id"
)
INSERT INTO "audit_log" ("company_id", "action", "entity_type", "meta")
SELECT "company_id", 'invoice.source_backfill', 'invoice', jsonb_build_object('basis', 'payment_method', 'invoiceIds', jsonb_agg("id"))
FROM marked
GROUP BY "company_id";
--> statement-breakpoint
-- Past imports without a payment left no marker. Each import inserted its rows in one transaction,
-- so they share a created_at, and the audit row written just afterwards records how many there were.
WITH marked AS (
UPDATE "invoices" i SET "source" = 'import'
FROM "audit_log" a
WHERE a."action" = 'invoice.import'
	AND a."company_id" = i."company_id"
	AND a."actor_user_id" = i."created_by_user_id"
	AND i."created_at" BETWEEN a."created_at" - interval '5 minutes' AND a."created_at"
	AND i."order_id" IS NULL
	AND i."payment_milestone_id" IS NULL
	AND i."recurring_invoice_id" IS NULL
	AND i."late_payment_for_invoice_id" IS NULL
	AND NOT EXISTS (
		SELECT 1 FROM "send_jobs" j WHERE j."invoice_id" = i."id" AND j."kind" = 'invoice_send'
	)
	AND (
		SELECT count(*) FROM "invoices" s
		WHERE s."company_id" = i."company_id"
			AND s."created_by_user_id" = i."created_by_user_id"
			AND s."created_at" = i."created_at"
	) = (a."meta"->>'count')::integer
	AND i."source" = 'alfa'
RETURNING i."id", i."company_id"
)
INSERT INTO "audit_log" ("company_id", "action", "entity_type", "meta")
SELECT "company_id", 'invoice.source_backfill', 'invoice', jsonb_build_object('basis', 'audit_count', 'invoiceIds', jsonb_agg("id"))
FROM marked
GROUP BY "company_id";
