import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { companyMemberships, releasedInboundAliases, users } from "@/db/schema";
import {
  ensureInboundAlias,
  getInboundAlias,
  RELEASED_ALIAS_COOLDOWN_DAYS,
  resolveInboundRecipient,
  setInboundAlias,
} from "@/lib/expenses/inbound-mailbox";
import { migration as backfill } from "@/db/data-migrations/0003_membership_inbound_aliases";
import { upsertMembership } from "@/lib/users";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));

vi.mock("@/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/env")>();
  return {
    ...actual,
    serverEnv: () => ({
      ...actual.serverEnv(),
      EXPENSE_INBOUND_DOMAIN: "dotanddashconsulting.com",
      EXPENSE_INBOUND_PREFIX: "expenses",
    }),
  };
});

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let acmeId: string;
let otherId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  acmeId = (await seedCompany(db, { name: "Acme", slug: "acme" })).id;
  otherId = (await seedCompany(db, { name: "Other", slug: "other" })).id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function addUser(email: string, name: string | null) {
  const [row] = await db.insert(users).values({ email, name, role: "pending" }).returning();
  return row.id;
}

const at = (alias: string) => `${alias}@dotanddashconsulting.com`;

describe("short inbound addresses", () => {
  it("gives each founder a unique address across every company", async () => {
    const pat = await addUser("pat@example.com", "Pat Jones");
    const patToo = await addUser("pat@other.com", "Pat Jones");
    const patThree = await addUser("pat3@example.com", "Pat Jones");
    await upsertMembership(pat, acmeId, "admin");
    await upsertMembership(patToo, otherId, "user");
    await upsertMembership(patThree, otherId, "user");

    expect(await getInboundAlias(pat, acmeId)).toBe("pat");
    expect(await getInboundAlias(patToo, otherId)).toBe("pat.jones");
    expect(await getInboundAlias(patThree, otherId)).toBe("pat-other");

    const resolved = await resolveInboundRecipient(at("pat.jones"));
    expect(resolved).toMatchObject({ userId: patToo, companyId: otherId, role: "user" });
  });

  it("doesn't give accountants an address, and keeps an existing one", async () => {
    const acct = await addUser("acct@example.com", "Ann");
    await upsertMembership(acct, acmeId, "accountant");
    expect(await getInboundAlias(acct, acmeId)).toBeNull();

    const founder = await addUser("lee@example.com", "Lee");
    await upsertMembership(founder, acmeId, "user");
    expect((await setInboundAlias(founder, acmeId, "lee.receipts")).ok).toBe(true);
    await upsertMembership(founder, acmeId, "admin");
    expect(await ensureInboundAlias(founder, acmeId)).toBe("lee.receipts");
  });

  it("renames, frees the old address, and refuses taken or invalid ones", async () => {
    const lee = await addUser("lee@example.com", "Lee");
    const sam = await addUser("sam@example.com", "Sam");
    await upsertMembership(lee, acmeId, "user");
    await upsertMembership(sam, otherId, "user");

    expect(await setInboundAlias(lee, acmeId, "sam")).toEqual({
      ok: false,
      error: "That address is taken. Pick another.",
    });
    expect((await setInboundAlias(lee, acmeId, "postmaster")).ok).toBe(false);
    expect((await setInboundAlias(lee, acmeId, "a+b")).ok).toBe(false);

    expect(await setInboundAlias(lee, acmeId, "  Lee.Wright ")).toEqual({
      ok: true,
      alias: "lee.wright",
      previous: "lee",
    });
    expect(await resolveInboundRecipient(at("lee"))).toBeNull();
    expect((await resolveInboundRecipient(at("lee.wright")))?.userId).toBe(lee);

    // Nobody else can take the old one during the cool-down, from any company.
    expect(await setInboundAlias(sam, otherId, "lee")).toEqual({
      ok: false,
      error: "That address is taken. Pick another.",
    });
    expect(await resolveInboundRecipient(at("lee"))).toBeNull();
  });

  it("lets the old owner take an address back during the cool-down", async () => {
    const lee = await addUser("lee@example.com", "Lee");
    await upsertMembership(lee, acmeId, "user");
    expect((await setInboundAlias(lee, acmeId, "lee.new")).ok).toBe(true);
    expect(await setInboundAlias(lee, acmeId, "lee")).toEqual({
      ok: true,
      alias: "lee",
      previous: "lee.new",
    });
    expect((await resolveInboundRecipient(at("lee")))?.userId).toBe(lee);
  });

  it("frees an address for others once the cool-down ends", async () => {
    const lee = await addUser("lee@example.com", "Lee");
    const sam = await addUser("sam@example.com", "Sam");
    await upsertMembership(lee, acmeId, "user");
    await upsertMembership(sam, otherId, "user");
    expect((await setInboundAlias(lee, acmeId, "lee.new")).ok).toBe(true);

    const longAgo = new Date(Date.now() - (RELEASED_ALIAS_COOLDOWN_DAYS + 1) * 86_400_000);
    await db
      .update(releasedInboundAliases)
      .set({ releasedAt: longAgo })
      .where(eq(releasedInboundAliases.alias, "lee"));
    expect((await setInboundAlias(sam, otherId, "lee")).ok).toBe(true);
    expect((await resolveInboundRecipient(at("lee")))?.userId).toBe(sam);
  });

  it("doesn't give a cooling-down address to a new founder", async () => {
    const lee = await addUser("lee@example.com", "Lee");
    await upsertMembership(lee, acmeId, "user");
    expect((await setInboundAlias(lee, acmeId, "lee.new")).ok).toBe(true);

    const otherLee = await addUser("lee@other.com", "Lee");
    await upsertMembership(otherLee, otherId, "user");
    expect(await getInboundAlias(otherLee, otherId)).toBe("lee-other");
  });

  it("only lets founders set an address", async () => {
    const acct = await addUser("acct@example.com", "Ann");
    await upsertMembership(acct, acmeId, "accountant");
    expect((await setInboundAlias(acct, acmeId, "ann.books")).ok).toBe(false);
    expect(await resolveInboundRecipient(at("ann.books"))).toBeNull();
  });

  it("enforces uniqueness in the database too", async () => {
    const lee = await addUser("lee@example.com", "Lee");
    const sam = await addUser("sam@example.com", "Sam");
    await upsertMembership(lee, acmeId, "user");
    await upsertMembership(sam, otherId, "user");
    await expect(
      db
        .update(companyMemberships)
        .set({ inboundAlias: "lee" })
        .where(and(eq(companyMemberships.userId, sam), eq(companyMemberships.companyId, otherId))),
    ).rejects.toThrow();
  });

  it("backfills founders who joined before short addresses", async () => {
    const lee = await addUser("lee@example.com", "Lee Wright");
    const lee2 = await addUser("lee@other.com", "Lee Wright");
    const acct = await addUser("acct@example.com", "Ann");
    await db.insert(companyMemberships).values([
      { userId: lee, companyId: acmeId, role: "admin" },
      { userId: lee2, companyId: otherId, role: "user" },
      { userId: acct, companyId: acmeId, role: "accountant" },
    ]);

    await backfill.up({ db: db as unknown as Database, queueEffect: () => {} });

    expect(await getInboundAlias(lee, acmeId)).toBe("lee");
    expect(await getInboundAlias(lee2, otherId)).toBe("lee.wright");
    expect(await getInboundAlias(acct, acmeId)).toBeNull();
  });
});
