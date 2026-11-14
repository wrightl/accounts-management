ALTER TABLE "companies" ADD COLUMN "quote_template_key" text DEFAULT 'modern' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "quote_custom_template_id" uuid;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "credit_note_template_key" text DEFAULT 'modern' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "credit_note_custom_template_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD COLUMN "kind" text DEFAULT 'invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_quote_custom_template_id_invoice_templates_id_fk" FOREIGN KEY ("quote_custom_template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_credit_note_custom_template_id_invoice_templates_id_fk" FOREIGN KEY ("credit_note_custom_template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- One library choice used to cover all three kinds of document; carry it over.
UPDATE "companies" SET "quote_template_key" = "invoice_template_key", "credit_note_template_key" = "invoice_template_key";
