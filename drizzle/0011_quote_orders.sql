CREATE TYPE "public"."order_status" AS ENUM('draft', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" text NOT NULL,
	"client_id" uuid NOT NULL,
	"quote_id" uuid,
	"status" "order_status" DEFAULT 'active' NOT NULL,
	"issue_date" date,
	"notes" text,
	"net_pence" integer DEFAULT 0 NOT NULL,
	"vat_pence" integer DEFAULT 0 NOT NULL,
	"gross_pence" integer DEFAULT 0 NOT NULL,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_number_unique" UNIQUE("number"),
	CONSTRAINT "orders_quote_id_unique" UNIQUE("quote_id")
);--> statement-breakpoint
CREATE TABLE "order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_pence" integer DEFAULT 0 NOT NULL,
	"vat_rate" integer DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE "order_payment_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_pence" integer,
	"percent_basis_points" integer,
	"due_date" date,
	"due_in_days" integer,
	"position" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE TABLE "quote_decline_reason_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "quote_payment_milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"label" text NOT NULL,
	"amount_pence" integer,
	"percent_basis_points" integer,
	"due_date" date,
	"due_in_days" integer,
	"position" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "order_number_prefix" text DEFAULT 'O' NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "order_next_seq" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_settings" ADD COLUMN "order_seq_year" integer;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "order_id" uuid;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "declined_reason_category" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "declined_reason_narrative" text;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "quotes" ADD COLUMN "declined_at" timestamp with time zone;--> statement-breakpoint
UPDATE "quotes" SET "status" = 'accepted' WHERE "status" = 'converted';--> statement-breakpoint
INSERT INTO "quote_decline_reason_categories" ("name")
SELECT v FROM unnest(ARRAY['Price', 'Timing', 'Scope', 'Competitor', 'Budget', 'Other']::text[]) AS v
WHERE NOT EXISTS (
  SELECT 1 FROM "quote_decline_reason_categories" c WHERE lower(c."name") = lower(v)
);--> statement-breakpoint
INSERT INTO "orders" ("number", "client_id", "quote_id", "status", "issue_date", "notes", "net_pence", "vat_pence", "gross_pence", "created_by_user_id", "created_at")
SELECT
  'O-MIG-' || q."number",
  q."client_id",
  q."id",
  'completed',
  q."issue_date",
  q."notes",
  q."net_pence",
  q."vat_pence",
  q."gross_pence",
  q."created_by_user_id",
  COALESCE(q."created_at", now())
FROM "quotes" q
WHERE q."converted_invoice_id" IS NOT NULL
  AND q."order_id" IS NULL;--> statement-breakpoint
INSERT INTO "order_line_items" ("order_id", "description", "quantity", "unit_price_pence", "vat_rate", "position")
SELECT o."id", qli."description", qli."quantity", qli."unit_price_pence", qli."vat_rate", qli."position"
FROM "quote_line_items" qli
JOIN "orders" o ON o."quote_id" = qli."quote_id";--> statement-breakpoint
UPDATE "quotes" q
SET
  "order_id" = o."id",
  "accepted_at" = COALESCE(q."accepted_at", q."created_at")
FROM "orders" o
WHERE o."quote_id" = q."id"
  AND q."converted_invoice_id" IS NOT NULL;--> statement-breakpoint
UPDATE "invoices" i
SET "order_id" = q."order_id"
FROM "quotes" q
WHERE q."converted_invoice_id" = i."id"
  AND q."order_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_line_items" ADD CONSTRAINT "order_line_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_payment_milestones" ADD CONSTRAINT "order_payment_milestones_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_payment_milestones" ADD CONSTRAINT "quote_payment_milestones_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_quote_decline_reason_categories_name" ON "quote_decline_reason_categories" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "idx_orders_client" ON "orders" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "idx_orders_status" ON "orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_order_lines_order" ON "order_line_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_order_milestones_order" ON "order_payment_milestones" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "idx_quote_milestones_quote" ON "quote_payment_milestones" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_invoices_order" ON "invoices" USING btree ("order_id");--> statement-breakpoint
ALTER TABLE "quotes" DROP CONSTRAINT IF EXISTS "quotes_converted_invoice_id_invoices_id_fk";--> statement-breakpoint
ALTER TABLE "quotes" DROP COLUMN IF EXISTS "converted_invoice_id";--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_order_id_unique" UNIQUE("order_id");--> statement-breakpoint
ALTER TYPE "public"."quote_status" RENAME TO "quote_status_old";--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('draft', 'sent', 'accepted', 'declined');--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" TYPE "public"."quote_status" USING "status"::text::"public"."quote_status";--> statement-breakpoint
ALTER TABLE "quotes" ALTER COLUMN "status" SET DEFAULT 'draft';--> statement-breakpoint
DROP TYPE "public"."quote_status_old";
