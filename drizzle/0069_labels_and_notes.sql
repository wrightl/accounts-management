-- Company-wide coloured labels for bank transactions and expenses, plus a free-text note per row.
CREATE TABLE "labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL REFERENCES "companies"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "labels_color_known" CHECK ("color" in (
		'slate', 'red', 'orange', 'amber', 'green',
		'teal', 'blue', 'indigo', 'purple', 'pink'
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_label_company_name" ON "labels" ("company_id", lower("name"));
--> statement-breakpoint
CREATE TABLE "bank_transaction_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bank_transaction_id" uuid NOT NULL REFERENCES "bank_transactions"("id") ON DELETE cascade,
	"label_id" uuid NOT NULL REFERENCES "labels"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_bank_transaction_label" ON "bank_transaction_labels" ("bank_transaction_id", "label_id");
--> statement-breakpoint
CREATE INDEX "idx_bank_transaction_labels_label" ON "bank_transaction_labels" ("label_id");
--> statement-breakpoint
CREATE TABLE "expense_labels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL REFERENCES "expenses"("id") ON DELETE cascade,
	"label_id" uuid NOT NULL REFERENCES "labels"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_expense_label" ON "expense_labels" ("expense_id", "label_id");
--> statement-breakpoint
CREATE INDEX "idx_expense_labels_label" ON "expense_labels" ("label_id");
--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "notes" text;
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "notes" text;
