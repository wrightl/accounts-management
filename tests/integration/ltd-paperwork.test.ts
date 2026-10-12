import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  clients,
  companies,
  dividendDeclarations,
  invoices,
  notifications,
  shareholders,
  users,
} from "@/db/schema";
import { resetServerEnvCache } from "@/env";
import { seedCompany } from "@/lib/test/seed-company";
import { declareDividend } from "@/actions/dividends";
import { markDeadlineDone, undoDeadlineDone } from "@/actions/deadlines";
import {
  lookupCompaniesHouse,
  refreshFromCompaniesHouse,
  saveCompaniesHouseDetails,
} from "@/actions/companies-house";
import { getDeadlines } from "@/lib/deadlines/queries";
import { scanUpcomingDeadlines } from "@/lib/deadlines/notify";
import { sendWeeklyCloseDigests } from "@/lib/close/digest";
import { getDividendPaperwork } from "@/lib/dividends/queries";
import { renderDividendPaperworkPdf } from "@/lib/dividends/paperwork-pdf";
import { financialYearStartDate, todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_paper", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "paper@example.com" },
    firstName: "Paper",
    lastName: "Work",
    publicMetadata: {},
  })),
}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ id: "email_1" })) }));

const today = todayIsoDate();

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let userId: string;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, {
    legalName: "Dot And Dash Consulting Ltd",
    companyNumber: "01234567",
    addressLines: "2 High Street\nBristol\nBS1 1AA",
    financialYearEndMonth: 3,
    createdAt: new Date("2020-01-01T00:00:00Z"),
  });
  companyId = company.id;
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_paper",
      email: "paper@example.com",
      name: "Ada Director",
      role: "admin",
    })
    .returning();
  userId = user.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  resetServerEnvCache();
});

describe("dividend paperwork", () => {
  beforeEach(async () => {
    await db.insert(shareholders).values([
      { companyId, name: "Ada Director", shareCount: 60 },
      { companyId, name: "Bob Founder", shareCount: 40 },
    ]);
    await db.update(companies).set({ totalShares: 100 }).where(eq(companies.id, companyId));
    const [client] = await db.insert(clients).values({ companyId, name: "Acme" }).returning();
    // £10,000 profit, £1,900 tax: £8,100 available.
    const start = financialYearStartDate(3, today);
    await db.insert(invoices).values({
      companyId,
      number: "INV-1",
      clientId: client.id,
      status: "sent",
      issueDate: start,
      dueDate: start,
      netPence: 1_000_000,
      vatPence: 0,
      grossPence: 1_000_000,
    });
  });

  function dividendForm(pounds: string, confirm = false) {
    const form = new FormData();
    form.set("declaredAt", today);
    form.set("amountPounds", pounds);
    if (confirm) form.set("confirmOverReserves", "on");
    return form;
  }

  it("records the reserves position with the declaration", async () => {
    expect((await declareDividend(dividendForm("5000"))).ok).toBe(true);
    expect((await declareDividend(dividendForm("9000", true))).ok).toBe(true);
    const rows = await db
      .select()
      .from(dividendDeclarations)
      .orderBy(dividendDeclarations.totalPence);
    expect(rows.map((r) => [r.totalPence, r.availableReservesPence, r.overReservesConfirmed])).toEqual([
      [500_000, 810_000, false],
      [900_000, 310_000, true],
    ]);
  });

  it("builds minutes and a voucher per shareholder", async () => {
    await db
      .update(companies)
      .set({ directorNames: "Ada Director\nBob Founder" })
      .where(eq(companies.id, companyId));
    const declared = await declareDividend(dividendForm("5000"));
    expect(declared.ok).toBe(true);
    const id = declared.ok ? declared.id! : "";

    const paperwork = await getDividendPaperwork(companyId, id);
    expect(paperwork).toMatchObject({
      company: {
        legalName: "Dot And Dash Consulting Ltd",
        companyNumber: "01234567",
        directors: ["Ada Director", "Bob Founder"],
      },
      declaration: { totalPence: 500_000, availableReservesPence: 810_000, totalShares: 100 },
      payouts: [
        { shareholderName: "Ada Director", shareCount: 60, amountPence: 300_000 },
        { shareholderName: "Bob Founder", shareCount: 40, amountPence: 200_000 },
      ],
    });

    const pdf = Buffer.from(await renderDividendPaperworkPdf(paperwork!));
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    // Minutes plus two vouchers.
    expect(pdf.toString("latin1").match(/\/Type \/Page\b/g)).toHaveLength(3);
  });

  it("won't show another company's declaration", async () => {
    const declared = await declareDividend(dividendForm("1000"));
    const other = await seedCompany(db, { name: "Other Co" });
    expect(await getDividendPaperwork(other.id, declared.ok ? declared.id! : "")).toBeNull();
  });
});

