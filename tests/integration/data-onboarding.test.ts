import { beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  bankAccounts,
  bankTransactions,
  clients,
  dataOnboarding,
  expenses,
  invoiceImportBatches,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  hideDataOnboarding,
  markStepVisited,
  pauseDataOnboarding,
  resumeDataOnboarding,
  setRecordsStartDate,
  setStepOverride,
  startDataOnboarding,
} from "@/actions/data-onboarding";
import { getDataOnboarding, getOnboardingFacts } from "@/lib/data-onboarding/queries";
import { migration as existingCompanies } from "@/db/data-migrations/0004_data_onboarding_existing";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_setup", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "setup@example.com" },
    firstName: "Set",
    lastName: "Up",
    publicMetadata: {},
  })),
}));

let db: TestDatabase;
let companyId: string;

async function row() {
  const [r] = await db.select().from(dataOnboarding).where(eq(dataOnboarding.companyId, companyId));
  return r;
}

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

beforeEach(async () => {
  db = (await createTestDb()).db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { entityType: "sole_trader" });
  companyId = company.id;
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_setup",
    email: "setup@example.com",
    name: "Set Up",
    role: "admin",
  });
});

describe("data onboarding actions", () => {
  it("starts, pauses and resumes", async () => {
    expect(await row()).toBeUndefined();

    expect(await startDataOnboarding()).toMatchObject({ ok: true });
    expect((await row())?.status).toBe("active");

    expect(await pauseDataOnboarding()).toMatchObject({ ok: true });
    const paused = await row();
    expect(paused?.status).toBe("paused");
    expect(paused?.pausedAt).not.toBeNull();

    expect(await resumeDataOnboarding()).toMatchObject({ ok: true });
    expect(await row()).toMatchObject({ status: "active", pausedAt: null });
  });

  it("remembers the step last opened", async () => {
    await startDataOnboarding();
    await markStepVisited("expenses");
    expect((await row())?.lastStepId).toBe("expenses");
    expect(await markStepVisited("nope")).toMatchObject({ ok: false });
  });

  it("validates the records start date", async () => {
    await startDataOnboarding();
    const future = await setRecordsStartDate(form({ recordsStartDate: "2999-01-01" }));
    expect(future).toMatchObject({
      ok: false,
      fieldErrors: { recordsStartDate: "Choose today or an earlier date" },
    });
    expect(await setRecordsStartDate(form({ recordsStartDate: "2025-04-01" }))).toMatchObject({
      ok: true,
    });
    expect((await row())?.recordsStartDate).toBe("2025-04-01");
  });

  it("sets and clears manual choices one step at a time", async () => {
    await startDataOnboarding();
    await setStepOverride("expenses", "not_applicable");
    await setStepOverride("clients", "skipped");
    expect(Object.keys((await row())!.overrides).sort()).toEqual(["clients", "expenses"]);
    expect((await row())!.overrides.expenses?.state).toBe("not_applicable");

    await setStepOverride("expenses", null);
    expect(Object.keys((await row())!.overrides)).toEqual(["clients"]);

    expect(await setStepOverride("made_up", "done")).toMatchObject({ ok: false });
  });

  it("records hiding as completed only when nothing is left", async () => {
    await startDataOnboarding();
    await hideDataOnboarding();
    expect((await row())?.status).toBe("dismissed");

    await startDataOnboarding();
    await setRecordsStartDate(form({ recordsStartDate: "2025-04-01" }));
    for (const id of ["bank", "clients", "invoices", "expenses"]) {
      await setStepOverride(id, "skipped");
    }
    await hideDataOnboarding();
    const done = await row();
    expect(done?.status).toBe("completed");
    expect(done?.completedAt).not.toBeNull();
  });
});

describe("onboarding facts", () => {
  it("only read the company's own records", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId: other.id, name: "Their account", provider: "starling" })
      .returning();
    await db.insert(bankTransactions).values({
      bankAccountId: account!.id,
      externalId: "x1",
      bookedAt: "2025-04-02",
      amountPence: -500,
    });
    await db.insert(clients).values({ companyId: other.id, name: "Their client" });
    await db.insert(expenses).values({
      companyId: other.id,
      description: "Their expense",
      spentAt: "2025-05-01",
      amountPence: 1000,
    });
    await db.insert(invoiceImportBatches).values({ companyId: other.id, kind: "csv" });

    const facts = await getOnboardingFacts(companyId, "2025-04-01");
    expect(facts).toMatchObject({
      bankAccounts: [],
      clientCount: 0,
      expensesFromStart: 0,
      draftInvoiceBatchId: null,
    });
  });

  it("work out bank coverage and drafts for the company", async () => {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Current", provider: "starling" })
      .returning();
    await db.insert(bankTransactions).values([
      { bankAccountId: account!.id, externalId: "a", bookedAt: "2025-04-03", amountPence: 100 },
      { bankAccountId: account!.id, externalId: "b", bookedAt: "2025-09-01", amountPence: -100 },
    ]);
    const [batch] = await db
      .insert(invoiceImportBatches)
      .values({ companyId, kind: "csv" })
      .returning();

    await startDataOnboarding();
    await setRecordsStartDate(form({ recordsStartDate: "2025-04-01" }));
    const view = await getDataOnboarding(companyId, "sole_trader", "iso");
    const bank = view.checklist.steps.find((s) => s.id === "bank");
    const invoicesStep = view.checklist.steps.find((s) => s.id === "invoices");
    expect(bank).toMatchObject({ state: "done", detail: "1 account · from 2025-04-03" });
    expect(invoicesStep?.extraLink?.href).toBe(`/invoices/import/${batch!.id}?from=setup`);
  });
});

describe("0004_data_onboarding_existing", () => {
  it("hides the checklist for existing companies and keeps rows already there", async () => {
    const other = await seedCompany(db, { name: "Other Co", slug: "other-co" });
    await db.insert(dataOnboarding).values({ companyId: other.id, status: "active" });

    await existingCompanies.up({ db: db as unknown as Database, queueEffect: () => {} });

    expect((await row())?.status).toBe("dismissed");
    const [kept] = await db
      .select()
      .from(dataOnboarding)
      .where(eq(dataOnboarding.companyId, other.id));
    expect(kept?.status).toBe("active");
  });
});
