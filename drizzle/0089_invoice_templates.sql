CREATE TABLE "invoice_template_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"blob_path" text NOT NULL,
	"content_type" text NOT NULL,
	"filename" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"name" text NOT NULL,
	"design" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_template_key" text DEFAULT 'modern' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "invoice_custom_template_id" uuid;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "invoice_templates" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "subscription_tiers" ADD COLUMN "invoice_designer" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_template_assets" ADD CONSTRAINT "invoice_template_assets_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_templates" ADD CONSTRAINT "invoice_templates_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoice_template_assets_company" ON "invoice_template_assets" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "idx_invoice_templates_company" ON "invoice_templates" USING btree ("company_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_invoice_custom_template_id_invoice_templates_id_fk" FOREIGN KEY ("invoice_custom_template_id") REFERENCES "public"."invoice_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "subscription_tiers" SET "invoice_designer" = true WHERE "slug" = 'premium';
