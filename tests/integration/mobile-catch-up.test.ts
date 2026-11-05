import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { eq } from "drizzle-orm";
import { auditLog, clients, expenses, labels, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import {
  GET as listExpenses,
  POST as createExpense,
} from "@/app/api/mobile/expenses/route";
import { GET as expenseOptions } from "@/app/api/mobile/expenses/options/route";
import { GET as listLabels, POST as createLabel } from "@/app/api/mobile/labels/route";
import { POST as annotateExpense } from "@/app/api/mobile/expenses/[id]/annotations/route";
import { parseMobilePage } from "@/lib/mobile/paging";
import { GET as listRecords } from "@/app/api/mobile/records/route";
import {
  GET as getNotificationPrefs,
  PUT as putNotificationPrefs,
} from "@/app/api/mobile/notifications/prefs/route";
import { HIDDEN_PUSH_TITLE, withLockScreenPrivacy } from "@/lib/notifications/push";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

// 1.25 euros to the pound, whatever the day.
vi.mock("@/lib/bank/fx", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/bank/fx")>()),
  resolveFxRate: vi.fn(async (currency: string, onDate: string) =>
    currency === "EUR" ? { currency, observationDate: onDate, foreignPerGbp: 1.25 } : null,
  ),
}));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_mobile", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "admin@example.com" },
    firstName: "Admin",
    lastName: "Mobile",
    publicMetadata: {},
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: clerkMocks.auth,
  currentUser: clerkMocks.currentUser,
}));

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedUser(
  companyId: string,
  role: "admin" | "user" | "accountant" = "admin",
) {
  const [row] = await db
    .insert(users)
    .values({
      companyId,
      clerkUserId: "user_clerk_mobile",
      email: "admin@example.com",
      role,
      name: "Admin",
    })
    .returning();
  return row;
}

function get(url: string) {
  return new Request(`http://localhost${url}`) as never;
}

describe("mobile paging", () => {
  it("clamps limit and offset", () => {
    const page = (qs: string) => parseMobilePage(new URLSearchParams(qs));
    expect(page("")).toEqual({ limit: 50, offset: 0 });
    expect(page("limit=1000&offset=-4")).toEqual({ limit: 100, offset: 0 });
    expect(page("limit=0")).toEqual({ limit: 1, offset: 0 });
    expect(page("limit=abc&offset=xyz")).toEqual({ limit: 50, offset: 0 });
  });

  it("pages the expense list and says when there is more", async () => {
    const company = await seedCompany(db, { name: "Paging Co" });
    await seedUser(company.id);
    await db.insert(expenses).values(
      Array.from({ length: 5 }, (_, i) => ({
        companyId: company.id,
        description: `Expense ${i}`,
        amountPence: 100 + i,
        spentAt: `2026-03-0${i + 1}`,
        status: "recorded" as const,
      })),
    );

    const first = await (await listExpenses(get("/api/mobile/expenses?limit=2"))).json();
    expect(first.data.map((e: { description: string }) => e.description)).toEqual([
      "Expense 4",
      "Expense 3",
    ]);
    expect(first.hasMore).toBe(true);

    const last = await (
      await listExpenses(get("/api/mobile/expenses?limit=2&offset=4"))
    ).json();
    expect(last.data).toHaveLength(1);
    expect(last.hasMore).toBe(false);
  });
});

function postJson(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as never;
}

describe("mobile record paging", () => {
  it("pages a record list but counts everything", async () => {
    const company = await seedCompany(db, { name: "Records Co" });
    await seedUser(company.id);
    await db.insert(clients).values(
      ["Ada", "Bea", "Cy"].map((name) => ({ companyId: company.id, name })),
    );

    const req = (qs: string) =>
      Object.assign(new Request(`http://localhost/api/mobile/records?${qs}`), {
        nextUrl: new URL(`http://localhost/api/mobile/records?${qs}`),
      }) as never;
    const first = (await (await listRecords(req("resource=clients&limit=2"))).json()).data;
    expect(first.items).toHaveLength(2);
    expect(first.hasMore).toBe(true);
    expect(first.stats[0].value).toBe("3");

    const rest = (await (await listRecords(req("resource=clients&limit=2&offset=2"))).json()).data;
    expect(rest.items).toHaveLength(1);
    expect(rest.hasMore).toBe(false);
  });
});

