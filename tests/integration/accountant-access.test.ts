import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { auditLog, users, yearEndRuns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { seedCompany } from "@/lib/test/seed-company";
import { GET as invoicePdf } from "@/app/api/invoices/[id]/pdf/route";
import { GET as dividendPaperwork } from "@/app/api/dividends/[id]/paperwork/route";
import { GET as oldAccountantPack } from "@/app/api/reports/accountant-pack/route";
import { GET as yearEndPack } from "@/app/api/year-end/pack/route";
import ClientsPage from "@/app/(app)/clients/page";
import DashboardPage from "@/app/(app)/dashboard/page";
import DeadlinesPage from "@/app/(app)/deadlines/page";
import DirectorsLoansPage from "@/app/(app)/directors-loans/page";
import DividendsPage from "@/app/(app)/dividends/page";
import ExpensesPage from "@/app/(app)/expenses/page";
import InvoicesPage from "@/app/(app)/invoices/page";
import QueriesPage from "@/app/(app)/queries/page";
import QuotesPage from "@/app/(app)/quotes/page";
import RecurringPage from "@/app/(app)/recurring-invoices/page";
import ReportsPage from "@/app/(app)/reports/page";
import ReservesPage from "@/app/(app)/reserves/page";
import SafeToPayPage from "@/app/(app)/safe-to-pay/page";
import ShareholdersPage from "@/app/(app)/shareholders/page";
import TransactionsPage from "@/app/(app)/transactions/page";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_accountant", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "accountant@example.com" },
    firstName: "Alex",
    lastName: "Accountant",
    publicMetadata: {},
  })),
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

type Page = (props: never) => Promise<unknown>;
const props = { searchParams: Promise.resolve({}) } as never;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { name: "Filing Co", companyNumber: "01234567" });
  await db.insert(users).values({
    companyId: company.id,
    clerkUserId: "user_clerk_accountant",
    email: "accountant@example.com",
    name: "Alex Accountant",
    role: "accountant",
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("accountant page access", () => {
  it.each<[string, Page]>([
    ["clients", ClientsPage],
    ["quotes", QuotesPage],
    ["safe to pay", SafeToPayPage],
  ])("sends them away from %s", async (_name, page) => {
    await expect(page(props)).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("starts them at Reports rather than the Overview", async () => {
    await expect(DashboardPage(props)).rejects.toThrow("REDIRECT:/reports");
  });

  it.each<[string, Page]>([
    ["reports", ReportsPage],
    ["tax and reserves", ReservesPage],
    ["director's loans", DirectorsLoansPage],
    ["deadlines", DeadlinesPage],
    ["invoices", InvoicesPage],
    ["recurring invoices", RecurringPage],
    ["dividends", DividendsPage],
    ["shareholders", ShareholdersPage],
    ["transactions", TransactionsPage],
    ["expenses", ExpensesPage],
    ["queries", QueriesPage],
  ])("lets them open %s", async (_name, page) => {
    await expect(page(props)).resolves.toBeTruthy();
  });
});

describe("accountant file access", () => {
  it("treats an unknown invoice PDF as not found rather than forbidden", async () => {
    const res = await invoicePdf(new Request("http://localhost/x") as never, {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(res.status).toBe(404);
  });

  it("refuses files the pack doesn't contain", async () => {
    const res = await dividendPaperwork(new Request("http://localhost/x") as never, {
      params: Promise.resolve({ id: randomUUID() }),
    });
    expect(res.status).toBe(403);
  });

  it("still allows the year-end pack", async () => {
    const res = await yearEndPack(
      new Request("http://localhost/api/year-end/pack?from=2025-04-01&to=2026-03-31"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/zip");
    expect(res.headers.get("Content-Disposition")).toContain(
      "year-end-pack-2025-04-01_2026-03-31.zip",
    );
    await res.body?.cancel();
  });

  it("marks the year exported only once the whole download has been sent", async () => {
    const res = await yearEndPack(
      new Request("http://localhost/api/year-end/pack?from=2025-04-01&to=2026-03-31"),
    );
    expect(await db.select().from(yearEndRuns)).toEqual([]);

    await res.arrayBuffer();
    const [run] = await db.select().from(yearEndRuns);
    expect(run).toMatchObject({ periodFrom: "2025-04-01", periodTo: "2026-03-31" });
    expect(run?.exportedAt).toBeInstanceOf(Date);
    const audit = await db.select().from(auditLog).where(eq(auditLog.action, "year_end.export"));
    expect(audit).toHaveLength(1);
  });

  it("does not mark the year exported when the download is cancelled", async () => {
    const res = await yearEndPack(
      new Request("http://localhost/api/year-end/pack?from=2025-04-01&to=2026-03-31"),
    );
    await res.body?.cancel();
    expect(await db.select().from(yearEndRuns)).toEqual([]);
  });

  it("allows the CSV version of the year-end pack", async () => {
    const res = await yearEndPack(
      new Request("http://localhost/api/year-end/pack?from=2025-04-01&to=2026-03-31&format=csv"),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Disposition")).toContain(
      "year-end-pack-2025-04-01_2026-03-31-csv.zip",
    );
    await res.body?.cancel();
  });

  it("asks for a period rather than guessing one", async () => {
    const res = await yearEndPack(new Request("http://localhost/api/year-end/pack"));
    expect(res.status).toBe(400);
  });

  it("sends the old accountant pack URL to the Year end page", async () => {
    await expect(
      oldAccountantPack(
        new Request("http://localhost/api/reports/accountant-pack?from=2026-01-01&to=2026-01-31&format=xlsx"),
      ),
    ).rejects.toThrow("REDIRECT:/year-end?from=2026-01-01&to=2026-01-31");
    await expect(
      oldAccountantPack(new Request("http://localhost/api/reports/accountant-pack")),
    ).rejects.toThrow("REDIRECT:/year-end");
  });
});
