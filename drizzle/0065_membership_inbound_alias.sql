-- Short inbound expense addresses: `{alias}@inbound.dotanddashconsulting.com`, one
-- per membership, unique across every company. The person can rename it; the old
-- one stops working and is free for anyone. Existing founders get one from the
-- 0003_membership_inbound_aliases data migration.
ALTER TABLE "company_memberships" ADD COLUMN IF NOT EXISTS "inbound_alias" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_company_memberships_inbound_alias"
  ON "company_memberships" ("inbound_alias");
--> statement-breakpoint
-- Who emailed the claim when it wasn't the submitter (a supplier, or a stranger
-- who guessed the address). Null for claims the person sent themselves.
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "external_sender_email" text;
