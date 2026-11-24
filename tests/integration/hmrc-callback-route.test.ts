import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { hmrcConnections, users } from "@/db/schema";
import { resetServerEnvCache } from "@/env";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
const auth = vi.hoisted(() => ({ user: null as null | Record<string, unknown> }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: vi.fn(async () => auth.user) }));
vi.mock("@/lib/errors/report", () => ({ reportError: vi.fn(async () => {}) }));

const ENV = {
  HMRC_CLIENT_ID: "client-id",
  HMRC_CLIENT_SECRET: "client-secret",
  HMRC_ENV: "sandbox",
  HMRC_CONNECT_ENABLED: "true",
  SECRET_BOX_KEY: Buffer.alloc(32, 9).toString("base64"),
  NEXT_PUBLIC_APP_URL: "https://alfa.example",
};
const saved: Record<string, string | undefined> = {};

const { GET } = await import("@/app/api/hmrc/callback/route");
const { startHmrcConnect } = await import("@/lib/hmrc/connections");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let adminId: string;

beforeAll(() => {
  for (const [k, v] of Object.entries(ENV)) {
    saved[k] = process.env[k];
    process.env[k] = v;
  }
  resetServerEnvCache();
});

afterAll(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  resetServerEnvCache();
});

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  const company = await seedCompany(db, { name: "Filing Ltd" });
  companyId = company!.id;
  const [admin] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "user_admin", email: "admin@example.com", name: "Ada", role: "admin" })
    .returning();
  adminId = admin!.id;
  auth.user = { role: "admin", companyId, localUserId: adminId };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  setTestDb(null);
  await ctx.client.close();
});

async function callback(query: string) {
  const response = await GET(new NextRequest(`https://alfa.example/api/hmrc/callback?${query}`));
  return { status: response.status, location: response.headers.get("location") };
}

describe("the HMRC callback", () => {
  it("sends someone signed out to sign in", async () => {
    auth.user = null;
    expect(await callback("code=c&state=s")).toEqual({ status: 303, location: "https://alfa.example/sign-in" });
  });

  it("refuses anyone who isn't an admin", async () => {
    auth.user = { role: "user", companyId, localUserId: adminId };
    expect((await callback("code=c&state=s")).location).toBe("https://alfa.example/settings/hmrc?hmrc=forbidden");
  });

  it("says when the admin chose not to grant access", async () => {
    expect((await callback("error=access_denied&state=s")).location).toBe("https://alfa.example/settings/hmrc?hmrc=denied");
  });

  it("refuses a state it didn't issue", async () => {
    expect((await callback("code=c&state=made-up")).location).toBe("https://alfa.example/settings/hmrc?hmrc=expired");
    expect(await db.select().from(hmrcConnections)).toEqual([]);
  });

  it("connects with a state it issued", async () => {
    const url = new URL(await startHmrcConnect({ companyId, userId: adminId }));
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ access_token: "a", refresh_token: "r", expires_in: 14400 }), { status: 200 }),
      ),
    );
    const result = await callback(`code=c&state=${encodeURIComponent(url.searchParams.get("state")!)}`);
    expect(result.location).toBe("https://alfa.example/settings/hmrc?hmrc=connected");
    expect(await db.select().from(hmrcConnections)).toHaveLength(1);
  });

  it("is unavailable until the server is set up", async () => {
    process.env.HMRC_CONNECT_ENABLED = "false";
    resetServerEnvCache();
    try {
      expect((await callback("code=c&state=s")).location).toBe("https://alfa.example/settings/hmrc?hmrc=unavailable");
    } finally {
      process.env.HMRC_CONNECT_ENABLED = "true";
      resetServerEnvCache();
    }
  });
});
