-- Public quote accept: share token + viewed tracking.
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "public_token" text;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "viewed_at" timestamp with time zone;
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_quotes_public_token"
  ON "quotes" ("public_token")
  WHERE "public_token" IS NOT NULL;
