ALTER TYPE "public"."invoice_write_off_kind" ADD VALUE 'fx_difference';--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "default_currency" text;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "net_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "vat_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "gross_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_notes" ADD COLUMN "refunded_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_write_offs" ADD COLUMN "amount_minor" integer;--> statement-breakpoint
UPDATE "invoice_write_offs" SET "amount_minor" = "amount_pence";--> statement-breakpoint
ALTER TABLE "invoice_write_offs" ALTER COLUMN "amount_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fx_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fx_rate_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "fx_rate_source" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "net_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vat_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "gross_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "currency" text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fx_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fx_rate_date" date;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "fx_rate_source" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "net_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vat_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "gross_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "amount_minor" integer;--> statement-breakpoint
UPDATE "payments" SET "amount_minor" = "amount_pence";--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "amount_minor" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "amount_pence_estimated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "currency" text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "fx_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "fx_rate_date" date;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "fx_rate_source" text;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "net_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "vat_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD COLUMN "gross_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "currency" text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "fx_rate" double precision DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "fx_rate_date" date;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "fx_rate_source" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "net_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "vat_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "gross_minor" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "currency" text DEFAULT 'GBP' NOT NULL;--> statement-breakpoint
UPDATE "invoices" SET "net_minor" = "net_pence", "vat_minor" = "vat_pence", "gross_minor" = "gross_pence";--> statement-breakpoint
UPDATE "orders" SET "net_minor" = "net_pence", "vat_minor" = "vat_pence", "gross_minor" = "gross_pence";--> statement-breakpoint
UPDATE "quotes" SET "net_minor" = "net_pence", "vat_minor" = "vat_pence", "gross_minor" = "gross_pence";--> statement-breakpoint
UPDATE "quote_versions" SET "net_minor" = "net_pence", "vat_minor" = "vat_pence", "gross_minor" = "gross_pence";--> statement-breakpoint
UPDATE "credit_notes" SET "net_minor" = "net_pence", "vat_minor" = "vat_pence", "gross_minor" = "gross_pence", "refunded_minor" = "refunded_pence";--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_sterling_totals_match" CHECK ("invoices"."currency" <> 'GBP' OR ("invoices"."net_minor" = "invoices"."net_pence" AND "invoices"."vat_minor" = "invoices"."vat_pence" AND "invoices"."gross_minor" = "invoices"."gross_pence"));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_sterling_totals_match" CHECK ("orders"."currency" <> 'GBP' OR ("orders"."net_minor" = "orders"."net_pence" AND "orders"."vat_minor" = "orders"."vat_pence" AND "orders"."gross_minor" = "orders"."gross_pence"));--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_sterling_totals_match" CHECK ("quote_versions"."currency" <> 'GBP' OR ("quote_versions"."net_minor" = "quote_versions"."net_pence" AND "quote_versions"."vat_minor" = "quote_versions"."vat_pence" AND "quote_versions"."gross_minor" = "quote_versions"."gross_pence"));--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_sterling_totals_match" CHECK ("quotes"."currency" <> 'GBP' OR ("quotes"."net_minor" = "quotes"."net_pence" AND "quotes"."vat_minor" = "quotes"."vat_pence" AND "quotes"."gross_minor" = "quotes"."gross_pence"));--> statement-breakpoint
-- A sterling document's document-currency totals are its sterling totals. These triggers keep
-- that true for every writer, so code that only sets the *_pence columns of a GBP document stays
-- correct. Foreign-currency documents must set both sets themselves; the triggers leave them alone.
CREATE FUNCTION "mirror_sterling_totals"() RETURNS trigger AS $$
BEGIN
	IF NEW."currency" = 'GBP' THEN
		NEW."net_minor" := NEW."net_pence";
		NEW."vat_minor" := NEW."vat_pence";
		NEW."gross_minor" := NEW."gross_pence";
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "invoices_mirror_sterling_totals" BEFORE INSERT OR UPDATE ON "invoices"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_totals"();
--> statement-breakpoint
CREATE TRIGGER "quotes_mirror_sterling_totals" BEFORE INSERT OR UPDATE ON "quotes"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_totals"();
--> statement-breakpoint
CREATE TRIGGER "quote_versions_mirror_sterling_totals" BEFORE INSERT OR UPDATE ON "quote_versions"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_totals"();
--> statement-breakpoint
CREATE TRIGGER "orders_mirror_sterling_totals" BEFORE INSERT OR UPDATE ON "orders"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_totals"();
--> statement-breakpoint
-- Credit notes are in their invoice's currency.
CREATE FUNCTION "mirror_sterling_credit_note"() RETURNS trigger AS $$
BEGIN
	IF (SELECT "currency" FROM "invoices" WHERE "id" = NEW."invoice_id") = 'GBP' THEN
		NEW."net_minor" := NEW."net_pence";
		NEW."vat_minor" := NEW."vat_pence";
		NEW."gross_minor" := NEW."gross_pence";
		NEW."refunded_minor" := NEW."refunded_pence";
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "credit_notes_mirror_sterling" BEFORE INSERT OR UPDATE ON "credit_notes"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_credit_note"();
--> statement-breakpoint
-- Payments and write-offs settle their invoice in its currency. On a sterling invoice the amount
-- is the sterling amount; on a foreign one the writer must give it.
CREATE FUNCTION "mirror_sterling_amount"() RETURNS trigger AS $$
BEGIN
	IF (SELECT "currency" FROM "invoices" WHERE "id" = NEW."invoice_id") = 'GBP' THEN
		NEW."amount_minor" := NEW."amount_pence";
	ELSIF NEW."amount_minor" IS NULL THEN
		RAISE EXCEPTION 'amount_minor is required on % for a foreign-currency invoice', TG_TABLE_NAME;
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "payments_mirror_sterling_amount" BEFORE INSERT OR UPDATE ON "payments"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_amount"();
--> statement-breakpoint
CREATE TRIGGER "invoice_write_offs_mirror_sterling_amount" BEFORE INSERT OR UPDATE ON "invoice_write_offs"
FOR EACH ROW EXECUTE FUNCTION "mirror_sterling_amount"();