describe("deadlines", () => {
  it("lists Ltd deadlines and records them as done", async () => {
    const { deadlines, missingCompaniesHouse } = await getDeadlines(companyId, "2026-10-12");
    expect(missingCompaniesHouse).toBe(true);
    expect(deadlines.map((d) => [d.kind, d.dueDate, d.status])).toEqual([
      ["annual_accounts", "2026-12-31", "upcoming"],
      ["ct_payment", "2027-01-01", "upcoming"],
      ["ct600", "2027-03-31", "upcoming"],
    ]);

    expect((await markDeadlineDone("annual_accounts", "2026-12-31")).ok).toBe(true);
    // Marking twice is harmless.
    expect((await markDeadlineDone("annual_accounts", "2026-12-31")).ok).toBe(true);
    const after = await getDeadlines(companyId, "2026-10-12");
    expect(after.deadlines[0]).toMatchObject({
      status: "done",
      filedOn: today,
      filedByName: "Paper Work",
    });

    expect((await undoDeadlineDone("annual_accounts", "2026-12-31")).ok).toBe(true);
    expect((await getDeadlines(companyId, "2026-10-12")).deadlines[0]!.status).toBe("upcoming");
  });

  it("refuses unknown deadlines and read-only users", async () => {
    expect((await markDeadlineDone("tea_break", "2026-12-31")).ok).toBe(false);
    await db.update(users).set({ role: "accountant" }).where(eq(users.id, userId));
    const result = await markDeadlineDone("annual_accounts", "2026-12-31");
    expect(result.ok).toBe(false);
  });

  it("shows overdue ones and leaves out ones from before the company joined", async () => {
    await db
      .update(companies)
      .set({ createdAt: new Date("2026-09-01T00:00:00Z"), vatRegistered: true })
      .where(eq(companies.id, companyId));
    const { deadlines } = await getDeadlines(companyId, "2026-11-10");
    const vat = deadlines.filter((d) => d.kind === "vat_return");
    // Quarter to 30 September, due 7 November: overdue. The August one
    // (quarter to June) was before the company joined.
    expect(vat[0]).toMatchObject({ dueDate: "2026-11-07", status: "overdue", daysLeft: -3 });
    expect(vat.some((d) => d.dueDate === "2026-08-07")).toBe(false);
  });

  it("reminds 14 days before, once", async () => {
    await db
      .update(companies)
      .set({ confirmationStatementDue: "2026-10-26" })
      .where(eq(companies.id, companyId));
    expect(await scanUpcomingDeadlines("2026-10-12")).toBe(1);
    expect(await scanUpcomingDeadlines("2026-10-12")).toBe(0);
    const [n] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.type, "deadline.upcoming"));
    expect(n).toMatchObject({
      userId,
      href: "/deadlines",
      title: "Confirmation statement due in 14 days",
    });
  });

  it("puts deadlines in the Monday digest", async () => {
    await db
      .update(companies)
      .set({ confirmationStatementDue: "2026-10-20" })
      .where(eq(companies.id, companyId));
    expect((await sendWeeklyCloseDigests("2026-10-12")).notified).toBe(1);
    const [n] = await db.select().from(notifications).where(eq(notifications.type, "close.weekly"));
    expect(n!.body).toMatch(/Due 20\/10\/2026: Confirmation statement/);
  });
});

describe("Companies House details", () => {
  it("saves them by hand and validates", async () => {
    const bad = new FormData();
    bad.set("incorporatedOn", "yesterday");
    const failed = await saveCompaniesHouseDetails(bad);
    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.fieldErrors?.incorporatedOn).toBe("Enter a valid date");

    const form = new FormData();
    form.set("incorporatedOn", "2019-05-01");
    form.set("confirmationStatementDue", "");
    form.set("accountsDue", "2026-12-31");
    form.set("directorNames", " Ada Director \n\nBob Founder ");
    expect((await saveCompaniesHouseDetails(form)).ok).toBe(true);
    const [row] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(row).toMatchObject({
      incorporatedOn: "2019-05-01",
      confirmationStatementDue: null,
      accountsDue: "2026-12-31",
      directorNames: "Ada Director\nBob Founder",
    });
  });

  it("refreshes from Companies House", async () => {
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "test-key");
    resetServerEnvCache();
    const fetchMock = vi.fn(async (url: string) => {
      const body = url.includes("/officers")
        ? { items: [{ name: "DIRECTOR, Ada", officer_role: "director" }] }
        : {
            company_number: "01234567",
            company_name: "DOT AND DASH CONSULTING LTD",
            date_of_creation: "2019-05-01",
            accounts: { next_due: "2026-12-31" },
            confirmation_statement: { next_due: "2027-05-15" },
          };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    expect((await refreshFromCompaniesHouse()).ok).toBe(true);
    expect(fetchMock.mock.calls[0]![0]).toBe(
      "https://api.company-information.service.gov.uk/company/01234567",
    );
    const [row] = await db.select().from(companies).where(eq(companies.id, companyId));
    expect(row).toMatchObject({
      incorporatedOn: "2019-05-01",
      accountsDue: "2026-12-31",
      confirmationStatementDue: "2027-05-15",
      directorNames: "Ada Director",
    });
    expect(row!.companiesHouseSyncedAt).toBeInstanceOf(Date);
  });

  it("explains a missing company and an unconfigured server", async () => {
    expect(await lookupCompaniesHouse("01234567")).toEqual({
      ok: false,
      error: "Companies House lookups aren't set up on this server.",
    });
    vi.stubEnv("COMPANIES_HOUSE_API_KEY", "test-key");
    resetServerEnvCache();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 404 })));
    expect(await lookupCompaniesHouse("99999999")).toEqual({
      ok: false,
      error: "Companies House has no company 99999999.",
    });
  });
});
