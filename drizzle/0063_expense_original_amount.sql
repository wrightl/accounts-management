-- Foreign-currency expenses keep their receipt amount in original_amount_minor;
-- amount_pence is always sterling.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "original_amount_minor" integer;
--> statement-breakpoint
-- Pending email expenses stored one amount, and we can't tell whether a
-- reviewer already changed it to sterling. Record it as the receipt amount
-- too, and leave amount_pence alone: with both equal, the review form and
-- approval ask a person to confirm the two amounts rather than converting.
-- Approved rows keep the amount the books already use.
UPDATE "expenses"
  SET "original_amount_minor" = "amount_pence"
  WHERE "status" = 'pending'
    AND "detected_currency" IS NOT NULL
    AND upper("detected_currency") <> 'GBP'
    AND "original_amount_minor" IS NULL;
