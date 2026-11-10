import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { NextRequest } from "next/server";
import { createTestDb, type TestDatabase } from "@/db/pglite";
import { setTestDb, type Database } from "@/db";
import {
  assistantConnections,
  auditLog,
  clients,
  companies,
  companyBilling,
  companyMemberships,
  expenses,
  invoiceLineItems,
  invoices,
  notifications,
  quoteLineItems,
  quotes,
  quoteVersions,
  users,
} from "@/db/schema";
import { seedCompany } from "@/lib/test/seed-company";
import { todayIsoDate } from "@/lib/dates";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T,>(fn: T) => fn,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

/** Token → who it was issued to. Anything else fails verification, like Clerk. */
const tokens = vi.hoisted(
  () => new Map<string, { clientId: string; subject: string; expiration?: number }>(),
);
/** Who is signed in to Alfa itself, for the Settings actions. */
const signedIn = vi.hoisted(() => ({ userId: null as string | null }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: signedIn.userId, sessionClaims: {} })),
  currentUser: vi.fn(async () =>
    signedIn.userId
      ? { primaryEmailAddress: { emailAddress: `${signedIn.userId}@example.com` }, publicMetadata: {} }
      : null,
  ),
  clerkClient: async () => ({
    idPOAuthAccessToken: {
      verify: async (token: string) => {
        const t = tokens.get(token);
        if (!t) throw new Error("invalid");
        return {
          expiration: Date.now() + 3_600_000,
          ...t,
          scopes: [],
          revoked: false,
          expired: false,
        };
      },
    },
  }),
}));

const { POST } = await import("@/app/api/mcp/route");
const { setAssistantAccess, setAssistantConnected, setAssistantDrafts } = await import(
  "@/actions/assistant"
);
const { assistantDisplayName, DAILY_TOOL_CALL_LIMIT } = await import("@/lib/assistant/mcp/access");
const { forgetVerifiedTokens } = await import("@/lib/assistant/mcp/oauth");
const { GET: getResourceMetadata } = await import(
  "@/app/.well-known/oauth-protected-resource/[[...path]]/route"
);

const today = todayIsoDate();
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let db: TestDatabase;
let companyA: string;
let companyB: string;
let adminId: string;
let rpcId = 0;

async function rpc(
  token: string | null,
  method: string,
  params: Record<string, unknown> = {},
  extraHeaders: Record<string, string> = {},
) {
  const res = await POST(
    new NextRequest("http://localhost/api/mcp", {
      method: "POST",
      headers: {
        ...extraHeaders,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method, params }),
    }),
  );
  const raw = await res.text();
  const body = res.headers.get("content-type")?.includes("text/event-stream")
    ? JSON.parse(raw.split("\n").find((l) => l.startsWith("data: "))!.slice(6))
    : raw
      ? JSON.parse(raw)
      : null;
  return { res, body };
}

async function toolNames(token: string): Promise<string[]> {
  const { body } = await rpc(token, "tools/list");
  return body.result.tools.map((t: { name: string }) => t.name);
}

async function callTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const { body } = await rpc(token, "tools/call", { name, arguments: args });
  const result = body.result as { isError?: boolean; content: { text: string }[] };
  const text = result.content[0]!.text;
  return { isError: result.isError === true, text, json: result.isError ? null : JSON.parse(text) };
}

async function seedPerson(
  clerkUserId: string,
  currentCompanyId: string,
  memberships: { companyId: string; role: "admin" | "user" | "accountant" | "pending" }[],
) {
  const role = memberships.find((m) => m.companyId === currentCompanyId)!.role;
  const [user] = await db
    .insert(users)
    .values({ clerkUserId, email: `${clerkUserId}@example.com`, role, companyId: currentCompanyId })
    .returning();
  await db.insert(companyMemberships).values(memberships.map((m) => ({ ...m, userId: user!.id })));
  return user!.id;
}

