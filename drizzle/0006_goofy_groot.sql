CREATE TABLE "bank_spending_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_bank_spending_category_name" ON "bank_spending_categories" USING btree (lower("name"));--> statement-breakpoint
INSERT INTO "bank_spending_categories" ("name")
SELECT DISTINCT trim("spending_category")
FROM "bank_transactions"
WHERE "spending_category" IS NOT NULL
  AND trim("spending_category") <> ''
  AND upper(trim("spending_category")) NOT IN (
    'ACCOUNTANCY_FEES', 'ADMIN', 'BUSINESS_ENTERTAINMENT', 'CHARITY', 'EQUIPMENT',
    'FOOD_AND_DRINK', 'INSURANCE', 'MARKETING', 'OTHER', 'PROFESSIONAL_SERVICES',
    'REVENUE', 'SOFTWARE_AND_SUBSCRIPTIONS', 'STAFF', 'TAX', 'TRAVEL', 'WORKPLACE'
  )
ON CONFLICT DO NOTHING;