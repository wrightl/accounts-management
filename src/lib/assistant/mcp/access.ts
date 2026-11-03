import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { assistantConnections, auditLog, companies, companyMemberships } from "@/db/schema";
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
 * disconnected it. Returns false for a disconnected assistant.
 */
export async function touchConnection(
  localUserId: string,
  oauthClientId: string,
): Promise<{ id: string; allowed: boolean }> {
  const [row] = await getDb()
    .insert(assistantConnections)
    .values({ userId: localUserId, oauthClientId })
    .onConflictDoUpdate({
      target: [assistantConnections.userId, assistantConnections.oauthClientId],
      set: { lastUsedAt: sql`now()` },
    })
    .returning({ id: assistantConnections.id, revokedAt: assistantConnections.revokedAt });
  return { id: row!.id, allowed: row!.revokedAt == null };
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
export async function nameConnection(connectionId: string, clientName: string): Promise<void> {
  await getDb()
    .update(assistantConnections)
    .set({ clientName })
    .where(eq(assistantConnections.id, connectionId));
}

/** Assistant tool calls made for a company today (London calendar day). */
export async function toolCallsToday(companyId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)`.mapWith(Number) })
    .from(auditLog)
    .where(
      and(
        eq(auditLog.companyId, companyId),
        eq(auditLog.action, ASSISTANT_TOOL_ACTION),
        sql`(${auditLog.createdAt} at time zone 'Europe/London')::date = ${todayIsoDate()}`,
      ),
    );
  return row?.n ?? 0;
}
