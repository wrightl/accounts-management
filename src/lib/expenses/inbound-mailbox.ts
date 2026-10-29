import "server-only";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, companyMemberships, users } from "@/db/schema";
import { serverEnv } from "@/env";
import { isUniqueViolation } from "@/lib/db-errors";
import { inboundAliasError, normalizeInboundAlias } from "@/lib/expenses/inbound-alias";
import {
  defaultInboundAliasCandidates,
  formatExpenseInboundAddress,
  inboundSlugToken,
  isValidInboundSlug,
  parseInboundAlias,
  parseInboundMailbox,
  slugifyInbound,
  type InboundMailboxConfig,
  type ParsedInboundMailbox,
} from "@/lib/expenses/inbound-merge";

export type { InboundMailboxConfig, ParsedInboundMailbox };
export { slugifyInbound, isValidInboundSlug };

export type ResolvedInboundRecipient = {
  companyId: string;
  userId: string;
  /** Membership role in the addressed company. */
  role: string;
  address: string;
};

export function inboundMailboxConfig(): InboundMailboxConfig {
  const env = serverEnv();
  return {
    domain: env.EXPENSE_INBOUND_DOMAIN.trim().toLowerCase(),
    prefix: env.EXPENSE_INBOUND_PREFIX.trim().toLowerCase(),
  };
}

/** Build the legacy display address for a company/user pair using env config. */
export function expenseInboundAddress(
  companySlug: string,
  userSlug: string,
  config: InboundMailboxConfig = inboundMailboxConfig(),
): string {
  return formatExpenseInboundAddress(companySlug, userSlug, config);
}

/** Ensure a candidate slug is unique among companies; append -2, -3, … */
export async function uniquifyCompanySlug(
  base: string,
  excludeCompanyId?: string,
): Promise<string> {
  const db = getDb();
  const candidate = slugifyInbound(base, "company");
  for (let n = 1; n < 1000; n++) {
    const trySlug = n === 1 ? candidate : `${candidate.slice(0, 40)}-${n}`;
    const conditions = [eq(companies.slug, trySlug)];
    if (excludeCompanyId) {
      conditions.push(ne(companies.id, excludeCompanyId));
    }
    const [hit] = await db
      .select({ id: companies.id })
      .from(companies)
      .where(and(...conditions))
      .limit(1);
    if (!hit) return trySlug;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

/**
 * Resolve a To address to company + user: a short alias first, then the legacy
 * `{prefix}+{company}.{user}` form. `role` is the membership role in the
 * addressed company (not the role for whichever company is currently active).
 */
export async function resolveInboundRecipient(
  toHeader: string,
  config: InboundMailboxConfig = inboundMailboxConfig(),
): Promise<ResolvedInboundRecipient | null> {
  const db = getDb();

  const short = parseInboundAlias(toHeader, config);
  if (short) {
    const [row] = await db
      .select({
        companyId: companyMemberships.companyId,
        userId: companyMemberships.userId,
        role: companyMemberships.role,
      })
      .from(companyMemberships)
      .where(eq(companyMemberships.inboundAlias, short.alias))
      .limit(1);
    return row ? { ...row, address: short.address } : null;
  }

  const parsed = parseInboundMailbox(toHeader, config);
  if (!parsed) return null;

  const [row] = await db
    .select({
      companyId: companies.id,
      userId: users.id,
      role: companyMemberships.role,
    })
    .from(users)
    .innerJoin(companyMemberships, eq(companyMemberships.userId, users.id))
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(
      and(
        eq(companies.slug, parsed.companySlug),
        eq(users.expenseInboundSlug, parsed.userSlug),
        isNotNull(users.expenseInboundSlug),
      ),
    )
    .limit(1);
  return row ? { ...row, address: parsed.address } : null;
}

/** The member's short address alias for this company, if they have one. */
export async function getInboundAlias(
  userId: string,
  companyId: string,
): Promise<string | null> {
  const [row] = await getDb()
    .select({ alias: companyMemberships.inboundAlias })
    .from(companyMemberships)
    .where(
      and(eq(companyMemberships.userId, userId), eq(companyMemberships.companyId, companyId)),
    )
    .limit(1);
  return row?.alias ?? null;
}

/**
 * Give a membership its short address if it has none: the first free default
 * (`lee`, `lee.wright`, `lee-acme`, …), else one with a random tail.
 * Returns the alias, or null when there is no such membership.
 */
export async function ensureInboundAlias(
  userId: string,
  companyId: string,
): Promise<string | null> {
  const db = getDb();
  const [row] = await db
    .select({
      membershipId: companyMemberships.id,
      alias: companyMemberships.inboundAlias,
      name: users.name,
      email: users.email,
      companySlug: companies.slug,
    })
    .from(companyMemberships)
    .innerJoin(users, eq(users.id, companyMemberships.userId))
    .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
    .where(
      and(eq(companyMemberships.userId, userId), eq(companyMemberships.companyId, companyId)),
    )
    .limit(1);
  if (!row) return null;
  if (row.alias) return row.alias;

  const candidates = defaultInboundAliasCandidates(row.name, row.email, row.companySlug);
  const seed = candidates[0] ?? "member";
  for (let n = 0; n < 5; n++) {
    candidates.push(`${seed.slice(0, 20)}-${inboundSlugToken().slice(0, 6)}`);
  }

  for (const alias of candidates) {
    try {
      const [set] = await db
        .update(companyMemberships)
        .set({ inboundAlias: alias })
        .where(
          and(
            eq(companyMemberships.id, row.membershipId),
            isNull(companyMemberships.inboundAlias),
          ),
        )
        .returning({ alias: companyMemberships.inboundAlias });
      if (set?.alias) return set.alias;
      // Someone else gave it one in the meantime.
      const [now] = await db
        .select({ alias: companyMemberships.inboundAlias })
        .from(companyMemberships)
        .where(eq(companyMemberships.id, row.membershipId))
        .limit(1);
      return now?.alias ?? null;
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
  }
  throw new Error("Could not allocate a unique inbound address");
}

const ALIAS_TAKEN = "That address is taken. Pick another.";

export type SetInboundAliasResult =
  | { ok: true; alias: string; previous: string | null }
  | { ok: false; error: string };

/**
 * Rename a membership's short address. The old one stops working at once and
 * anyone may claim it. Uniqueness is enforced by the database index.
 */
export async function setInboundAlias(
  userId: string,
  companyId: string,
  raw: string,
): Promise<SetInboundAliasResult> {
  const alias = normalizeInboundAlias(raw);
  const invalid = inboundAliasError(alias);
  if (invalid) return { ok: false, error: invalid };

  const db = getDb();
  const [current] = await db
    .select({ id: companyMemberships.id, alias: companyMemberships.inboundAlias })
    .from(companyMemberships)
    .where(
      and(eq(companyMemberships.userId, userId), eq(companyMemberships.companyId, companyId)),
    )
    .limit(1);
  if (!current) return { ok: false, error: "You are not a member of this company." };
  if (current.alias === alias) return { ok: true, alias, previous: current.alias };

  const [taken] = await db
    .select({ id: companyMemberships.id })
    .from(companyMemberships)
    .where(
      and(eq(companyMemberships.inboundAlias, alias), ne(companyMemberships.id, current.id)),
    )
    .limit(1);
  if (taken) return { ok: false, error: ALIAS_TAKEN };

  try {
    await db
      .update(companyMemberships)
      .set({ inboundAlias: alias })
      .where(eq(companyMemberships.id, current.id));
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: ALIAS_TAKEN };
    throw err;
  }
  return { ok: true, alias, previous: current.alias };
}
