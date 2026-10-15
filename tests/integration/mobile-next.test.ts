import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  auditLog,
  bankAccounts,
  bankTransactions,
  deadlineFilings,
  expenses,
  users,
  weeklyCloses,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { todayIsoDate } from "@/lib/dates";
import { POST as createExpense } from "@/app/api/mobile/expenses/route";
import { POST as extractReceipt } from "@/app/api/mobile/expenses/extract/route";
import {
  GET as listDeadlines,
  POST as updateDeadline,
} from "@/app/api/mobile/deadlines/route";
import { GET as getClose, POST as closeWeek } from "@/app/api/mobile/close/route";
import {
  GET as getBookkeeper,
  POST as bookkeeperAction,
} from "@/app/api/mobile/bookkeeper/route";
import { GET as getDashboard } from "@/app/api/mobile/dashboard/route";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/ai/models", () => ({
  ASSISTANT_MODEL: "test/assistant",
  BULK_MODEL: "test/bulk",
  aiGatewayConfigured: () => false,
}));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_next", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "next@example.com" },
    firstName: "Next",
    lastName: "Test",
    publicMetadata: {},
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;

async function seedUser(role: "admin" | "accountant") {
  const [user] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_next",
      email: "next@example.com",
      name: "Next Test",
      role,
    })
    .returning();
  return user;
}

function json(body: unknown) {
  return new Request("http://localhost/api/mobile/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  companyId = (await seedCompany(db, { name: "Next Co" })).id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("mobile receipt reading", () => {
  it("validates the upload like the web form", async () => {
    await seedUser("admin");
    const form = new FormData();
    form.set("file", new File([new TextEncoder().encode("<html></html>")], "r.html"));
    const res = await extractReceipt(
      new Request("http://localhost/api/mobile/expenses/extract", {
        method: "POST",
        body: form,
      }) as never,
    );
    expect(res.status).toBe(400);
  });

  it("is refused for read-only roles", async () => {
    await seedUser("accountant");
    const res = await extractReceipt(
      new Request("http://localhost/api/mobile/expenses/extract", {
        method: "POST",
        body: new FormData(),
      }) as never,
    );
    expect(res.status).toBe(403);
  });
});

describe("mobile mileage", () => {
  it("works out the amount from miles and rate, at 0% VAT", async () => {
    await seedUser("admin");
    const res = await createExpense(
      json({
        description: "Client visit",
        category: "Travel",
        expenseDate: "2026-03-02",
        status: "reimbursable",
        useMileage: true,
        mileageMiles: 10,
        mileageRatePence: 45,
        vatRate: 20,
      }),
    );
    expect(res.status).toBe(201);
    const [row] = await db.select().from(expenses);
    expect(row.amountPence).toBe(450);
    expect(row.mileageMiles).toBe(10);
    expect(row.vatRate).toBe(0);
  });
});

describe("mobile deadlines", () => {
  it("lists deadlines and marks one done, with an audit entry", async () => {
    await seedUser("admin");
    const list = await (await listDeadlines()).json();
    expect(list.success).toBe(true);
    const open = list.data.deadlines.find((d: { status: string }) => d.status !== "done");
    expect(open).toBeTruthy();

    const res = await updateDeadline(json({ kind: open.kind, dueDate: open.dueDate, done: true }));
    expect(res.status).toBe(200);
    expect(await db.select().from(deadlineFilings)).toHaveLength(1);
    const audits = await db.select().from(auditLog).where(eq(auditLog.action, "deadline.done"));
    expect(audits).toHaveLength(1);

    const undo = await updateDeadline(json({ kind: open.kind, dueDate: open.dueDate, done: false }));
    expect(undo.status).toBe(200);
    expect(await db.select().from(deadlineFilings)).toHaveLength(0);
  });

  it("refuses an unknown deadline and read-only roles", async () => {
    await seedUser("admin");
    const bad = await updateDeadline(json({ kind: "nope", dueDate: "2026-01-01", done: true }));
    expect(bad.status).toBe(400);

    await db.update(users).set({ role: "accountant" });
    const refused = await updateDeadline(
      json({ kind: "confirmation_statement", dueDate: "2026-01-01", done: true }),
    );
    expect(refused.status).toBe(403);
  });
});

