ALTER TABLE "company_settings" ADD COLUMN "total_shares" integer;--> statement-breakpoint
CREATE TABLE "shareholders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"share_count" integer NOT NULL,
	"user_id" uuid,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "shareholders" ADD CONSTRAINT "shareholders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "dividend_declarations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declared_at" date NOT NULL,
	"total_pence" integer NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dividend_payouts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"declaration_id" uuid NOT NULL,
	"shareholder_id" uuid,
	"shareholder_name" text NOT NULL,
	"amount_pence" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "dividend_payouts" ADD CONSTRAINT "dividend_payouts_declaration_id_dividend_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."dividend_declarations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dividend_payouts" ADD CONSTRAINT "dividend_payouts_shareholder_id_shareholders_id_fk" FOREIGN KEY ("shareholder_id") REFERENCES "public"."shareholders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_dividend_payouts_declaration" ON "dividend_payouts" USING btree ("declaration_id");--> statement-breakpoint
INSERT INTO "dividend_declarations" ("id", "declared_at", "total_pence", "notes", "created_at")
SELECT "id", "declared_at", "amount_pence", "notes", "created_at"
FROM "dividends";--> statement-breakpoint
INSERT INTO "dividend_payouts" ("declaration_id", "shareholder_id", "shareholder_name", "amount_pence", "created_at")
SELECT "id", NULL, "shareholder_name", "amount_pence", "created_at"
FROM "dividends";--> statement-breakpoint
DROP TABLE "dividends";
