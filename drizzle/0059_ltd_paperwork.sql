-- Ltd paperwork and deadlines: Companies House details, the reserves position
-- recorded with each dividend (for board minutes), and filed deadlines.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "incorporated_on" date;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "director_names" text;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "accounts_due" date;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "confirmation_statement_due" date;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "companies_house_synced_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "dividend_declarations" ADD COLUMN IF NOT EXISTS "available_reserves_pence" integer;
--> statement-breakpoint
ALTER TABLE "dividend_declarations" ADD COLUMN IF NOT EXISTS "over_reserves_confirmed" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "deadline_filings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "due_date" date NOT NULL,
  "filed_on" date NOT NULL,
  "filed_by_user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_deadline_filings_company_kind_due" ON "deadline_filings" ("company_id", "kind", "due_date");
