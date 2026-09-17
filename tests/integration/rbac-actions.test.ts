import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { users } from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { createClient } from "@/actions/clients";
import { createExpense } from "@/actions/expenses";
import { createInvoice } from "@/actions/invoices";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const clerkMocks = vi.hoisted(() => ({
  auth: vi.fn(async () => ({ userId: "user_clerk_rbac", sessionClaims: {} })),
  currentUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "rbac@example.com" },
    firstName: "Rbac",
    lastName: "User",
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

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db);
  companyId = company.id;
  clerkMocks.auth.mockResolvedValue({
    userId: "user_clerk_rbac",
    sessionClaims: {},
  });
  clerkMocks.currentUser.mockResolvedValue({
    primaryEmailAddress: { emailAddress: "rbac@example.com" },
    firstName: "Rbac",
    lastName: "User",
    publicMetadata: {},
  });
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

async function seedActor(role: "accountant" | "pending") {
  await db.insert(users).values({
    companyId,
    clerkUserId: "user_clerk_rbac",
    email: "rbac@example.com",
    name: "Rbac User",
    role,
  });
}

describe("action-level RBAC denials", () => {
  it.each(["accountant", "pending"] as const)(
    "denies createClient for %s",
    async (role) => {
      await seedActor(role);
      const form = new FormData();
      form.set("name", "Nope");
      const result = await createClient(form);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/permission/i);
    },
  );

  it("denies createExpense for accountant", async () => {
    await seedActor("accountant");
    const form = new FormData();
    form.set("description", "Should fail");
    form.set("category", "Software");
    form.set("spentAt", "2026-03-01");
    form.set("amountPounds", "10.00");
    form.set("status", "recorded");
    const result = await createExpense(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permission/i);
  });

  it("denies createInvoice for pending", async () => {
    await seedActor("pending");
    const form = new FormData();
    form.set("clientId", crypto.randomUUID());
    form.set("issueDate", "2026-03-01");
    form.set(
      "linesJson",
      JSON.stringify([
        { description: "Work", quantity: 1, unitPricePounds: "100.00" },
      ]),
    );
    const result = await createInvoice(form);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/permission/i);
  });
});
