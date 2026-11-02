-- Questions from the accountant to the team, on one record or in general, with a reply thread.
CREATE TABLE "accountant_queries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"subject" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"record_kind" text,
	"record_id" uuid,
	"record_label" text,
	"raised_by_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accountant_queries_status_known" CHECK ("status" in ('open', 'answered', 'closed')),
	CONSTRAINT "accountant_queries_record_kind_known" CHECK ("record_kind" is null or "record_kind" in (
		'invoice', 'credit_note', 'expense', 'reimbursement', 'bank_transaction',
		'dividend_declaration', 'shareholder', 'recurring_invoice'
	))
);
--> statement-breakpoint
CREATE INDEX "idx_accountant_queries_status" ON "accountant_queries" ("company_id", "status", "updated_at");
--> statement-breakpoint
CREATE INDEX "idx_accountant_queries_record" ON "accountant_queries" ("company_id", "record_kind", "record_id");
--> statement-breakpoint
CREATE TABLE "accountant_query_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"query_id" uuid NOT NULL REFERENCES "accountant_queries"("id") ON DELETE cascade,
	"author_user_id" uuid REFERENCES "users"("id") ON DELETE set null,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_accountant_query_messages_query" ON "accountant_query_messages" ("company_id", "query_id", "created_at");
