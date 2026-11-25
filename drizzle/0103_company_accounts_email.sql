-- IF NOT EXISTS: preview databases ran this as 0102 before it was renumbered.
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "accounts_email" text;
