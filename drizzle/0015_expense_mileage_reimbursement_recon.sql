ALTER TABLE "expenses" ADD COLUMN "mileage_miles" integer;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "mileage_rate_pence" integer;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "default_mileage_rate_pence" integer DEFAULT 45 NOT NULL;--> statement-breakpoint
ALTER TYPE "public"."reconciliation_match_type" ADD VALUE IF NOT EXISTS 'reimbursement';--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD COLUMN "reimbursement_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_reimbursement_id_reimbursements_id_fk" FOREIGN KEY ("reimbursement_id") REFERENCES "public"."reimbursements"("id") ON DELETE set null ON UPDATE no action;
