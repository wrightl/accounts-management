-- Aliases someone renamed away from. Nobody else can claim one for a cool-down,
-- so mail still sent to an old address never reaches another person or company.
CREATE TABLE IF NOT EXISTS "released_inbound_aliases" (
  "alias" text PRIMARY KEY NOT NULL,
  "membership_id" uuid REFERENCES "company_memberships"("id") ON DELETE SET NULL,
  "released_at" timestamp with time zone DEFAULT now() NOT NULL
);
