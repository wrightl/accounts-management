import "server-only";
import { and, eq, gt, inArray, isNotNull, isNull, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, companyMemberships, releasedInboundAliases, users } from "@/db/schema";
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

  const coolingDown = await coolingDownAliases(candidates);
  for (const alias of candidates.filter((c) => !coolingDown.has(c))) {
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

/** How long a renamed-away alias stays out of reach of everyone else. */
export const RELEASED_ALIAS_COOLDOWN_DAYS = 90;

function cooldownCutoff(): Date {
  return new Date(Date.now() - RELEASED_ALIAS_COOLDOWN_DAYS * 24 * 60 * 60 * 1000);
}

/** Of `aliases`, those released recently enough that only their old owner may take them. */
async function coolingDownAliases(aliases: string[]): Promise<Set<string>> {
  if (aliases.length === 0) return new Set();
  const rows = await getDb()
    .select({ alias: releasedInboundAliases.alias })
    .from(releasedInboundAliases)
    .where(
      and(
        inArray(releasedInboundAliases.alias, aliases),
        gt(releasedInboundAliases.releasedAt, cooldownCutoff()),
      ),
    );
  return new Set(rows.map((r) => r.alias));
}

const ALIAS_TAKEN = "That address is taken. Pick another.";

export type SetInboundAliasResult =
  | { ok: true; alias: string; previous: string | null }
  | { ok: false; error: string };

/**
 * Rename a founder's short address. The old one stops working at once, and for
 * {@link RELEASED_ALIAS_COOLDOWN_DAYS} days only they can take it back, so mail
 * still sent to it never reaches anyone else. Uniqueness among live aliases is
 * enforced by the database index.
 */
export async function setInboundAlias(
  userId: string,
  companyId: string,
  raw: string,
): Promise<SetInboundAliasResult> {
  const alias = normalizeInboundAlias(raw);
  const invalid = inboundAliasError(alias);
  if (invalid) return { ok: false, error: invalid };

  try {
    return await getDb().transaction(async (tx) => {
      // One rename at a time, so an alias can't be freed between the checks and the claim.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('inbound_alias'))`);

      const [current] = await tx
        .select({
          id: companyMemberships.id,
          alias: companyMemberships.inboundAlias,
          role: companyMemberships.role,
        })
        .from(companyMemberships)
        .where(
          and(
            eq(companyMemberships.userId, userId),
            eq(companyMemberships.companyId, companyId),
          ),
        )
        .limit(1);
      if (!current) return { ok: false, error: "You are not a member of this company." };
      if (current.role !== "admin" && current.role !== "user") {
        return { ok: false, error: "Only founders have an address for emailing receipts." };
      }
      if (current.alias === alias) return { ok: true, alias, previous: current.alias };

      const [taken] = await tx
        .select({ id: companyMemberships.id })
        .from(companyMemberships)
        .where(eq(companyMemberships.inboundAlias, alias))
        .limit(1);
      const [released] = await tx
        .select({ alias: releasedInboundAliases.alias })
        .from(releasedInboundAliases)
        .where(
          and(
            eq(releasedInboundAliases.alias, alias),
            gt(releasedInboundAliases.releasedAt, cooldownCutoff()),
            or(
              isNull(releasedInboundAliases.membershipId),
              ne(releasedInboundAliases.membershipId, current.id),
            ),
          ),
        )
        .limit(1);
      if (taken || released) return { ok: false, error: ALIAS_TAKEN };

      await tx
        .update(companyMemberships)
        .set({ inboundAlias: alias })
        .where(eq(companyMemberships.id, current.id));
      await tx.delete(releasedInboundAliases).where(eq(releasedInboundAliases.alias, alias));
      if (current.alias) {
        await tx
          .insert(releasedInboundAliases)
          .values({ alias: current.alias, membershipId: current.id, releasedAt: new Date() })
          .onConflictDoUpdate({
            target: releasedInboundAliases.alias,
            set: { membershipId: current.id, releasedAt: new Date() },
          });
      }
      return { ok: true, alias, previous: current.alias };
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: ALIAS_TAKEN };
    throw err;
  }
}
