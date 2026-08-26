import "server-only";
import { and, eq, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, users } from "@/db/schema";
import { serverEnv } from "@/env";
import {
  formatExpenseInboundAddress,
  isValidInboundSlug,
  parseInboundMailbox,
  slugifyInbound,
  type InboundMailboxConfig,
  type ParsedInboundMailbox,
} from "@/lib/expenses/inbound-merge";

export type { InboundMailboxConfig, ParsedInboundMailbox };
export { slugifyInbound, isValidInboundSlug };

export type ResolvedInboundRecipient = {
  companyId: string;
  companySlug: string;
  userId: string;
  userSlug: string;
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

/** Build the display address for a company/user pair using env config. */
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

/** Ensure a user inbound slug is unique within a company. */
export async function uniquifyUserInboundSlug(
  companyId: string,
  base: string,
  excludeUserId?: string,
): Promise<string> {
  const db = getDb();
  const candidate = slugifyInbound(base, "user");
  for (let n = 1; n < 1000; n++) {
    const trySlug = n === 1 ? candidate : `${candidate.slice(0, 40)}-${n}`;
    const conditions = [
      eq(users.companyId, companyId),
      eq(users.expenseInboundSlug, trySlug),
    ];
    if (excludeUserId) {
      conditions.push(ne(users.id, excludeUserId));
    }
    const [hit] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(...conditions))
      .limit(1);
    if (!hit) return trySlug;
  }
  return `${candidate}-${Date.now().toString(36)}`;
}

/** Resolve a To address to company + user via slugs. */
export async function resolveInboundRecipient(
  toHeader: string,
  config: InboundMailboxConfig = inboundMailboxConfig(),
): Promise<ResolvedInboundRecipient | null> {
  const parsed = parseInboundMailbox(toHeader, config);
  if (!parsed) return null;

  const db = getDb();
  const [company] = await db
    .select({ id: companies.id, slug: companies.slug })
    .from(companies)
    .where(eq(companies.slug, parsed.companySlug))
    .limit(1);
  if (!company) return null;

  const [user] = await db
    .select({
      id: users.id,
      role: users.role,
      expenseInboundSlug: users.expenseInboundSlug,
    })
    .from(users)
    .where(
      and(
        eq(users.companyId, company.id),
        eq(users.expenseInboundSlug, parsed.userSlug),
        isNotNull(users.expenseInboundSlug),
      ),
    )
    .limit(1);
  if (!user || !user.expenseInboundSlug) return null;

  return {
    companyId: company.id,
    companySlug: company.slug,
    userId: user.id,
    userSlug: user.expenseInboundSlug,
    role: user.role,
    address: parsed.address,
  };
}

/** Pick the first recipient that matches the inbound plus-address pattern. */
export function pickInboundToAddress(
  recipients: string[],
  config: InboundMailboxConfig = inboundMailboxConfig(),
): string | null {
  for (const recipient of recipients) {
    const parsed = parseInboundMailbox(recipient, config);
    if (parsed) return parsed.address;
  }
  return null;
}

/** Derive a user slug seed from name or email local-part. */
export function userInboundSlugSeed(
  name: string | null | undefined,
  email: string,
): string {
  if (name?.trim()) return slugifyInbound(name, "user");
  const local = email.split("@")[0] ?? "user";
  return slugifyInbound(local, "user");
}
