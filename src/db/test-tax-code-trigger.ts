/**
 * Test databases only: a trigger that codes any line or expense inserted
 * without a tax code, from its rate, and flags it for review.
 *
 * Production has no such trigger. Since migration 0099 an insert without a
 * code fails there, because a missing code is never guessed for VAT. Many
 * tests insert rows directly with only a rate; this keeps them working
 * without each one choosing a code. The app's own writers are checked by
 * tests/integration/tax-code-writers.test.ts, which expects
 * taxCodeNeedsReview to be false, so a writer that leaves the code to this
 * trigger fails that test.
 *
 * Uses tax_code_for_rate from migration 0099.
 */
export const TEST_TAX_CODE_TRIGGER_SQL = `
CREATE FUNCTION "fill_missing_tax_code"() RETURNS trigger AS $$
DECLARE
	registered boolean;
BEGIN
	IF NEW."tax_code" IS NOT NULL THEN
		RETURN NEW;
	END IF;
	IF TG_TABLE_NAME = 'expenses' THEN
		SELECT c."vat_registered" INTO registered FROM "companies" c WHERE c."id" = NEW."company_id";
	ELSIF TG_TABLE_NAME = 'invoice_line_items' THEN
		SELECT c."vat_registered" INTO registered
		FROM "invoices" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = NEW."invoice_id";
	ELSIF TG_TABLE_NAME = 'credit_note_line_items' THEN
		SELECT c."vat_registered" INTO registered
		FROM "credit_notes" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = NEW."credit_note_id";
	ELSIF TG_TABLE_NAME = 'quote_line_items' THEN
		SELECT c."vat_registered" INTO registered
		FROM "quotes" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = NEW."quote_id";
	ELSIF TG_TABLE_NAME = 'order_line_items' THEN
		SELECT c."vat_registered" INTO registered
		FROM "orders" p JOIN "companies" c ON c."id" = p."company_id" WHERE p."id" = NEW."order_id";
	END IF;
	NEW."tax_code" := "tax_code_for_rate"(NEW."vat_rate", coalesce(registered, false));
	NEW."tax_code_needs_review" := true;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "expenses_fill_tax_code" BEFORE INSERT ON "expenses"
FOR EACH ROW EXECUTE FUNCTION "fill_missing_tax_code"();
CREATE TRIGGER "invoice_line_items_fill_tax_code" BEFORE INSERT ON "invoice_line_items"
FOR EACH ROW EXECUTE FUNCTION "fill_missing_tax_code"();
CREATE TRIGGER "credit_note_line_items_fill_tax_code" BEFORE INSERT ON "credit_note_line_items"
FOR EACH ROW EXECUTE FUNCTION "fill_missing_tax_code"();
CREATE TRIGGER "quote_line_items_fill_tax_code" BEFORE INSERT ON "quote_line_items"
FOR EACH ROW EXECUTE FUNCTION "fill_missing_tax_code"();
CREATE TRIGGER "order_line_items_fill_tax_code" BEFORE INSERT ON "order_line_items"
FOR EACH ROW EXECUTE FUNCTION "fill_missing_tax_code"();
`;
