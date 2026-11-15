CREATE TYPE "public"."accounting_basis" AS ENUM('cash', 'accruals');--> statement-breakpoint
ALTER TYPE "public"."reconciliation_match_type" ADD VALUE 'drawings';--> statement-breakpoint
ALTER TYPE "public"."reconciliation_match_type" ADD VALUE 'money_put_in';--> statement-breakpoint
ALTER TYPE "public"."reconciliation_match_type" ADD VALUE 'salary';--> statement-breakpoint
CREATE TABLE "year_end_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"reviewed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"outstanding_checks" integer DEFAULT 0 NOT NULL,
	"exported_at" timestamp with time zone,
	"exported_by_user_id" uuid
);
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_balance_pence" integer;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN "opening_balance_date" date;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "year_end_on_fifth_april" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "accounting_basis" "accounting_basis";--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "trading_started_on" date;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "owner_user_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "fixed_asset_threshold_pence" integer DEFAULT 25000 NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "covers_from" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "covers_to" date;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD COLUMN "person_user_id" uuid;--> statement-breakpoint
ALTER TABLE "year_end_runs" ADD CONSTRAINT "year_end_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_runs" ADD CONSTRAINT "year_end_runs_exported_by_user_id_users_id_fk" FOREIGN KEY ("exported_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_year_end_runs_period" ON "year_end_runs" USING btree ("company_id","period_from","period_to");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_person_user_id_users_id_fk" FOREIGN KEY ("person_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Sole traders who chose a year end other than March keep it; the rest use the tax year.
UPDATE "companies" SET "year_end_on_fifth_april" = false WHERE "entity_type" = 'sole_trader' AND "financial_year_end_month" <> 3;