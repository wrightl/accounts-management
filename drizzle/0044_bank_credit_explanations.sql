ALTER TYPE "public"."reconciliation_match_type" ADD VALUE IF NOT EXISTS 'other_income';--> statement-breakpoint
ALTER TYPE "public"."reconciliation_match_type" ADD VALUE IF NOT EXISTS 'transfer';--> statement-breakpoint
ALTER TYPE "public"."reconciliation_match_type" ADD VALUE IF NOT EXISTS 'tax_or_loan';--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD COLUMN "income_category" text;--> statement-breakpoint
CREATE TABLE "income_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "income_categories" ADD CONSTRAINT "income_categories_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_income_category_company_name" ON "income_categories" USING btree ("company_id", lower("name"));
