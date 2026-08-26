ALTER TABLE "companies" ADD COLUMN "slug" text;--> statement-breakpoint
-- Backfill company slugs from name (lowercase, non-alnum → hyphen), uniquify collisions.
WITH ranked AS (
  SELECT
    id,
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(COALESCE(name, 'company'), '[^a-zA-Z0-9]+', '-', 'g'))),
        ''
      ),
      'company'
    ) AS base_slug
  FROM "companies"
),
numbered AS (
  SELECT
    id,
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
  FROM ranked
)
UPDATE "companies" c
SET "slug" = CASE
  WHEN n.rn = 1 THEN LEFT(n.base_slug, 48)
  ELSE LEFT(n.base_slug, 40) || '-' || n.rn::text
END
FROM numbered n
WHERE c.id = n.id;--> statement-breakpoint
ALTER TABLE "companies" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_slug_unique" UNIQUE ("slug");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "expense_inbound_slug" text;--> statement-breakpoint
-- Backfill founder inbound slugs from name or email local-part within each company.
WITH candidates AS (
  SELECT
    u.id,
    u.company_id,
    COALESCE(
      NULLIF(
        TRIM(BOTH '-' FROM LOWER(REGEXP_REPLACE(
          COALESCE(NULLIF(TRIM(u.name), ''), SPLIT_PART(u.email, '@', 1), 'user'),
          '[^a-zA-Z0-9]+', '-', 'g'
        ))),
        ''
      ),
      'user'
    ) AS base_slug
  FROM "users" u
  WHERE u.company_id IS NOT NULL
    AND u.role IN ('admin', 'user')
),
numbered AS (
  SELECT
    id,
    company_id,
    base_slug,
    ROW_NUMBER() OVER (PARTITION BY company_id, base_slug ORDER BY id) AS rn
  FROM candidates
)
UPDATE "users" u
SET "expense_inbound_slug" = CASE
  WHEN n.rn = 1 THEN LEFT(n.base_slug, 48)
  ELSE LEFT(n.base_slug, 40) || '-' || n.rn::text
END
FROM numbered n
WHERE u.id = n.id;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_users_company_expense_inbound_slug"
  ON "users" ("company_id", "expense_inbound_slug")
  WHERE "company_id" IS NOT NULL AND "expense_inbound_slug" IS NOT NULL;