async function seedInvoice(companyId: string, number: string, status: "draft" | "sent") {
  const [client] = await db.insert(clients).values({ companyId, name: `Client of ${number}` }).returning();
  await db.insert(invoices).values({
    companyId,
    number,
    clientId: client!.id,
    status,
    issueDate: status === "draft" ? null : today,
    dueDate: today,
    netPence: 10_000,
    grossPence: 12_000,
  });
}

beforeEach(async () => {
  ctx = await createTestDb();
  db = ctx.db;
  setTestDb(db as unknown as Database);
  tokens.clear();
  forgetVerifiedTokens();
  signedIn.userId = null;
  companyA = (await seedCompany(db, { name: "Alpha Ltd", slug: "alpha", aiAssistantEnabled: true })).id;
  companyB = (await seedCompany(db, { name: "Beta Ltd", slug: "beta", aiAssistantEnabled: true })).id;

  adminId = await seedPerson("user_admin", companyA, [{ companyId: companyA, role: "admin" }]);
  await seedPerson("user_accountant", companyA, [
    { companyId: companyA, role: "accountant" },
    { companyId: companyB, role: "accountant" },
  ]);
  tokens.set("admin-token", { clientId: "client_claude", subject: "user_admin" });
  tokens.set("accountant-token", { clientId: "client_chatgpt", subject: "user_accountant" });

  await seedInvoice(companyA, "A-1", "sent");
  await seedInvoice(companyA, "A-DRAFT", "draft");
  await seedInvoice(companyB, "B-1", "sent");
});

afterEach(async () => {
  setTestDb(null);
  await ctx.client.close();
});

describe("MCP sign-in", () => {
  it("answers 401 with a pointer to the OAuth metadata when there's no token", async () => {
    const { res } = await rpc(null, "tools/list");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      "http://localhost/.well-known/oauth-protected-resource/api/mcp",
    );
  });

  it("points at the public address when reached through a proxy or tunnel", async () => {
    const { res } = await rpc(null, "tools/list", {}, {
      "x-forwarded-host": "alfa.example.ngrok.dev",
      "x-forwarded-proto": "https",
    });
    expect(res.headers.get("www-authenticate")).toContain(
      "https://alfa.example.ngrok.dev/.well-known/oauth-protected-resource/api/mcp",
    );
  });

  it("accepts a token whose expiry Clerk gives in seconds", async () => {
    tokens.set("seconds-token", {
      clientId: "client_claude",
      subject: "user_admin",
      expiration: Math.floor(Date.now() / 1000) + 3600,
    });
    expect((await rpc("seconds-token", "tools/list")).res.status).toBe(200);
  });

  it("refuses a token Clerk doesn't recognise", async () => {
    const { res } = await rpc("forged", "tools/list");
    expect(res.status).toBe(401);
  });

  it("records the connection, and refuses it once disconnected", async () => {
    await toolNames("admin-token");
    const [connection] = await db
      .select()
      .from(assistantConnections)
      .where(eq(assistantConnections.userId, adminId));
    expect(connection).toMatchObject({ oauthClientId: "client_claude", revokedAt: null });

    await db.update(assistantConnections).set({ revokedAt: new Date() });
    const { res } = await rpc("admin-token", "tools/list");
    expect(res.status).toBe(403);
  });
});

