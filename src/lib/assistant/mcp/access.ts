import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  assistantConnections,
  assistantDraftRequests,
  auditLog,
  companies,
  companyMemberships,
} from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { findLocalUser } from "@/lib/users";
import { isTenantRole, type TenantRole } from "@/lib/roles";

/** Tool calls a company's assistants can make per day, across everyone. */
export const DAILY_TOOL_CALL_LIMIT = 500;

/** Audit action for one assistant tool call; also what the daily limit counts. */
export const ASSISTANT_TOOL_ACTION = "assistant.tool";

export type AssistantCompany = {
  id: string;
  name: string;
  role: TenantRole;
  isLtd: boolean;
  /** An admin has turned on AI assistant access for this company. */
  enabled: boolean;
  suspended: boolean;
};

export type AssistantPerson = {
  localUserId: string;
  /** The company the person last chose in the app; the default when a tool doesn't name one. */
  currentCompanyId: string | null;
  /** Every company the person holds a role in, with the role from that membership. */
  companies: AssistantCompany[];
};

/**
 * The person behind an assistant's token, and the companies they could read.
 * Roles come from each membership, never from `users.role`, so an accountant
 * with several clients gets the right role for each one.
 */
export async function loadAssistantPerson(clerkUserId: string): Promise<AssistantPerson | null> {
  const local = await findLocalUser(clerkUserId);
  if (!local) return null;
  const rows = await getDb()
    .select({
      id: companies.id,
      name: companies.name,
      entityType: companies.entityType,
      enabled: companies.aiAssistantEnabled,
      suspendedAt: companies.suspendedAt,
      role: companyMemberships.role,
    })
    .from(companyMemberships)
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(eq(companyMemberships.userId, local.id))
    .orderBy(companies.name);
  return {
    localUserId: local.id,
    currentCompanyId: local.companyId,
    companies: rows.flatMap((r) =>
      isTenantRole(r.role) && r.role !== "pending"
        ? [
            {
              id: r.id,
              name: r.name,
              role: r.role,
              isLtd: r.entityType === "limited_company",
              enabled: r.enabled,
              suspended: r.suspendedAt != null,
            },
          ]
        : [],
    ),
  };
}

/** Companies an assistant may read right now. */
export function readableCompanies(person: AssistantPerson): AssistantCompany[] {
  return person.companies.filter((c) => c.enabled && !c.suspended);
}

export type CompanyChoice = { ok: true; company: AssistantCompany } | { ok: false; message: string };

/**
 * The company a tool call is about: the one named (by id or name), else the
 * person's current company, else their only readable one.
 */
export function chooseCompany(person: AssistantPerson, named?: string): CompanyChoice {
  if (named?.trim()) {
    const wanted = named.trim().toLowerCase();
    const match = person.companies.find((c) => c.id === named.trim() || c.name.toLowerCase() === wanted);
    if (!match) {
      return { ok: false, message: `You don't have access to a company called "${named}". Use list_my_companies to see yours.` };
    }
    return usable(match);
  }
  const readable = readableCompanies(person);
  const current = person.companies.find((c) => c.id === person.currentCompanyId);
  if (current && (current.enabled || readable.length !== 1)) return usable(current);
  if (readable.length === 1) return { ok: true, company: readable[0]! };
  if (readable.length === 0) return { ok: false, message: noCompanyMessage(person) };
  return { ok: false, message: "You have more than one company. Say which one, or use list_my_companies to see them." };
}

function usable(company: AssistantCompany): CompanyChoice {
  if (company.suspended) {
    return { ok: false, message: `${company.name} is suspended, so its books can't be read. Contact Alfa support for help.` };
  }
  if (!company.enabled) {
    return {
      ok: false,
      message: `AI assistant access is turned off for ${company.name}. An admin can turn it on in Alfa under Settings.`,
    };
  }
  return { ok: true, company };
}

