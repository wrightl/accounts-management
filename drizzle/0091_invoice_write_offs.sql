CREATE TYPE "public"."invoice_write_off_kind" AS ENUM('bank_charges', 'bad_debt');--> statement-breakpoint
CREATE TABLE "invoice_write_offs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"invoice_id" uuid NOT NULL,
	"kind" "invoice_write_off_kind" NOT NULL,
	"amount_pence" integer NOT NULL,
	"written_off_on" date NOT NULL,
	"note" text,
	"created_by_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invoice_write_offs" ADD CONSTRAINT "invoice_write_offs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_write_offs" ADD CONSTRAINT "invoice_write_offs_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_write_offs" ADD CONSTRAINT "invoice_write_offs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_write_offs_company" ON "invoice_write_offs" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_write_offs_invoice" ON "invoice_write_offs" USING btree ("invoice_id");