describe("MCP tools for a founder", () => {
  it("offers every tool, with no company argument for a single company", async () => {
    const { body } = await rpc("admin-token", "tools/list");
    const tools = body.result.tools as { name: string; inputSchema: { properties?: object } }[];
    expect(tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(["list_my_companies", "safe_to_pay_yourself", "search_invoices", "cash_forecast"]),
    );
    const search = tools.find((t) => t.name === "search_invoices")!;
    expect(search.inputSchema.properties).not.toHaveProperty("company");
  });

  it("reads only its own company, including drafts, and audits the call", async () => {
    const { json } = await callTool("admin-token", "search_invoices");
    expect(json.company).toBe("Alpha Ltd");
    expect(json.result.invoices.map((i: { number: string }) => i.number).sort()).toEqual(["A-1", "A-DRAFT"]);
    expect(json.openInAlfa).toBe("http://localhost/invoices");

    const audits = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyA), eq(auditLog.action, "assistant.tool")));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.meta).toMatchObject({ tool: "search_invoices", oauthClientId: "client_claude" });
  });

  it("won't read a company the person isn't part of", async () => {
    const list = await callTool("admin-token", "list_my_companies");
    expect(list.text).not.toContain("Beta Ltd");

    // One company, so the tools take no company argument: a stray one is dropped.
    const named = await callTool("admin-token", "search_invoices", { company: companyB });
    expect(named.json.company).toBe("Alpha Ltd");
    expect(named.text).not.toContain("B-1");
  });
});

describe("MCP tools for an accountant", () => {
  it("offers only what an accountant can open in Alfa", async () => {
    const names = await toolNames("accountant-token");
    expect(names).toEqual(expect.arrayContaining(["search_invoices", "profit_and_loss", "accountant_queries"]));
    expect(names).not.toContain("safe_to_pay_yourself");
    expect(names).not.toContain("cash_forecast");
    expect(names).not.toContain("list_clients");
  });

  it("offers only the starter questions their tools can answer", async () => {
    const names = async (token: string) =>
      ((await rpc(token, "prompts/list")).body.result.prompts as { name: string }[]).map((p) => p.name).sort();
    // Drafts are off for a new connection, so no drafting questions either.
    expect(await names("admin-token")).toEqual([
      "explain_my_numbers",
      "ready_for_accountant",
      "safe_to_pay_myself",
      "weekly_money_check_in",
      "who_owes_me",
    ]);
    expect(await names("accountant-token")).toEqual(["explain_my_numbers", "ready_for_accountant", "who_owes_me"]);
  });

  it("sees only invoices in the accountant pack, and picks the company by name", async () => {
    const a = await callTool("accountant-token", "search_invoices");
    expect(a.json.company).toBe("Alpha Ltd");
    expect(a.json.result.invoices.map((i: { number: string }) => i.number)).toEqual(["A-1"]);

    const b = await callTool("accountant-token", "search_invoices", { company: "beta ltd" });
    expect(b.json.company).toBe("Beta Ltd");
    expect(b.json.result.invoices.map((i: { number: string }) => i.number)).toEqual(["B-1"]);
  });

  it("asks which company when two of theirs share a name, and accepts the id", async () => {
    await db.update(companies).set({ name: "Alpha Ltd" }).where(eq(companies.id, companyB));
    const byName = await callTool("accountant-token", "search_invoices", { company: "Alpha Ltd" });
    expect(byName.isError).toBe(true);
    expect(byName.text).toContain("More than one of your companies");

    const byId = await callTool("accountant-token", "search_invoices", { company: companyB });
    expect(byId.json.result.invoices.map((i: { number: string }) => i.number)).toEqual(["B-1"]);
  });

  it("refuses a company they don't belong to", async () => {
    const gamma = await seedCompany(db, { name: "Gamma Ltd", slug: "gamma", aiAssistantEnabled: true });
    await seedInvoice(gamma.id, "G-1", "sent");
    for (const company of ["Gamma Ltd", gamma.id]) {
      const { isError, text } = await callTool("accountant-token", "search_invoices", { company });
      expect(isError).toBe(true);
      expect(text).not.toContain("G-1");
    }
  });

  it("can't open a draft invoice by number", async () => {
    const { json } = await callTool("accountant-token", "get_invoice", { number: "A-DRAFT" });
    expect(json.result).toEqual({ error: "No invoice numbered A-DRAFT." });
  });
});

