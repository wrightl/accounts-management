ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_on_accept" boolean DEFAULT false NOT NULL;
