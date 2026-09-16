ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "bank_provider" text;
--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD COLUMN IF NOT EXISTS "csv_mapping" jsonb;
--> statement-breakpoint
-- Backfill bank_provider from legacy free-text bank_name.
UPDATE "companies"
SET "bank_provider" = CASE
  WHEN "bank_name" IS NULL OR btrim("bank_name") = '' THEN NULL
  WHEN lower(btrim("bank_name")) LIKE '%starling%' THEN 'starling'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('monzo', 'monzo bank') THEN 'monzo'
  WHEN lower(btrim("bank_name")) LIKE 'monzo%' THEN 'monzo'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('revolut', 'revolut bank') THEN 'revolut'
  WHEN lower(btrim("bank_name")) LIKE 'revolut%' THEN 'revolut'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('wise', 'wise bank', 'transferwise') THEN 'wise'
  WHEN lower(btrim("bank_name")) LIKE 'wise%' OR lower(btrim("bank_name")) LIKE 'transferwise%' THEN 'wise'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('tide', 'tide bank') THEN 'tide'
  WHEN lower(btrim("bank_name")) LIKE 'tide%' THEN 'tide'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('barclays', 'barclays bank') THEN 'barclays'
  WHEN lower(btrim("bank_name")) LIKE 'barclays%' THEN 'barclays'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('hsbc', 'hsbc bank') THEN 'hsbc'
  WHEN lower(btrim("bank_name")) LIKE 'hsbc%' THEN 'hsbc'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('lloyds', 'lloyds bank') THEN 'lloyds'
  WHEN lower(btrim("bank_name")) LIKE 'lloyds%' THEN 'lloyds'
  WHEN lower(regexp_replace(btrim("bank_name"), '\s+', ' ', 'g')) IN ('natwest', 'natwest bank', 'nat west') THEN 'natwest'
  WHEN lower(btrim("bank_name")) LIKE 'natwest%' OR lower(btrim("bank_name")) LIKE 'nat west%' THEN 'natwest'
  ELSE 'other'
END
WHERE "bank_provider" IS NULL;
