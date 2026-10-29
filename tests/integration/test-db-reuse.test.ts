import { describe, expect, it } from "vitest";
import { count } from "drizzle-orm";
import { createTestDb } from "@/db/pglite";
import { companies, platformSettings, subscriptionTiers } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";

// createTestDb() reuses one database per file; each test must still start
// from the migrated snapshot.
describe("createTestDb reuse", () => {
  it("resets rows and restores migration seeds between tests", async () => {
    const first = await createTestDb();
    const seededTiers = await first.db.select().from(subscriptionTiers);
    const [settings] = await first.db.select().from(platformSettings);
    expect(seededTiers.length).toBeGreaterThan(0);
    expect(settings).toBeDefined();

    await seedCompany(first.db);
    await first.db.delete(subscriptionTiers);
    await first.db.delete(platformSettings);
    await first.client.close();

    const second = await createTestDb();
    expect(await second.db.select({ n: count() }).from(companies)).toEqual([{ n: 0 }]);
    expect(await second.db.select().from(subscriptionTiers)).toEqual(seededTiers);
    expect(await second.db.select().from(platformSettings)).toEqual([settings]);
    await second.client.close();
  });

  it("gives a second, separate database when one is still open", async () => {
    const held = await createTestDb();
    const other = await createTestDb();
    await seedCompany(held.db);
    expect(await other.db.select({ n: count() }).from(companies)).toEqual([{ n: 0 }]);
    await other.client.close();
    await held.client.close();
  });
});