describe("company switch", () => {
  it("offers only list_my_companies, and explains, when no company has it on", async () => {
    await db.update(companies).set({ aiAssistantEnabled: false });
    expect(await toolNames("admin-token")).toEqual(["list_my_companies"]);
  });

  it("refuses a named company that has it off", async () => {
    await db.update(companies).set({ aiAssistantEnabled: false }).where(eq(companies.id, companyB));
    const { isError, text } = await callTool("accountant-token", "search_invoices", { company: "Beta Ltd" });
    expect(isError).toBe(true);
    expect(text).toContain("AI assistant access is turned off for Beta Ltd");
  });
});

describe("OAuth discovery", () => {
  it("describes the MCP endpoint and points at Clerk as the authorization server", async () => {
    const issuer = "https://clerk.example.com";
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", `pk_test_${Buffer.from("clerk.example.com$").toString("base64")}`);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          issuer,
          authorization_endpoint: `${issuer}/oauth/authorize`,
          token_endpoint: `${issuer}/oauth/token`,
          registration_endpoint: `${issuer}/oauth/register`,
          response_types_supported: ["code"],
        }),
      ),
    );
    try {
      const res = await getResourceMetadata(
        new NextRequest("http://localhost/.well-known/oauth-protected-resource/api/mcp"),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({
        resource: "http://localhost/api/mcp",
        authorization_servers: [issuer],
        resource_name: "Alfa",
      });
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  });
});

describe("connected assistants in Settings", () => {
  it("names the connection from what the assistant calls itself", async () => {
    await rpc("admin-token", "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "claude-ai", version: "1.0" },
    });
    const [connection] = await db
      .select()
      .from(assistantConnections)
      .where(eq(assistantConnections.userId, adminId));
    expect(connection!.clientName).toBe("Claude");

    expect(assistantDisplayName({ name: "my-agent", title: "My Agent" })).toBe("My Agent");
    expect(assistantDisplayName({ name: "  " })).toBeNull();
    expect(assistantDisplayName("claude-ai")).toBeNull();
  });

  it("tells the person once when a new assistant connects, naming its OAuth client", async () => {
    const connected = () =>
      db.select().from(notifications).where(eq(notifications.type, "assistant.connected"));

    await rpc("admin-token", "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "claude-ai", version: "1.0" },
    });
    await toolNames("admin-token");
    await toolNames("admin-token");

    const [notice, ...others] = await connected();
    expect(others).toHaveLength(0);
    expect(notice).toMatchObject({ userId: adminId, companyId: companyA, href: "/settings/ai-assistant" });
    expect(notice!.body).toContain('"Claude"');
    expect(notice!.body).toContain("client_claude");

    // A different assistant is new again, and only its own person hears about it.
    await toolNames("accountant-token");
    const notices = await connected();
    expect(notices).toHaveLength(2);
    expect(notices.filter((n) => n.userId === adminId)).toHaveLength(1);
  });

  it("disconnects an assistant at once, and allows it again", async () => {
    await toolNames("admin-token");
    const [connection] = await db
      .select()
      .from(assistantConnections)
      .where(eq(assistantConnections.userId, adminId));

    signedIn.userId = "user_accountant";
    expect(await setAssistantConnected(connection!.id, false)).toMatchObject({ ok: false });
    expect((await rpc("admin-token", "tools/list")).res.status).toBe(200);

    signedIn.userId = "user_admin";
    expect(await setAssistantConnected(connection!.id, false)).toMatchObject({ ok: true });
    expect((await rpc("admin-token", "tools/list")).res.status).toBe(403);

    expect(await setAssistantConnected(connection!.id, true)).toMatchObject({ ok: true });
    expect((await rpc("admin-token", "tools/list")).res.status).toBe(200);

    const audits = await db.select().from(auditLog).where(eq(auditLog.entityId, connection!.id));
    expect(audits.map((a) => a.action).sort()).toEqual(["assistant.disconnect", "assistant.reconnect"]);
  });

  it("lets an admin turn access off, but not an accountant", async () => {
    signedIn.userId = "user_accountant";
    expect(await setAssistantAccess(false)).toMatchObject({ ok: false });
    expect(await toolNames("admin-token")).toContain("search_invoices");

    signedIn.userId = "user_admin";
    expect(await setAssistantAccess(false)).toMatchObject({ ok: true });
    expect(await toolNames("admin-token")).toEqual(["list_my_companies"]);
    const [company] = await db.select().from(companies).where(eq(companies.id, companyA));
    expect(company!.aiAssistantEnabled).toBe(false);
  });
});

