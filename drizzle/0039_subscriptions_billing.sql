CREATE TYPE "public"."billing_plan" AS ENUM('trial', 'essentials', 'premium');--> statement-breakpoint
CREATE TYPE "public"."billing_status" AS ENUM('trialing', 'active', 'past_due', 'canceled', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."billing_access" AS ENUM('standard', 'complimentary_unlimited');--> statement-breakpoint
CREATE TYPE "public"."billing_interval" AS ENUM('month', 'year');--> statement-breakpoint
CREATE TABLE "company_billing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"plan" "billing_plan" DEFAULT 'trial' NOT NULL,
	"status" "billing_status" DEFAULT 'trialing' NOT NULL,
	"access" "billing_access" DEFAULT 'standard' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"trial_ends_at" timestamp with time zone,
	"current_period_end" timestamp with time zone,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"billing_interval" "billing_interval",
	"complimentary_granted_at" timestamp with time zone,
	"complimentary_granted_by_user_id" uuid,
	"complimentary_note" text,
	"complimentary_expires_at" timestamp with time zone,
	"past_due_since" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_billing_company_id_unique" UNIQUE("company_id")
);--> statement-breakpoint
CREATE TABLE "subscription_tiers" (
	"slug" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"max_users" integer NOT NULL,
	"vat_export" boolean DEFAULT false NOT NULL,
	"live_bank_feed" boolean DEFAULT false NOT NULL,
	"priority_support" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "stripe_webhook_events" (
	"event_id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"processed_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "billing_email_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"template" text NOT NULL,
	"period_key" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "company_billing" ADD CONSTRAINT "company_billing_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_billing" ADD CONSTRAINT "company_billing_complimentary_granted_by_user_id_users_id_fk" FOREIGN KEY ("complimentary_granted_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_email_log" ADD CONSTRAINT "billing_email_log_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_company_billing_stripe_customer" ON "company_billing" USING btree ("stripe_customer_id");--> statement-breakpoint
CREATE INDEX "idx_company_billing_stripe_subscription" ON "company_billing" USING btree ("stripe_subscription_id");--> statement-breakpoint
CREATE INDEX "idx_company_billing_status" ON "company_billing" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_billing_email_log_company_template_period" ON "billing_email_log" USING btree ("company_id","template","period_key");--> statement-breakpoint
CREATE INDEX "idx_billing_email_log_company" ON "billing_email_log" USING btree ("company_id");--> statement-breakpoint
INSERT INTO "subscription_tiers" ("slug", "name", "max_users", "vat_export", "live_bank_feed", "priority_support") VALUES
	('trial', 'Trial', 5, false, false, false),
	('essentials', 'Essentials', 5, true, false, false),
	('premium', 'Premium', 15, true, false, true);--> statement-breakpoint
INSERT INTO "company_billing" ("company_id", "plan", "status", "access", "trial_ends_at")
SELECT c.id, 'trial', 'trialing', 'standard', now() + interval '30 days'
FROM "companies" c
WHERE NOT EXISTS (
	SELECT 1 FROM "company_billing" b WHERE b.company_id = c.id
);
