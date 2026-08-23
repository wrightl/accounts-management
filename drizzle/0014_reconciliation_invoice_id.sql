ALTER TABLE "reconciliation_matches" ADD COLUMN "invoice_id" uuid;--> statement-breakpoint
ALTER TABLE "reconciliation_matches" ADD CONSTRAINT "reconciliation_matches_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;