async function connectionOf(userId: string) {
  const [connection] = await db
    .select()
    .from(assistantConnections)
    .where(eq(assistantConnections.userId, userId));
  return connection!;
}

const DRAFT_TOOL_NAMES = ["create_draft_invoice", "create_draft_quote", "create_draft_expense"];

describe("allowing drafts", () => {
  it("is off for a new connection: no draft tools, and a stray draft call is refused", async () => {
    const names = await toolNames("admin-token");
    for (const name of DRAFT_TOOL_NAMES) expect(names).not.toContain(name);

    const { body } = await rpc("admin-token", "tools/call", {
      name: "create_draft_expense",
      arguments: { description: "Lunch", amount: 12 },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(await db.select().from(expenses)).toHaveLength(0);
  });

  it("is the person's own choice, per assistant, and audited", async () => {
    await toolNames("admin-token");
    const connection = await connectionOf(adminId);

    signedIn.userId = "user_accountant";
    expect(await setAssistantDrafts(connection.id, true)).toMatchObject({ ok: false });
    expect((await connectionOf(adminId)).allowDrafts).toBe(false);

    signedIn.userId = "user_admin";
    expect(await setAssistantDrafts(connection.id, true)).toMatchObject({ ok: true });
    expect(await toolNames("admin-token")).toEqual(expect.arrayContaining(DRAFT_TOOL_NAMES));
    const [audit] = await db.select().from(auditLog).where(eq(auditLog.action, "assistant.drafts"));
    expect(audit).toMatchObject({ entityId: connection.id, meta: { allowed: true } });

    expect(await setAssistantDrafts(connection.id, false)).toMatchObject({ ok: true });
    expect(await toolNames("admin-token")).not.toContain("create_draft_invoice");
  });
});

describe("daily limit", () => {
  it("can't be overshot by calls arriving together", async () => {
    await db.insert(auditLog).values(
      Array.from({ length: DAILY_TOOL_CALL_LIMIT - 1 }, () => ({
        companyId: companyA,
        actorUserId: adminId,
        action: "assistant.tool",
        entityType: "assistant_tool",
      })),
    );
    const results = await Promise.all(
      Array.from({ length: 3 }, () => callTool("admin-token", "list_clients")),
    );
    expect(results.filter((r) => !r.isError)).toHaveLength(1);
    expect(results.filter((r) => r.isError)[0]!.text).toContain("today's limit");
    const used = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyA), eq(auditLog.action, "assistant.tool")));
    expect(used).toHaveLength(DAILY_TOOL_CALL_LIMIT);
  });
});

