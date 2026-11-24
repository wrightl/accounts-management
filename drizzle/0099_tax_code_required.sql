-- Roadmap item 17: every line and expense has a tax code.
--
-- The app sets the code on every write (PR 3), and data migrations 0005 and 0006 coded older rows.
-- Any row that still has no code is coded from its rate and flagged for review before the columns
-- become required, so this migration cannot fail on a row that slipped through. After this, an
-- insert without a code fails: tax codes feed VAT returns, so a missing one is never guessed.
--
-- The rule matches inferStoredTaxCode in src/lib/tax-codes.ts, without the expense category
-- guesses: 5% is reduced, 0% is zero rated (outside scope if the company isn't VAT registered),
-- and any other rate is standard. Only standard and reduced carry a rate, so the rate checks hold.
CREATE FUNCTION "tax_code_for_rate"("rate" integer, "registered" boolean) RETURNS "tax_code" AS $$
	SELECT CASE
		WHEN "rate" = 5 THEN 'reduced'::"tax_code"
		WHEN "rate" = 0 AND "registered" THEN 'zero_rated'::"tax_code"
		WHEN "rate" = 0 THEN 'outside_scope'::"tax_code"
		ELSE 'standard'::"tax_code"
	END;
$$ LANGUAGE sql IMMUTABLE;
--> statement-breakpoint
-- Rows that somehow still have no code, coded and flagged by the same rule.
UPDATE "expenses" e SET "tax_code" = "tax_code_for_rate"(e."vat_rate", c."vat_registered"), "tax_code_needs_review" = true
FROM "companies" c WHERE c."id" = e."company_id" AND e."tax_code" IS NULL;
--> statement-breakpoint
UPDATE "invoice_line_items" l SET "tax_code" = "tax_code_for_rate"(l."vat_rate", c."vat_registered"), "tax_code_needs_review" = true
FROM "invoices" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = l."invoice_id" AND l."tax_code" IS NULL;
--> statement-breakpoint
UPDATE "credit_note_line_items" l SET "tax_code" = "tax_code_for_rate"(l."vat_rate", c."vat_registered"), "tax_code_needs_review" = true
FROM "credit_notes" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = l."credit_note_id" AND l."tax_code" IS NULL;
--> statement-breakpoint
UPDATE "quote_line_items" l SET "tax_code" = "tax_code_for_rate"(l."vat_rate", c."vat_registered"), "tax_code_needs_review" = true
FROM "quotes" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = l."quote_id" AND l."tax_code" IS NULL;
--> statement-breakpoint
UPDATE "order_line_items" l SET "tax_code" = "tax_code_for_rate"(l."vat_rate", c."vat_registered"), "tax_code_needs_review" = true
FROM "orders" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = l."order_id" AND l."tax_code" IS NULL;
--> statement-breakpoint
ALTER TABLE "credit_note_line_items" ALTER COLUMN "tax_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "tax_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ALTER COLUMN "tax_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "order_line_items" ALTER COLUMN "tax_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_line_items" ALTER COLUMN "tax_code" SET NOT NULL;
