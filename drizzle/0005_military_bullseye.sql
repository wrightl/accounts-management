ALTER TABLE "bank_transactions" ADD COLUMN "spending_category" text;--> statement-breakpoint
ALTER TABLE "bank_transactions" ADD COLUMN "tags" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
UPDATE "bank_transactions"
SET spending_category = NULLIF(raw->>'spending category', ''),
    tags = CASE
      WHEN COALESCE(raw->>'tags', '') = '' THEN '{}'::text[]
      ELSE string_to_array(raw->>'tags', ',')
    END
WHERE spending_category IS NULL;