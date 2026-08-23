ALTER TABLE "company_settings" ADD COLUMN "invoice_payment_terms_days" integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_milestone_id" uuid;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_payment_milestone_id_order_payment_milestones_id_fk" FOREIGN KEY ("payment_milestone_id") REFERENCES "public"."order_payment_milestones"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_invoices_payment_milestone" ON "invoices" USING btree ("payment_milestone_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_invoice_milestone_active" ON "invoices" USING btree ("payment_milestone_id") WHERE "status" <> 'void' AND "payment_milestone_id" IS NOT NULL;