describe("mobile weekly close", () => {
  it("shows the checklist and closes the week", async () => {
    await seedUser("admin");
    await db.insert(expenses).values({
      companyId,
      description: "Emailed receipt",
      amountPence: 500,
      status: "pending",
    });

    const body = await (await getClose()).json();
    const receipts = body.data.items.find((i: { key: string }) => i.key === "receipts");
    expect(receipts.count).toBe(1);
    expect(body.data.lastClose).toBeNull();

    const res = await closeWeek();
    expect(res.status).toBe(200);
    const [close] = await db.select().from(weeklyCloses);
    expect(close.companyId).toBe(companyId);

    const after = await (await getClose()).json();
    expect(after.data.lastClose.closedByName).toBe("Next Test");
  });
});

describe("mobile AI bookkeeper", () => {
  async function seedSuggestion() {
    const [account] = await db
      .insert(bankAccounts)
      .values({ companyId, name: "Current", provider: "starling" })
      .returning();
    const [tx] = await db
      .insert(bankTransactions)
      .values({
        bankAccountId: account.id,
        externalId: "tx-1",
        bookedAt: todayIsoDate(),
        amountPence: -1999,
        counterparty: "ADOBE",
        suggestedCategory: "SOFTWARE_AND_SUBSCRIPTIONS",
        suggestedCategoryReason: "You chose this for Adobe before.",
        suggestedCategorySource: "history",
      })
      .returning();
    return tx.id;
  }

  it("lists suggestions and accepts one as the web does", async () => {
    await seedUser("admin");
    const id = await seedSuggestion();

    const body = await (await getBookkeeper()).json();
    expect(body.data.categories).toHaveLength(1);
    expect(body.data.categories[0].amountFormatted).toBe("£19.99");

    const res = await bookkeeperAction(json({ action: "accept_categories", ids: [id] }));
    expect(res.status).toBe(200);
    const [tx] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(tx.spendingCategory).toBe("SOFTWARE_AND_SUBSCRIPTIONS");
  });

  it("dismisses a suggestion so it isn't offered again", async () => {
    await seedUser("admin");
    const id = await seedSuggestion();

    const res = await bookkeeperAction(json({ action: "dismiss_categories", ids: [id] }));
    expect(res.status).toBe(200);
    const [tx] = await db.select().from(bankTransactions).where(eq(bankTransactions.id, id));
    expect(tx.categorySuggestionDismissed).toBe(true);
    expect(tx.spendingCategory).toBeNull();
  });

  it("lets an accountant look but not accept", async () => {
    await seedUser("accountant");
    const id = await seedSuggestion();

    expect((await getBookkeeper()).status).toBe(200);
    const res = await bookkeeperAction(json({ action: "accept_categories", ids: [id] }));
    expect(res.status).toBe(403);
  });

  it("refuses an unknown action", async () => {
    await seedUser("admin");
    const res = await bookkeeperAction(json({ action: "delete_everything" }));
    expect(res.status).toBe(400);
  });
});

describe("mobile dashboard safe to pay", () => {
  it("is included for a limited company and left out for a sole trader", async () => {
    await seedUser("admin");
    const ltd = await (
      await getDashboard(new NextRequest("http://localhost/api/mobile/dashboard"))
    ).json();
    expect(ltd.data.safeToPay).not.toBeNull();
    expect(typeof ltd.data.safeToPay.safeNowFormatted).toBe("string");
    expect(ltd.data.nextDeadline.daysLeft).toBeGreaterThanOrEqual(0);

    const sole = await seedCompany(db, { name: "Sole", entityType: "sole_trader" });
    await db.update(users).set({ companyId: sole.id });
    const st = await (
      await getDashboard(new NextRequest("http://localhost/api/mobile/dashboard"))
    ).json();
    expect(st.data.safeToPay).toBeNull();
  });
});
