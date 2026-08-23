import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { clients, quotes, users } from "@/db/schema";
import {
  PROMO_NUMBERS,
  seedPromoDemo,
} from "@/db/seed-promo-demo";
import { seedAdminUsers } from "@/db/seed";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  await seedAdminUsers(db as unknown as Database, ["lee@dotanddashconsulting.com"]);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
  vi.unstubAllEnvs();
});

describe("seedPromoDemo", () => {
  it("inserts fictional promo entities with fixed numbers", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const result = await seedPromoDemo(db as unknown as Database);

    const [quote] = await db
      .select()
      .from(quotes)
      .where(eq(quotes.number, PROMO_NUMBERS.quote));
    expect(quote).toBeTruthy();
    expect(quote.status).toBe("accepted");

    const promoClients = await db.select().from(clients);
    expect(promoClients.some((c) => c.name === "Harbor Digital Ltd")).toBe(true);

    expect(result.routes.quoteUrl).toContain(quote.id);
  });

  it("refuses production NODE_ENV", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(seedPromoDemo(db as unknown as Database)).rejects.toThrow(
      /production/i,
    );
  });
});
