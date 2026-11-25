CREATE TYPE "public"."tax_submission_kind" AS ENUM('vat_return');--> statement-breakpoint
CREATE TABLE "tax_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"kind" "tax_submission_kind" NOT NULL,
	"environment" "hmrc_environment" NOT NULL,
	"period_key" text NOT NULL,
	"period_start" date,
	"period_end" date,
	"request" jsonb NOT NULL,
	"response" jsonb,
	"http_status" integer,
	"receipt_id" text,
	"correlation_id" text,
	"submitted_by_user_id" uuid,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_through" date
);
--> statement-breakpoint
ALTER TABLE "tax_submissions" ADD CONSTRAINT "tax_submissions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tax_submissions" ADD CONSTRAINT "tax_submissions_submitted_by_user_id_users_id_fk" FOREIGN KEY ("submitted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_tax_submissions_company" ON "tax_submissions" USING btree ("company_id","kind","period_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_tax_submissions_accepted" ON "tax_submissions" USING btree ("company_id","environment","kind","period_key") WHERE "tax_submissions"."receipt_id" is not null;