-- Light ledger: opening balances, director's loan accounts and CT settings.
CREATE TYPE "public"."director_loan_entry_kind" AS ENUM('opening', 'drawing', 'paid_in');
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "opening_balances_as_at" date;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "opening_reserves_pence" integer;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "associated_companies" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "director_loan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"director_user_id" uuid NOT NULL,
	"kind" "director_loan_entry_kind" NOT NULL,
	"entry_date" date NOT NULL,
	"amount_pence" integer NOT NULL,
	"description" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "director_loan_entries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "director_loan_entries_director_user_id_users_id_fk" FOREIGN KEY ("director_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "director_loan_entries_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_director_loan_entries_company" ON "director_loan_entries" USING btree ("company_id");
