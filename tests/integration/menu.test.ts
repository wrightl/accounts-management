import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  companyMemberships,
  expenses,
  invoices,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  addMenuFeatures,
  dismissMenuSuggestion,
  updateMenuFeatures,
} from "@/actions/menu";
import { getMenuState, setMenuFeatures } from "@/lib/menu/queries";
import { getMenuSuggestions } from "@/lib/menu/suggestions";
import { MENU_FEATURES } from "@/lib/menu/features";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_menu", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "menu@example.com" },
    firstName: "Menu",
    lastName: "Person",
    publicMetadata: {},
  })),
}));

const TODAY = "2026-10-12";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let userId: string;
let clientId: string;

async function seedUser(role: "admin" | "accountant") {
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_menu",
      email: "menu@example.com",
      name: "Menu Person",
      role,
    })
    .returning();
  await db.insert(companyMemberships).values({ userId: user.id, companyId, role });
  return user.id;
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db)).id;
  userId = await seedUser("admin");
  const [client] = await db.insert(clients).values({ companyId, name: "Acme" }).returning();
  clientId = client.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

function form(features: string[]) {
  const fd = new FormData();
  for (const f of features) fd.append("feature", f);
  return fd;
}

describe("menu actions", () => {
  it("starts with everything shown and nothing dismissed", async () => {
    expect(await getMenuState(userId, companyId)).toEqual({ enabled: null, dismissed: [] });
  });

  it("saves ticked items, in menu order", async () => {
    expect(await updateMenuFeatures(form(["forecast", "quotes", "bogus"]))).toMatchObject({ ok: true });
    expect((await getMenuState(userId, companyId)).enabled).toEqual(["quotes", "forecast"]);
  });

  it("saves an empty menu as core items only, not show-all", async () => {
    await updateMenuFeatures(form([]));
    expect((await getMenuState(userId, companyId)).enabled).toEqual([]);
  });

  it("adds items without removing others", async () => {
    await setMenuFeatures(userId, companyId, ["quotes"]);
    expect(await addMenuFeatures(["recurring"])).toMatchObject({ ok: true });
    expect((await getMenuState(userId, companyId)).enabled).toEqual(["quotes", "recurring"]);
  });

  it("leaves show-all alone when adding", async () => {
    await addMenuFeatures(["recurring"]);
    expect((await getMenuState(userId, companyId)).enabled).toBeNull();
  });

  it("remembers dismissed suggestions once", async () => {
    await dismissMenuSuggestion("recurring");
    await dismissMenuSuggestion("recurring");
    expect((await getMenuState(userId, companyId)).dismissed).toEqual(["recurring"]);
  });

  it("is per company: another membership keeps its own menu", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    await db.insert(companyMemberships).values({ userId, companyId: other.id, role: "admin" });
    await updateMenuFeatures(form(["quotes"]));
    expect((await getMenuState(userId, other.id)).enabled).toBeNull();
  });

  it("lets a read-only accountant change their own menu", async () => {
    await db.delete(companyMemberships);
    await db.delete(users);
    const accountantId = await seedUser("accountant");
    expect(await updateMenuFeatures(form(["forecast"]))).toMatchObject({ ok: true });
    expect((await getMenuState(accountantId, companyId)).enabled).toEqual(["forecast"]);
  });
});

describe("menu suggestions", () => {
  const allHidden = { hidden: MENU_FEATURES, dismissed: [], today: TODAY };

  async function invoice(issueDate: string, extra: Partial<typeof invoices.$inferInsert> = {}) {
    await db.insert(invoices).values({
      companyId,
      clientId,
      number: `INV-${issueDate}-${Math.random()}`,
      status: "sent",
      issueDate,
      ...extra,
    });
  }

  async function bankTx(bookedAt: string, amountPence: number, reference: string) {
    let [account] = await db.select().from(bankAccounts).limit(1);
    if (!account) {
      [account] = await db
        .insert(bankAccounts)
        .values({ companyId, name: "Current", provider: "starling" })
        .returning();
    }
    await db.insert(bankTransactions).values({
      bankAccountId: account.id,
      externalId: `${bookedAt}-${reference}-${Math.random()}`,
      bookedAt,
      amountPence,
      reference,
    });
  }

  it("suggests nothing for a new business", async () => {
    expect(await getMenuSuggestions(companyId, allHidden)).toEqual([]);
  });

  it("suggests Recurring after invoicing one client in three months", async () => {
    await invoice("2026-07-01");
    await invoice("2026-08-01");
    expect(await getMenuSuggestions(companyId, allHidden)).toEqual([]);
    await invoice("2026-09-01");
    const [suggestion] = await getMenuSuggestions(companyId, allHidden);
    expect(suggestion).toMatchObject({ id: "recurring", features: ["recurring"] });
    expect(suggestion?.reason).toContain("Acme");
  });

  it("ignores drafts and voided invoices", async () => {
    await invoice("2026-07-01", { status: "draft" });
    await invoice("2026-08-01", { status: "void" });
    await invoice("2026-09-01");
    expect(await getMenuSuggestions(companyId, allHidden)).toEqual([]);
  });

  it("suggests Reimbursements when expenses are owed back", async () => {
    await db.insert(expenses).values({
      companyId,
      description: "Train",
      amountPence: 3_000,
      status: "reimbursable",
      paidByUserId: userId,
    });
    const ids = (await getMenuSuggestions(companyId, allHidden)).map((s) => s.id);
    expect(ids).toEqual(["reimbursements"]);
  });

  it("suggests dividends from bank payments, and a forecast from bank history", async () => {
    await bankTx("2026-08-10", -500_000, "DIVIDEND Q2");
    await bankTx("2026-07-10", 100_000, "Client");
    await bankTx("2026-06-10", 100_000, "Client");
    const ids = (await getMenuSuggestions(companyId, allHidden)).map((s) => s.id);
    expect(ids).toEqual(["payingYourself", "forecast"]);
  });

  it("skips dismissed suggestions and ones already in the menu", async () => {
    await bankTx("2026-08-10", -500_000, "Dividend");
    expect(
      await getMenuSuggestions(companyId, { ...allHidden, dismissed: ["payingYourself"] }),
    ).toEqual([]);
    expect(
      await getMenuSuggestions(companyId, {
        ...allHidden,
        hidden: MENU_FEATURES.filter((f) => f !== "dividends"),
      }),
    ).toEqual([]);
  });

  it("only offers hidden pages from a suggestion", async () => {
    await bankTx("2026-08-10", -500_000, "Dividend");
    const [suggestion] = await getMenuSuggestions(companyId, {
      ...allHidden,
      hidden: ["dividends", "safeToPay"],
    });
    expect(suggestion?.features).toEqual(["dividends", "safeToPay"]);
  });
});