describe("mobile foreign-currency expenses", () => {
  const base = {
    description: "Paris train",
    category: "Travel",
    expenseDate: "2026-03-02",
    status: "recorded",
  };

  it("converts a foreign amount to sterling at the Bank of England rate", async () => {
    const company = await seedCompany(db, { name: "Euro Co" });
    await seedUser(company.id);

    const res = await createExpense(
      postJson("/api/mobile/expenses", { ...base, currency: "EUR", originalAmount: "12.50" }),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.amountPence).toBe(1000);
    expect(body.data.currency).toBe("EUR");
    expect(body.data.originalAmountMinor).toBe(1250);
    expect(body.data.amountFormatted).toBe("£10.00 (€12.50)");
  });

  it("keeps a sterling figure the person typed", async () => {
    const company = await seedCompany(db, { name: "Override Co" });
    await seedUser(company.id);

    const res = await createExpense(
      postJson("/api/mobile/expenses", {
        ...base,
        currency: "EUR",
        originalAmount: "12.50",
        amountPence: 1111,
      }),
    );
    expect((await res.json()).data.amountPence).toBe(1111);
  });

  it("asks for pounds when there is no rate", async () => {
    const company = await seedCompany(db, { name: "No Rate Co" });
    await seedUser(company.id);

    const res = await createExpense(
      postJson("/api/mobile/expenses", { ...base, currency: "USD", originalAmount: "12.50" }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors.amountPounds).toMatch(/Enter the amount in GBP/);
  });

  it("gives the capture form the currencies it can convert", async () => {
    const company = await seedCompany(db, { name: "Currencies Co" });
    await seedUser(company.id);

    const body = await (await expenseOptions()).json();
    expect(body.data.currencies[0]).toBe("GBP");
    expect(body.data.currencies).toContain("EUR");
  });
});

function params<T extends Record<string, string>>(value: T) {
  return { params: Promise.resolve(value) };
}

describe("mobile labels and notes", () => {
  async function seedExpense(companyId: string, description = "Taxi") {
    const [row] = await db
      .insert(expenses)
      .values({ companyId, description, amountPence: 900, status: "recorded" })
      .returning();
    return row;
  }

  it("creates labels, tags an expense, writes a note, and audits both", async () => {
    const company = await seedCompany(db, { name: "Labels Co" });
    await seedUser(company.id);
    const expense = await seedExpense(company.id);

    const created = await createLabel(postJson("/api/mobile/labels", { name: "Client A", color: "blue" }));
    expect(created.status).toBe(201);
    const labelId = (await created.json()).data.id;

    const listed = await (await listLabels()).json();
    expect(listed.data.labels.map((l: { name: string }) => l.name)).toEqual(["Client A"]);

    const res = await annotateExpense(
      postJson(`/api/mobile/expenses/${expense.id}/annotations`, {
        labelIds: [labelId],
        note: "Shared with Bea",
      }),
      params({ id: expense.id }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.labels).toEqual([{ id: labelId, name: "Client A", color: "blue" }]);
    expect(body.data.notes).toBe("Shared with Bea");

    const actions = (await db.select().from(auditLog).where(eq(auditLog.entityId, expense.id))).map(
      (a) => a.action,
    );
    expect(actions).toEqual(expect.arrayContaining(["expense.set_labels", "expense.update_note"]));
  });

  it("filters the list by label", async () => {
    const company = await seedCompany(db, { name: "Filter Co" });
    await seedUser(company.id);
    const tagged = await seedExpense(company.id, "Tagged");
    await seedExpense(company.id, "Untagged");
    const [label] = await db
      .insert(labels)
      .values({ companyId: company.id, name: "Trip", color: "red" })
      .returning();
    await annotateExpense(
      postJson(`/api/mobile/expenses/${tagged.id}/annotations`, { labelIds: [label.id] }),
      params({ id: tagged.id }),
    );

    const body = await (await listExpenses(get(`/api/mobile/expenses?label=${label.id}`))).json();
    expect(body.data.map((e: { description: string }) => e.description)).toEqual(["Tagged"]);
  });

  it("refuses another company's label or expense", async () => {
    const company = await seedCompany(db, { name: "Mine" });
    const other = await seedCompany(db, { name: "Theirs" });
    await seedUser(company.id);
    const mine = await seedExpense(company.id);
    const theirs = await seedExpense(other.id);
    const [theirLabel] = await db
      .insert(labels)
      .values({ companyId: other.id, name: "Secret", color: "red" })
      .returning();

    const wrongLabel = await annotateExpense(
      postJson(`/api/mobile/expenses/${mine.id}/annotations`, { labelIds: [theirLabel.id] }),
      params({ id: mine.id }),
    );
    expect(wrongLabel.status).toBe(400);

    const wrongExpense = await annotateExpense(
      postJson(`/api/mobile/expenses/${theirs.id}/annotations`, { note: "hi" }),
      params({ id: theirs.id }),
    );
    expect(wrongExpense.status).toBe(404);
    const [untouched] = await db.select().from(expenses).where(eq(expenses.id, theirs.id));
    expect(untouched.notes).toBeNull();
  });

  it("doesn't let an accountant annotate", async () => {
    const company = await seedCompany(db, { name: "Acc Co" });
    await seedUser(company.id, "accountant");
    const expense = await seedExpense(company.id);

    const res = await annotateExpense(
      postJson(`/api/mobile/expenses/${expense.id}/annotations`, { note: "x" }),
      params({ id: expense.id }),
    );
    expect(res.status).toBe(403);
  });
});

describe("lock-screen privacy", () => {
  it("hides push text for this person once they turn it on", async () => {
    const company = await seedCompany(db, { name: "Private Co" });
    const user = await seedUser(company.id);
    const payload = {
      userId: user.id,
      companyId: company.id,
      title: "Invoice paid",
      body: "£1,200.00 paid by card.",
      notificationId: "n1",
    };

    expect(await withLockScreenPrivacy(payload)).toEqual(payload);

    const put = await putNotificationPrefs(
      postJson("/api/mobile/notifications/prefs", { scope: "user", hidePushDetails: true }, "PUT"),
    );
    expect(put.status).toBe(200);
    expect((await (await getNotificationPrefs()).json()).data.hidePushDetails).toBe(true);

    expect(await withLockScreenPrivacy(payload)).toEqual({
      ...payload,
      title: HIDDEN_PUSH_TITLE,
      body: "",
    });
  });

  it("keeps the person's alert choices when the setting changes", async () => {
    const company = await seedCompany(db, { name: "Prefs Co" });
    await seedUser(company.id);
    await putNotificationPrefs(
      postJson(
        "/api/mobile/notifications/prefs",
        { scope: "user", matrix: { "invoice.paid": { inApp: true, email: false, push: true } } },
        "PUT",
      ),
    );
    await putNotificationPrefs(
      postJson("/api/mobile/notifications/prefs", { scope: "user", hidePushDetails: true }, "PUT"),
    );

    const data = (await (await getNotificationPrefs()).json()).data;
    expect(data.userOverrides["invoice.paid"]?.push).toBe(true);
  });
});
