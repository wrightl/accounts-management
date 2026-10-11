import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  clients,
  companies,
  dividendDeclarations,
  expenses,
  invoices,
  reimbursements,
  shareholders,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { addDirectorLoanEntry, saveOpeningBalances } from "@/actions/ledger";
import { declareDividend } from "@/actions/dividends";
import { getDirectorLoanAccounts, getReservesPosition } from "@/lib/ledger/queries";
import { addDays } from "@/lib/ledger/corporation-tax";
import { financialYearStartDate, todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_ledger", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "ledger@example.com" },
    firstName: "Led",
    lastName: "Ger",
    publicMetadata: {},
  })),
}));

const today = todayIsoDate();
// A year end two or three months ago, so last year's s455 window is open.
const FY_END_MONTH = ((Number(today.slice(5, 7)) - 3 + 12) % 12) + 1;
const currentStart = financialYearStartDate(FY_END_MONTH, today);
const lastYearEnd = addDays(currentStart, -1);

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let userId: string;
let clientId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { financialYearEndMonth: FY_END_MONTH });
  companyId = company.id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_ledger",
      email: "ledger@example.com",
      name: "Ada Director",
      role: "admin",
    })
    .returning();
  userId = user.id;
  const [client] = await db
    .insert(clients)
    .values({ companyId, name: "Acme" })
    .returning();
  clientId = client.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedInvoice(issueDate: string, netPence: number) {
  await db.insert(invoices).values({
    companyId,
    number: `INV-${issueDate}-${netPence}`,
    clientId,
    status: "sent",
    issueDate,
    dueDate: issueDate,
    netPence,
    vatPence: 0,
    grossPence: netPence,
  });
}

function openingForm(fields: Record<string, string>) {
  const form = new FormData();
  form.set("openingBalancesAsAt", lastYearEnd);
  form.set("openingReservesPounds", "0");
  form.set("associatedCompanies", "0");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return form;
}

function dividendForm(pounds: string, confirm = false) {
  const form = new FormData();
  form.set("declaredAt", today);
  form.set("amountPounds", pounds);
  if (confirm) form.set("confirmOverReserves", "on");
  return form;
}

describe("reserves", () => {
  it("adds profit after tax to the opening reserves and takes off dividends", async () => {
    expect(
      (await saveOpeningBalances(openingForm({ openingReservesPounds: "20000" }))).ok,
    ).toBe(true);
    // Before the opening balances: already in the opening reserves.
    await seedInvoice(addDays(lastYearEnd, -10), 9_999_900);
    await seedInvoice(currentStart, 5_000_000);
    await db.insert(expenses).values({
      companyId,
      description: "Laptop",
      spentAt: currentStart,
      amountPence: 1_000_000,
      status: "company_paid",
    });
    await db
      .insert(dividendDeclarations)
      .values({ companyId, declaredAt: currentStart, totalPence: 240_000 });

    const position = await getReservesPosition(companyId);
    expect(position.years).toHaveLength(1);
    expect(position.currentYear).toMatchObject({
      openingReservesPence: 2_000_000,
      profitPence: 4_000_000,
      dividendsPence: 240_000,
    });
    expect(position.currentYear.tax.taxPence).toBe(760_000);
    // £20,000 + £40,000 − £7,600 − £2,400
    expect(position.availablePence).toBe(5_000_000);
  });

  it("goes back to the first records when there are no opening balances", async () => {
    await seedInvoice(addDays(lastYearEnd, -30), 1_000_000);
    const position = await getReservesPosition(companyId);
    expect(position.hasOpeningBalances).toBe(false);
    expect(position.years).toHaveLength(2);
    expect(position.years[0]!.closingReservesPence).toBe(810_000);
  });

  it("only accepts a year end, and only from admins and accountants", async () => {
    const wrongDay = await saveOpeningBalances(
      openingForm({ openingBalancesAsAt: addDays(lastYearEnd, -1) }),
    );
    expect(wrongDay.ok).toBe(false);
    if (!wrongDay.ok) expect(wrongDay.fieldErrors?.openingBalancesAsAt).toMatch(/financial year/);

    await db.update(users).set({ role: "accountant" }).where(eq(users.id, userId));
    expect((await saveOpeningBalances(openingForm({}))).ok).toBe(true);

    await db.update(users).set({ role: "user" }).where(eq(users.id, userId));
    const asUser = await saveOpeningBalances(openingForm({}));
    expect(asUser.ok).toBe(false);
    if (!asUser.ok) expect(asUser.error).toMatch(/permission/i);
  });
});

