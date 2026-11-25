import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import { auditLog, hmrcConnections, hmrcOauthStates, notifications, users } from "@/db/schema";
import { resetServerEnvCache } from "@/env";
import { seedCompany } from "@/lib/test/seed-company";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email", () => ({ sendEmail: vi.fn(async () => ({ id: "email_1" })) }));

const ENV = {
  HMRC_CLIENT_ID: "client-id",
  HMRC_CLIENT_SECRET: "client-secret",
  HMRC_ENV: "sandbox",
  HMRC_CONNECT_ENABLED: "true",
  SECRET_BOX_KEY: Buffer.alloc(32, 7).toString("base64"),
  NEXT_PUBLIC_APP_URL: "https://alfa.example",
};
const saved: Record<string, string | undefined> = {};

const { completeHmrcConnect, disconnectHmrc, getHmrcAccessToken, getHmrcConnectionStatus, HmrcConnectError, HmrcNotConnectedError, startHmrcConnect } =
  await import("@/lib/hmrc/connections");
const { hmrcFetch, HmrcApiError } = await import("@/lib/hmrc/client");
const { scanHmrcGrantsExpiring } = await import("@/lib/hmrc/notify");

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyId: string;
let otherCompanyId: string;
let adminId: string;
let otherAdminId: string;

const NOW = new Date("2026-12-01T10:00:00Z");

const WEB_CALL = {
  method: "WEB_APP_VIA_SERVER" as const,
  userId: "user-1",
  deviceId: "beec798b-b366-47fa-b1f8-92cede14a1ce",
  web: {
    screens: [{ width: 1920, height: 1080, scalingFactor: 2, colourDepth: 24 }],
    window: { width: 1256, height: 803 },
    utcOffsetMinutes: 0,
    userAgent: "Mozilla/5.0 (Test)",
  },
  publicIp: "198.51.100.7",
  publicPort: null,
  publicIpAt: NOW,
  multiFactor: [],
};
const HOUR = 60 * 60 * 1000;

