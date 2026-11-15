CREATE TABLE "year_end_responses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"item_key" text NOT NULL,
	"explanation" text,
	"answer" boolean,
	"confirmed_at" timestamp with time zone,
	"confirmed_by_user_id" uuid,
	"confirmed_value" text,
	"cleared_reason" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "year_end_responses" ADD CONSTRAINT "year_end_responses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "year_end_responses" ADD CONSTRAINT "year_end_responses_confirmed_by_user_id_users_id_fk" FOREIGN KEY ("confirmed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_year_end_responses_item" ON "year_end_responses" USING btree ("company_id","period_from","period_to","item_key");