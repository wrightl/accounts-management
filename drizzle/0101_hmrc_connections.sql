CREATE TYPE "public"."hmrc_environment" AS ENUM('sandbox', 'production');--> statement-breakpoint
CREATE TABLE "hmrc_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"environment" "hmrc_environment" NOT NULL,
	"scopes" text NOT NULL,
	"access_token_sealed" text,
	"refresh_token_sealed" text,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"grant_expires_at" timestamp with time zone NOT NULL,
	"connected_by_user_id" uuid,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_refreshed_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" uuid,
	CONSTRAINT "hmrc_connections_tokens_while_active" CHECK (("hmrc_connections"."revoked_at" is null) = ("hmrc_connections"."access_token_sealed" is not null and "hmrc_connections"."refresh_token_sealed" is not null))
);
--> statement-breakpoint
CREATE TABLE "hmrc_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"environment" "hmrc_environment" NOT NULL,
	"state_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hmrc_connections" ADD CONSTRAINT "hmrc_connections_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hmrc_connections" ADD CONSTRAINT "hmrc_connections_connected_by_user_id_users_id_fk" FOREIGN KEY ("connected_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hmrc_connections" ADD CONSTRAINT "hmrc_connections_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hmrc_oauth_states" ADD CONSTRAINT "hmrc_oauth_states_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hmrc_oauth_states" ADD CONSTRAINT "hmrc_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hmrc_connections_company" ON "hmrc_connections" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_hmrc_connections_active" ON "hmrc_connections" USING btree ("company_id","environment") WHERE "hmrc_connections"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_hmrc_oauth_states_hash" ON "hmrc_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "idx_hmrc_oauth_states_company" ON "hmrc_oauth_states" USING btree ("company_id");