function tokenResponse(access: string, refresh: string) {
  return new Response(
    JSON.stringify({ access_token: access, refresh_token: refresh, expires_in: 14400, scope: "read:vat write:vat" }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}

async function connect(at: Date = NOW) {
  const url = new URL(await startHmrcConnect({ companyId, userId: adminId, now: at }));
  const state = url.searchParams.get("state")!;
  const fetchImpl = vi.fn(async () => tokenResponse("access-1", "refresh-1"));
  await completeHmrcConnect({ companyId, userId: adminId, state, code: "code-1", now: at, fetchImpl });
  return { state, fetchImpl };
}

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
  const company = await seedCompany(db, { name: "Filing Ltd", vatRegistered: true });
  const other = await seedCompany(db, { name: "Other Ltd" });
  companyId = company!.id;
  otherCompanyId = other!.id;
  const [admin] = await db
    .insert(users)
    .values({ companyId, clerkUserId: "user_admin", email: "admin@example.com", name: "Ada", role: "admin" })
    .returning();
  const [otherAdmin] = await db
    .insert(users)
    .values({ companyId: otherCompanyId, clerkUserId: "user_other", email: "other@example.com", name: "Oli", role: "admin" })
    .returning();
  adminId = admin!.id;
  otherAdminId = otherAdmin!.id;
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("connecting", () => {
  it("stores only a hash of the state, and seals the tokens", async () => {
    const url = new URL(await startHmrcConnect({ companyId, userId: adminId, now: NOW }));
    expect(url.origin).toBe("https://test-api.service.hmrc.gov.uk");
    expect(url.searchParams.get("redirect_uri")).toBe("https://alfa.example/api/hmrc/callback");
    const state = url.searchParams.get("state")!;
    const [pending] = await db.select().from(hmrcOauthStates);
    expect(pending!.stateHash).not.toBe(state);

    await completeHmrcConnect({
      companyId,
      userId: adminId,
      state,
      code: "code-1",
      now: NOW,
      fetchImpl: vi.fn(async () => tokenResponse("access-1", "refresh-1")),
    });

    const [row] = await db.select().from(hmrcConnections);
    expect(row).toMatchObject({ companyId, environment: "sandbox", scopes: "read:vat write:vat", connectedByUserId: adminId });
    expect(row!.accessTokenSealed).not.toContain("access-1");
    expect(row!.refreshTokenSealed).not.toContain("refresh-1");
    expect(row!.grantExpiresAt.toISOString()).toBe("2028-06-01T10:00:00.000Z");
    expect(await db.select().from(hmrcOauthStates)).toEqual([]);
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "hmrc.connect"));
    expect(audit).toMatchObject({ companyId, actorUserId: adminId });

    const status = await getHmrcConnectionStatus(companyId, "sandbox", NOW);
    expect(status).toMatchObject({ connected: true, scopes: ["read:vat", "write:vat"], daysLeft: 548 });
  });

  it("uses a state once, only for the company and person who started it, and only for ten minutes", async () => {
    const { state } = await connect();
    const again = completeHmrcConnect({ companyId, userId: adminId, state, code: "c", now: NOW, fetchImpl: vi.fn() });
    await expect(again).rejects.toBeInstanceOf(HmrcConnectError);

    const url = new URL(await startHmrcConnect({ companyId, userId: adminId, now: NOW }));
    const fresh = url.searchParams.get("state")!;
    const fetchImpl = vi.fn(async () => tokenResponse("x", "y"));
    await expect(
      completeHmrcConnect({ companyId: otherCompanyId, userId: otherAdminId, state: fresh, code: "c", now: NOW, fetchImpl }),
    ).rejects.toBeInstanceOf(HmrcConnectError);
    // The other company's attempt didn't use it up, but it has expired by now.
    await expect(
      completeHmrcConnect({ companyId, userId: adminId, state: fresh, code: "c", now: new Date(NOW.getTime() + 11 * 60 * 1000), fetchImpl }),
    ).rejects.toBeInstanceOf(HmrcConnectError);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("replaces an earlier connection, and disconnecting forgets the tokens", async () => {
    await connect();
    await connect(new Date(NOW.getTime() + HOUR));
    const rows = await db.select().from(hmrcConnections).where(eq(hmrcConnections.companyId, companyId));
    expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);

    expect(await disconnectHmrc({ companyId, userId: adminId, environment: "sandbox" })).toBe(true);
    const after = await db.select().from(hmrcConnections).where(eq(hmrcConnections.companyId, companyId));
    expect(after.every((r) => r.revokedAt !== null && r.accessTokenSealed === null && r.refreshTokenSealed === null)).toBe(true);
    await expect(getHmrcAccessToken(companyId, { now: NOW })).rejects.toBeInstanceOf(HmrcNotConnectedError);
  });
});

describe("access tokens", () => {
  it("uses the stored token while it is fresh, without calling HMRC", async () => {
    await connect();
    const fetchImpl = vi.fn();
    await expect(getHmrcAccessToken(companyId, { now: new Date(NOW.getTime() + HOUR), fetchImpl })).resolves.toMatchObject({
      accessToken: "access-1",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("refreshes once when the token is about to run out, storing HMRC's new refresh token", async () => {
    await connect();
    const later = new Date(NOW.getTime() + 4 * HOUR);
    const fetchImpl = vi.fn(async () => tokenResponse("access-2", "refresh-2"));
    const [a, b] = await Promise.all([
      getHmrcAccessToken(companyId, { now: later, fetchImpl }),
      getHmrcAccessToken(companyId, { now: later, fetchImpl }),
    ]);
    expect(a.accessToken).toBe("access-2");
    expect(b.accessToken).toBe("access-2");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = new URLSearchParams(String((fetchImpl.mock.calls[0] as unknown as [URL, RequestInit])[1].body));
    expect(body.get("refresh_token")).toBe("refresh-1");

    const next = vi.fn(async () => tokenResponse("access-3", "refresh-3"));
    await getHmrcAccessToken(companyId, { now: new Date(later.getTime() + 4 * HOUR), fetchImpl: next });
    expect(new URLSearchParams(String((next.mock.calls[0] as unknown as [URL, RequestInit])[1].body)).get("refresh_token")).toBe(
      "refresh-2",
    );
  });

  it("closes the connection when HMRC says the grant is gone, or it is past 18 months", async () => {
    await connect();
    const revoked = vi.fn(
      async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400, headers: { "Content-Type": "application/json" } }),
    );
    await expect(
      getHmrcAccessToken(companyId, { now: new Date(NOW.getTime() + 5 * HOUR), fetchImpl: revoked }),
    ).rejects.toBeInstanceOf(HmrcNotConnectedError);
    expect((await getHmrcConnectionStatus(companyId, "sandbox")).connected).toBe(false);

    await connect();
    await expect(
      getHmrcAccessToken(companyId, { now: new Date("2028-07-01T00:00:00Z"), fetchImpl: vi.fn() }),
    ).rejects.toBeInstanceOf(HmrcNotConnectedError);
    expect((await getHmrcConnectionStatus(companyId, "sandbox")).connected).toBe(false);
  });
});

describe("calling HMRC", () => {
  it("sends the token and HMRC's Accept header, and audits the call", async () => {
    await connect();
    const fetchImpl = vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
      new Response(JSON.stringify({ obligations: [] }), { status: 200 }),
    );
    const result = await hmrcFetch(
      companyId,
      { path: "/organisations/vat/123456789/obligations", query: { status: "O" }, actorUserId: adminId, fraud: WEB_CALL },
      { fetchImpl, now: new Date(NOW.getTime() + HOUR) },
    );
    expect(result).toEqual({ obligations: [] });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://test-api.service.hmrc.gov.uk/organisations/vat/123456789/obligations?status=O");
    expect(init!.headers).toMatchObject({
      Accept: "application/vnd.hmrc.1.0+json",
      Authorization: "Bearer access-1",
      "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
      "Gov-Client-Public-IP": "198.51.100.7",
      "Gov-Vendor-Product-Name": "Alfa",
    });
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "hmrc.api"));
    expect(audit!.meta).toEqual({
      method: "GET",
      path: "/organisations/vat/123456789/obligations",
      status: 200,
      connectionMethod: "WEB_APP_VIA_SERVER",
    });
  });

  it("turns an HMRC error into a message", async () => {
    await connect();
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ code: "INVALID_VRN", message: "Invalid VRN" }), { status: 400 }),
    );
    const error = await hmrcFetch(companyId, { path: "/organisations/vat/1/obligations", actorUserId: null, fraud: WEB_CALL }, { fetchImpl, now: NOW }).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(HmrcApiError);
    expect(error).toMatchObject({ status: 400, code: "INVALID_VRN", message: "Invalid VRN" });
  });
});

describe("expiry warnings", () => {
  it("warns admins inside 30 days and again inside 7, once each", async () => {
    await connect();
    const in25Days = new Date("2028-05-07T10:00:00Z");
    expect(await scanHmrcGrantsExpiring(in25Days)).toBe(1);
    expect(await scanHmrcGrantsExpiring(in25Days)).toBe(0);
    expect(await scanHmrcGrantsExpiring(new Date("2028-05-26T10:00:00Z"))).toBe(1);
    const sent = await db
      .select()
      .from(notifications)
      .where(and(eq(notifications.type, "hmrc.grant_expiring"), eq(notifications.userId, adminId)));
    expect(sent.map((n) => n.title).sort()).toEqual(["HMRC access ends in 25 days", "HMRC access ends in 6 days"]);
    expect(sent[0]!.href).toBe("/settings/hmrc");
  });
});