export function noCompanyMessage(person: AssistantPerson): string {
  return person.companies.length === 0
    ? "This Alfa login isn't part of a company yet. Finish setting up in Alfa first."
    : "AI assistant access isn't turned on for any of your companies. An admin can turn it on in Alfa under Settings.";
}

/**
 * Record that this person's assistant was used, and whether they've since
 * disconnected it. Returns false for a disconnected assistant, and whether
 * this is the first time it has been seen.
 */
export async function touchConnection(
  localUserId: string,
  oauthClientId: string,
): Promise<{ id: string; allowed: boolean; allowDrafts: boolean; isNew: boolean }> {
  const [row] = await getDb()
    .insert(assistantConnections)
    .values({ userId: localUserId, oauthClientId })
    .onConflictDoUpdate({
      target: [assistantConnections.userId, assistantConnections.oauthClientId],
      set: { lastUsedAt: sql`now()` },
    })
    .returning({
      id: assistantConnections.id,
      revokedAt: assistantConnections.revokedAt,
      allowDrafts: assistantConnections.allowDrafts,
      // An insert sets both to the same now(); a later call moves only last_used_at.
      // Compared in SQL, at full precision, so calls a millisecond apart can't both look new.
      isNew: sql<boolean>`${assistantConnections.firstUsedAt} = ${assistantConnections.lastUsedAt}`,
    });
  return {
    id: row!.id,
    allowed: row!.revokedAt == null,
    allowDrafts: row!.allowDrafts,
    isNew: row!.isNew === true,
  };
}

/**
 * Tell the person a new assistant has started reading Alfa as them. Any app
 * they approve at Clerk's sign-in gets in, and it names itself, so this is
 * how one they didn't mean to connect gets noticed. Best effort: the call
 * it arrived with goes ahead either way.
 */
export async function notifyAssistantConnected(params: {
  person: AssistantPerson;
  connectionId: string;
  oauthClientId: string;
  clientName: string | null;
}): Promise<void> {
  const { person } = params;
  // Notices belong to a company; a login with none yet can't read anything anyway.
  const companyId = person.currentCompanyId ?? person.companies[0]?.id;
  if (!companyId) return;
  const calls = params.clientName ? `It calls itself "${params.clientName}"` : "It didn't give a name";
  try {
    const { notifyUsers } = await import("@/lib/notifications");
    await notifyUsers([person.localUserId], {
      companyId,
      type: "assistant.connected",
      title: "A new AI assistant connected to Alfa",
      body: `${calls} (OAuth client ${params.oauthClientId}). It can read what you can see in companies where assistant access is on. If you didn't connect it, disconnect it in Settings, AI assistant.`,
      href: "/settings/ai-assistant",
      entityType: "assistant_connection",
      entityId: params.connectionId,
      awaitEmail: true,
    });
  } catch (error) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "assistant.connected_notify_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
}

/** Names assistants send in `clientInfo`, shown as people know them. */
const KNOWN_CLIENTS: Record<string, string> = {
  "claude-ai": "Claude",
  "claude-desktop": "Claude Desktop",
  "claude-code": "Claude Code",
  "openai-mcp": "ChatGPT",
  chatgpt: "ChatGPT",
};

/** A readable name from the `clientInfo` an assistant sends when it starts, or null. */
export function assistantDisplayName(clientInfo: unknown): string | null {
  if (!clientInfo || typeof clientInfo !== "object") return null;
  const { name, title } = clientInfo as { name?: unknown; title?: unknown };
  const known = typeof name === "string" ? KNOWN_CLIENTS[name.trim().toLowerCase()] : undefined;
  const raw = known ?? (typeof title === "string" && title.trim() ? title : name);
  return typeof raw === "string" && raw.trim() ? raw.trim().slice(0, 80) : null;
}

