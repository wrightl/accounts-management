-- Foreign-currency expenses keep their receipt amount in original_amount_minor;
-- amount_pence is always sterling.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "original_amount_minor" integer;
--> statement-breakpoint
-- Pending email expenses stored the receipt amount in amount_pence. Move it
-- across and clear the sterling amount; the review form fills it in at the
-- Bank of England rate. Approved rows keep the amount the books already use.
UPDATE "expenses"
  SET "original_amount_minor" = "amount_pence", "amount_pence" = 0, "vat_pence" = 0
  WHERE "status" = 'pending'
    AND "detected_currency" IS NOT NULL
    AND upper("detected_currency") <> 'GBP'
    AND "original_amount_minor" IS NULL;
