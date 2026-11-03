-- Drafts are off for each connected assistant until its person allows them in Settings.
ALTER TABLE "assistant_connections" ADD COLUMN "allow_drafts" boolean DEFAULT false NOT NULL;