/** Remember what the assistant calls itself, for the list in Settings. */
export async function nameConnection(
  localUserId: string,
  connectionId: string,
  clientName: string,
): Promise<void> {
  await getDb()
    .update(assistantConnections)
    .set({ clientName })
    .where(and(eq(assistantConnections.id, connectionId), eq(assistantConnections.userId, localUserId)));
}

/** Assistant tool calls made for a company today (London calendar day). */
function callsToday(companyId: string) {
  return and(
    eq(auditLog.companyId, companyId),
    eq(auditLog.action, ASSISTANT_TOOL_ACTION),
    sql`(${auditLog.createdAt} at time zone 'Europe/London')::date = ${todayIsoDate()}`,
  );
}

/**
 * Claim one of the company's tool calls for today and audit it, or return
 * false when the day's limit is used up. The count and the audit row happen
 * under a per-company lock, so calls arriving together can't overshoot.
 */
export async function claimToolCall(call: {
  companyId: string;
  localUserId: string;
  tool: string;
  oauthClientId: string;
}): Promise<boolean> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`assistant:${call.companyId}`}))`);
    const [row] = await tx
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(auditLog)
      .where(callsToday(call.companyId));
    if ((row?.n ?? 0) >= DAILY_TOOL_CALL_LIMIT) return false;
    await tx.insert(auditLog).values({
      companyId: call.companyId,
      actorUserId: call.localUserId,
      action: ASSISTANT_TOOL_ACTION,
      entityType: "assistant_tool",
      meta: { tool: call.tool, oauthClientId: call.oauthClientId },
    });
    return true;
  });
}

/** How long a repeated draft call returns the draft it already made. */
export const DRAFT_RETRY_WINDOW_MINUTES = 10;

export type DraftClaim =
  | { kind: "claimed"; claimId: string }
  | { kind: "done"; entityId: string }
  | { kind: "in_progress" };

/**
 * Claim the right to create one draft. Identical calls share a request key,
 * and the unique index lets exactly one of them claim it, even when they
 * arrive together; the rest get the draft it made. A claim older than the
 * retry window can be taken again, so the same draft can be made on purpose
 * later.
 */
export async function claimDraftRequest(request: {
  companyId: string;
  localUserId: string;
  requestKey: string;
}): Promise<DraftClaim> {
  const db = getDb();
  const [claimed] = await db
    .insert(assistantDraftRequests)
    .values({ companyId: request.companyId, userId: request.localUserId, requestKey: request.requestKey })
    .onConflictDoUpdate({
      target: [
        assistantDraftRequests.companyId,
        assistantDraftRequests.userId,
        assistantDraftRequests.requestKey,
      ],
      set: { createdAt: sql`now()`, entityId: null },
      setWhere: sql`${assistantDraftRequests.createdAt} < now() - make_interval(mins => ${DRAFT_RETRY_WINDOW_MINUTES})`,
    })
    .returning({ id: assistantDraftRequests.id });
  if (claimed) return { kind: "claimed", claimId: claimed.id };

  const [existing] = await db
    .select({ entityId: assistantDraftRequests.entityId })
    .from(assistantDraftRequests)
    .where(
      and(
        eq(assistantDraftRequests.companyId, request.companyId),
        eq(assistantDraftRequests.userId, request.localUserId),
        eq(assistantDraftRequests.requestKey, request.requestKey),
      ),
    )
    .limit(1);
  return existing?.entityId ? { kind: "done", entityId: existing.entityId } : { kind: "in_progress" };
}

/** Record what a claimed draft request created, or release it if nothing was. */
export async function finishDraftRequest(
  companyId: string,
  claimId: string,
  entityId: string | null,
): Promise<void> {
  const where = and(eq(assistantDraftRequests.id, claimId), eq(assistantDraftRequests.companyId, companyId));
  if (entityId) {
    await getDb().update(assistantDraftRequests).set({ entityId }).where(where);
  } else {
    await getDb().delete(assistantDraftRequests).where(where);
  }
}
