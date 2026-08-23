CREATE TYPE "public"."quote_version_source" AS ENUM('create', 'edit', 'rollback');--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"client_id" uuid NOT NULL,
	"issue_date" date,
	"valid_until" date,
	"notes" text,
	"net_pence" integer DEFAULT 0 NOT NULL,
	"vat_pence" integer DEFAULT 0 NOT NULL,
	"gross_pence" integer DEFAULT 0 NOT NULL,
	"lines" jsonb NOT NULL,
	"source" "quote_version_source" NOT NULL,
	"rolled_back_from_version" integer,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_quote_versions_quote_version" ON "quote_versions" USING btree ("quote_id","version");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_quote" ON "quote_versions" USING btree ("quote_id");