describe("draft tools", () => {
  beforeEach(async () => {
    await toolNames("admin-token");
    await toolNames("accountant-token");
    await db.update(assistantConnections).set({ allowDrafts: true });
  });

  it("are offered to founders who allow them, never to accountants", async () => {
    expect(await toolNames("admin-token")).toEqual(expect.arrayContaining(DRAFT_TOOL_NAMES));
    const prompts = (await rpc("admin-token", "prompts/list")).body.result.prompts as { name: string }[];
    expect(prompts.map((p) => p.name)).toEqual(expect.arrayContaining(["draft_an_invoice", "draft_a_quote"]));
    const accountant = await toolNames("accountant-token");
    expect(accountant).not.toContain("create_draft_invoice");
    expect(accountant).not.toContain("create_draft_quote");
    expect(accountant).not.toContain("create_draft_expense");
  });

  it("creates a draft invoice for the client, unsent, and audits it as the assistant's", async () => {
    await db.update(companies).set({ vatRegistered: true }).where(eq(companies.id, companyA));
    const { isError, json } = await callTool("admin-token", "create_draft_invoice", {
      client: "client of a-1",
      lines: [{ description: "Design work", quantity: 3, unitPrice: 500 }],
      issueDate: today,
    });
    expect(isError).toBe(false);
    expect(json.created).toMatchObject({ client: "Client of A-1", net: "£1,500.00", vat: "£300.00", total: "£1,800.00" });

    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyA), eq(invoices.number, json.created.number)));
    expect(invoice).toMatchObject({ status: "draft", createdByUserId: adminId, grossPence: 180_000 });
    expect(json.openInAlfa).toBe(`http://localhost/invoices/${invoice!.id}`);
    const lines = await db.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, invoice!.id));
    expect(lines).toHaveLength(1);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyA), eq(auditLog.action, "invoice.create")));
    expect(audit).toMatchObject({ entityId: invoice!.id, actorUserId: adminId, meta: { via: "assistant" } });
  });

  it("creates a draft quote, version 1, unsent, and audits it as the assistant's", async () => {
    const { isError, json } = await callTool("admin-token", "create_draft_quote", {
      client: "Client of A-1",
      lines: [
        { description: "Discovery workshop", unitPrice: 1200, vatRate: 0 },
        { description: "Prototype", quantity: 2, unitPrice: 800, vatRate: 0 },
      ],
      issueDate: today,
    });
    expect(isError).toBe(false);
    expect(json.created).toMatchObject({ client: "Client of A-1", total: "£2,800.00", validUntil: null });
    expect(json.created.reference).toMatch(/\(v1\)$/);

    const [quote] = await db.select().from(quotes).where(eq(quotes.companyId, companyA));
    expect(quote).toMatchObject({ status: "draft", version: 1, createdByUserId: adminId, grossPence: 280_000 });
    expect(json.openInAlfa).toBe(`http://localhost/quotes/${quote!.id}`);
    expect(await db.select().from(quoteLineItems).where(eq(quoteLineItems.quoteId, quote!.id))).toHaveLength(2);
    expect(await db.select().from(quoteVersions).where(eq(quoteVersions.quoteId, quote!.id))).toHaveLength(1);

    const [audit] = await db
      .select()
      .from(auditLog)
      .where(and(eq(auditLog.companyId, companyA), eq(auditLog.action, "quote.create")));
    expect(audit).toMatchObject({ entityId: quote!.id, meta: { via: "assistant" } });
  });

  it("returns the draft already made when an assistant retries the same call", async () => {
    const args = { client: "Client of A-1", lines: [{ description: "Design work", unitPrice: 500 }] };
    const first = await callTool("admin-token", "create_draft_invoice", args);
    const retry = await callTool("admin-token", "create_draft_invoice", args);
    expect(retry.isError).toBe(false);
    expect(retry.json.alreadyCreated).toBeTruthy();
    expect(retry.json.openInAlfa).toBe(first.json.openInAlfa);
    const drafts = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyA), eq(invoices.status, "draft")));
    expect(drafts).toHaveLength(2); // A-DRAFT from the seed, plus one.

    const changed = await callTool("admin-token", "create_draft_invoice", {
      ...args,
      lines: [{ description: "Design work", unitPrice: 550 }],
    });
    expect(changed.json.created).toBeTruthy();
  });

  it("creates one draft when identical calls arrive together", async () => {
    const args = { client: "Client of A-1", lines: [{ description: "Design work", unitPrice: 500 }] };
    const results = await Promise.all(
      Array.from({ length: 4 }, () => callTool("admin-token", "create_draft_invoice", args)),
    );
    expect(results.filter((r) => r.json?.created)).toHaveLength(1);
    const drafts = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.companyId, companyA), eq(invoices.status, "draft")));
    expect(drafts).toHaveLength(2); // A-DRAFT from the seed, plus one.
  });

  it("lets a failed draft be tried again once the problem is fixed", async () => {
    const args = { client: "New Client Ltd", lines: [{ description: "Work", unitPrice: 100 }] };
    expect((await callTool("admin-token", "create_draft_invoice", args)).isError).toBe(true);
    await db.insert(clients).values({ companyId: companyA, name: "New Client Ltd" });
    const retry = await callTool("admin-token", "create_draft_invoice", args);
    expect(retry.json.created).toMatchObject({ client: "New Client Ltd" });
  });

  it("refuses amounts that aren't whole pence, rather than rounding them", async () => {
    for (const [name, args] of [
      ["create_draft_invoice", { client: "Client of A-1", lines: [{ description: "Work", unitPrice: 10.005 }] }],
      ["create_draft_expense", { description: "Coffee", amount: 3.499 }],
    ] as const) {
      const { body } = await rpc("admin-token", "tools/call", { name, arguments: args });
      expect(body.error ?? body.result?.isError).toBeTruthy();
    }
    expect(await db.select().from(expenses)).toHaveLength(0);
    expect(
      await db.select().from(invoices).where(and(eq(invoices.companyId, companyA), eq(invoices.status, "draft"))),
    ).toHaveLength(1);
  });

  it("won't quote another company's client, or with a valid-until date before the quote", async () => {
    for (const args of [
      { client: "Client of B-1", lines: [{ description: "Work", unitPrice: 100 }] },
      {
        client: "Client of A-1",
        lines: [{ description: "Work", unitPrice: 100 }],
        issueDate: "2026-11-03",
        validUntil: "2026-11-01",
      },
    ]) {
      const { isError, text } = await callTool("admin-token", "create_draft_quote", args);
      expect(isError).toBe(true);
      expect(text).toContain("Nothing was created");
    }
    expect(await db.select().from(quotes)).toHaveLength(0);
  });

  it("won't invoice a client that's missing, ambiguous or another company's", async () => {
    await db.insert(clients).values({ companyId: companyA, name: "Client of A-2" });
    const before = (await db.select().from(invoices)).length;
    for (const [client, message] of [
      ["Nobody Ltd", "No client called"],
      ["Client of A", "More than one client matches"],
      ["Client of B-1", "No client called"],
    ] as const) {
      const { isError, text } = await callTool("admin-token", "create_draft_invoice", {
        client,
        lines: [{ description: "Work", unitPrice: 100 }],
      });
      expect(isError).toBe(true);
      expect(text).toContain("Nothing was created");
      expect(text).toContain(message);
    }
    expect(await db.select().from(invoices)).toHaveLength(before);
  });

  it("adds an expense to the review queue, waiting for someone to approve it", async () => {
    const { isError, json } = await callTool("admin-token", "create_draft_expense", {
      description: "Train to Leeds",
      amount: 42.5,
      category: "Travel",
    });
    expect(isError).toBe(false);
    expect(json.created).toMatchObject({ amount: "£42.50", category: "Travel" });

    const [expense] = await db.select().from(expenses).where(eq(expenses.companyId, companyA));
    expect(expense).toMatchObject({
      status: "pending",
      amountPence: 4250,
      paidByUserId: null,
      submittedByUserId: adminId,
      createdByUserId: adminId,
    });
    expect(json.openInAlfa).toBe(`http://localhost/expenses/${expense!.id}`);
  });

  it("makes nothing when the company's plan is read-only", async () => {
    await db.insert(companyBilling).values({ companyId: companyA, status: "canceled" });
    const { isError } = await callTool("admin-token", "create_draft_expense", {
      description: "Lunch",
      amount: 12,
    });
    expect(isError).toBe(true);
    expect(await db.select().from(expenses)).toHaveLength(0);
    // Reading still works.
    expect((await callTool("admin-token", "search_invoices")).isError).toBe(false);
  });
});
