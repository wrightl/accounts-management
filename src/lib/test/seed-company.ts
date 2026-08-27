import { companies, type EntityType } from "@/db/schema";
import type { Database } from "@/db";
import type { TestDatabase } from "@/db/pglite";
import { slugifyInbound } from "@/lib/expenses/inbound-merge";

/** Insert a company row for tests / onboarding helpers. */
export async function seedCompany(
  db: Database | TestDatabase,
  overrides: Partial<typeof companies.$inferInsert> & {
    entityType?: EntityType;
  } = {},
) {
  const name = overrides.name ?? "Test Co";
  const slug =
    overrides.slug ??
    slugifyInbound(name, `company-${Date.now().toString(36)}`);
  const [row] = await db
    .insert(companies)
    .values({
      name,
      legalName: overrides.legalName ?? "Test Co Ltd",
      entityType: overrides.entityType ?? "limited_company",
      slug,
      ...overrides,
    })
    .returning();
  return row;
}
