import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { expenses, users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { GET as listExpenses } from "@/app/api/mobile/expenses/route";
import { parseMobilePage } from "@/lib/mobile/paging";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

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