describe("dividend reserves check", () => {
  beforeEach(async () => {
    await db.insert(shareholders).values({ companyId, name: "Ada", shareCount: 100 });
    // £10,000 profit, £1,900 tax: £8,100 available.
    await seedInvoice(currentStart, 1_000_000);
  });

  it("refuses a dividend over distributable reserves", async () => {
    const result = await declareDividend(dividendForm("9000"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.fieldErrors?.confirmOverReserves).toMatch(/more than the £8,100\.00/);
    }
    expect(await db.select().from(dividendDeclarations)).toHaveLength(0);
  });

  it("allows one within reserves, then counts it against the next", async () => {
    expect((await declareDividend(dividendForm("8000"))).ok).toBe(true);
    expect((await declareDividend(dividendForm("500"))).ok).toBe(false);
  });

  it("allows going over once the user confirms, and records that", async () => {
    expect((await declareDividend(dividendForm("9000", true))).ok).toBe(true);
    const [entry] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyId), eq(auditLog.action, "dividend.declare")));
    expect(entry!.meta).toMatchObject({ overReserves: true, availableReservesPence: 810_000 });
  });
});

describe("director's loan account", () => {
  function entryForm(kind: "drawing" | "paid_in", pounds: string, date = today) {
    const form = new FormData();
    form.set("directorUserId", userId);
    form.set("kind", kind);
    form.set("entryDate", date);
    form.set("amountPounds", pounds);
    return form;
  }

  it("adds personal expenses and takes off reimbursements and drawings", async () => {
    await db.insert(expenses).values({
      companyId,
      description: "Train",
      spentAt: currentStart,
      amountPence: 30_000,
      status: "reimbursable",
      paidByUserId: userId,
    });
    await db.insert(reimbursements).values({
      companyId,
      payeeUserId: userId,
      status: "paid",
      totalPence: 10_000,
      paidAt: new Date(),
    });
    expect((await addDirectorLoanEntry(entryForm("drawing", "500"))).ok).toBe(true);

    let { directors } = await getDirectorLoanAccounts(companyId);
    expect(directors[0]).toMatchObject({
      paidPersonallyPence: 30_000,
      reimbursedPence: 10_000,
      drawingsPence: 50_000,
      balancePence: -30_000,
    });
    expect(directors[0]!.warnings.map((w) => w.kind)).toEqual(["overdrawn"]);

    expect((await addDirectorLoanEntry(entryForm("paid_in", "400"))).ok).toBe(true);
    ({ directors } = await getDirectorLoanAccounts(companyId));
    expect(directors[0]!.balancePence).toBe(10_000);
    expect(directors[0]!.warnings).toEqual([]);
  });

  it("warns about s455 on an opening balance still overdrawn", async () => {
    expect(
      (
        await saveOpeningBalances(
          openingForm({
            [`opening_${userId}`]: "800",
            [`openingDirection_${userId}`]: "owed_by_director",
          }),
        )
      ).ok,
    ).toBe(true);
    const { directors } = await getDirectorLoanAccounts(companyId);
    expect(directors[0]!.balanceAtLastYearEndPence).toBe(-80_000);
    expect(directors[0]!.warnings[0]).toMatchObject({
      kind: "s455_due",
      outstandingPence: 80_000,
      taxPence: 27_000,
    });
  });

  it("refuses entries in a locked period or before the opening balances", async () => {
    await saveOpeningBalances(openingForm({}));
    const early = await addDirectorLoanEntry(entryForm("drawing", "10", lastYearEnd));
    expect(early.ok).toBe(false);

    await db
      .update(companies)
      .set({ booksLockedThrough: addDays(today, -1), openingBalancesAsAt: null })
      .where(eq(companies.id, companyId));
    const locked = await addDirectorLoanEntry(entryForm("drawing", "10", addDays(today, -1)));
    expect(locked.ok).toBe(false);
    if (!locked.ok) expect(locked.error).toMatch(/locked/);
  });
});
