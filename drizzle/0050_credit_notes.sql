-- Credit notes against sent/paid invoices, with their own numbering sequence.
CREATE TYPE "public"."credit_note_status" AS ENUM('issued', 'void');
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "credit_note_number_prefix" text DEFAULT 'CN' NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "credit_note_next_seq" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "credit_note_seq_year" integer;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"number" text NOT NULL,
	"status" "credit_note_status" DEFAULT 'issued' NOT NULL,
	"issue_date" date NOT NULL,
	"reason" text NOT NULL,
	"net_pence" integer DEFAULT 0 NOT NULL,
	"vat_pence" integer DEFAULT 0 NOT NULL,
	"gross_pence" integer DEFAULT 0 NOT NULL,
	"refunded_pence" integer DEFAULT 0 NOT NULL,
	"refunded_at" date,
	"refund_reference" text,
	"sent_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_notes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "credit_notes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "credit_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action,
	CONSTRAINT "credit_notes_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_credit_notes_company_number" ON "credit_notes" USING btree ("company_id","number");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_company" ON "credit_notes" USING btree ("company_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_invoice" ON "credit_notes" USING btree ("invoice_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_notes_issue_date" ON "credit_notes" USING btree ("issue_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "credit_note_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"credit_note_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 3) DEFAULT 1 NOT NULL,
	"unit_price_pence" integer DEFAULT 0 NOT NULL,
	"vat_rate" integer DEFAULT 0 NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT 0 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "credit_note_line_items_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_credit_note_lines_credit_note" ON "credit_note_line_items" USING btree ("credit_note_id");
