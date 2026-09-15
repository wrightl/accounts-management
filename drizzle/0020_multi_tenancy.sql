CREATE TYPE "public"."entity_type" AS ENUM('limited_company', 'sole_trader');--> statement-breakpoint
ALTER TABLE "company_settings" RENAME TO "companies";--> statement-breakpoint
ALTER TABLE "companies" DROP CONSTRAINT IF EXISTS "company_settings_singleton_true";--> statement-breakpoint
DROP INDEX IF EXISTS "company_settings_singleton";--> statement-breakpoint
ALTER TABLE "companies" DROP COLUMN IF EXISTS "singleton";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "entity_type" "entity_type" DEFAULT 'limited_company' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "utr" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "bank_spending_categories" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "shareholders" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "dividend_declarations" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "quote_decline_reason_categories" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD COLUMN "company_id" uuid;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD COLUMN "company_id" uuid;--> statement-breakpoint
-- Backfill every existing row onto the first company (if any).
UPDATE "users" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "clients" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "invoices" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "expenses" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "reimbursements" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "audit_log" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "bank_accounts" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "bank_spending_categories" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "shareholders" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "dividend_declarations" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "quote_decline_reason_categories" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "orders" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "quotes" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "send_jobs" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "inbound_email_jobs" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
UPDATE "recurring_invoices" SET "company_id" = (SELECT "id" FROM "companies" ORDER BY "created_at" ASC LIMIT 1) WHERE "company_id" IS NULL;--> statement-breakpoint
-- Without a placeholder company, drop unscoped rows that could not be backfilled
-- (e.g. global quote decline seeds from 0011) so NOT NULL constraints can apply.
DELETE FROM "quote_decline_reason_categories" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "bank_spending_categories" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "clients" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "invoices" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "expenses" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "reimbursements" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "bank_accounts" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "shareholders" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "dividend_declarations" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "orders" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "quotes" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "send_jobs" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "inbound_email_jobs" WHERE "company_id" IS NULL;--> statement-breakpoint
DELETE FROM "recurring_invoices" WHERE "company_id" IS NULL;--> statement-breakpoint
ALTER TABLE "clients" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "reimbursements" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_accounts" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bank_spending_categories" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "shareholders" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dividend_declarations" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_decline_reason_categories" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "send_jobs" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ALTER COLUMN "company_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reimbursements" ADD CONSTRAINT "reimbursements_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_spending_categories" ADD CONSTRAINT "bank_spending_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_declarations" ADD CONSTRAINT "dividend_declarations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_decline_reason_categories" ADD CONSTRAINT "quote_decline_reason_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "send_jobs" ADD CONSTRAINT "send_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbound_email_jobs" ADD CONSTRAINT "inbound_email_jobs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_invoices" ADD CONSTRAINT "recurring_invoices_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT IF EXISTS "invoices_number_unique";--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_number_unique";--> statement-breakpoint
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_number_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_bank_spending_category_name";--> statement-breakpoint
DROP INDEX IF EXISTS "uniq_quote_decline_reason_categories_name";--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_invoices_company_number" ON "invoices" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_quotes_company_number" ON "quotes" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_orders_company_number" ON "orders" USING btree ("company_id","number");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_bank_spending_category_company_name" ON "bank_spending_categories" USING btree ("company_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_quote_decline_reason_categories_company_name" ON "quote_decline_reason_categories" USING btree ("company_id",lower("name"));--> statement-breakpoint
CREATE INDEX "idx_users_company" ON "users" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_clients_company" ON "clients" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_company" ON "invoices" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_expenses_company" ON "expenses" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_reimbursements_company" ON "reimbursements" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_audit_company" ON "audit_log" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_bank_accounts_company" ON "bank_accounts" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_shareholders_company" ON "shareholders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_dividend_declarations_company" ON "dividend_declarations" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_orders_company" ON "orders" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_company" ON "quotes" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_send_jobs_company" ON "send_jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_inbound_email_jobs_company" ON "inbound_email_jobs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_recurring_invoices_company" ON "recurring_invoices" USING btree ("company_id");
