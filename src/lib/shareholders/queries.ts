import "server-only";
import { and, asc, count, eq, isNotNull, isNull, sql, sum } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, shareholders, users } from "@/db/schema";
import { getCompanySettings } from "@/lib/settings/queries";
import { type ListPaging, fetchPage } from "@/lib/list-paging";

export async function listShareholders(
  companyId: string,
  options?: { includeArchived?: boolean },
) {
  const db = getDb();
  const settings = await getCompanySettings(companyId);
  const totalShares = settings.totalShares;

  const rows = await db
    .select({
      id: shareholders.id,
      name: shareholders.name,
      shareCount: shareholders.shareCount,
      userId: shareholders.userId,
      archivedAt: shareholders.archivedAt,
      createdAt: shareholders.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(shareholders)
    .leftJoin(users, eq(shareholders.userId, users.id))
    .where(
      and(
        eq(shareholders.companyId, companyId),
        options?.includeArchived ? undefined : isNull(shareholders.archivedAt),
      ),
    )
    .orderBy(asc(shareholders.name));

  const activeSum = rows
    .filter((r) => !r.archivedAt)
    .reduce((s, r) => s + Number(r.shareCount), 0);

  return {
    totalShares,
    activeShareSum: activeSum,
    registerBalanced:
      totalShares != null && totalShares > 0 && activeSum === totalShares,
    shareholders: rows.map((r) => ({
      ...r,
      percent:
        totalShares && totalShares > 0 && !r.archivedAt
          ? (r.shareCount / totalShares) * 100
          : null,
      linkedUserLabel: r.userName || r.userEmail || null,
    })),
  };
}

/** Total shares against what active holders hold, without loading the register. */
export async function getShareRegisterSummary(companyId: string) {
  const [settings, [row]] = await Promise.all([
    getCompanySettings(companyId),
    getDb()
      .select({ activeShareSum: sum(shareholders.shareCount).mapWith(Number) })
      .from(shareholders)
      .where(and(eq(shareholders.companyId, companyId), isNull(shareholders.archivedAt))),
  ]);
  const totalShares = settings.totalShares;
  const activeShareSum = row?.activeShareSum ?? 0;
  return {
    totalShares,
    activeShareSum,
    registerBalanced: totalShares != null && totalShares > 0 && activeShareSum === totalShares,
  };
}

/** One page of active or archived shareholders, by name. */
export async function listShareholderPage(
  companyId: string,
  options: { archived: boolean; totalShares: number | null } & ListPaging,
) {
  const db = getDb();
  const where = and(
    eq(shareholders.companyId, companyId),
    options.archived ? isNotNull(shareholders.archivedAt) : isNull(shareholders.archivedAt),
  );
  const page = await fetchPage(
    options,
    async () => (await db.select({ n: count() }).from(shareholders).where(where))[0]?.n ?? 0,
    ({ limit, offset }) =>
      db
        .select({
          id: shareholders.id,
          name: shareholders.name,
          shareCount: shareholders.shareCount,
          archivedAt: shareholders.archivedAt,
          userName: users.name,
          userEmail: users.email,
        })
        .from(shareholders)
        .leftJoin(users, eq(shareholders.userId, users.id))
        .where(where)
        .orderBy(asc(shareholders.name), asc(shareholders.id))
        .limit(limit)
        .offset(offset),
  );
  const { totalShares } = options;
  return {
    ...page,
    rows: page.rows.map((r) => ({
      ...r,
      percent:
        totalShares && totalShares > 0 && !r.archivedAt
          ? (r.shareCount / totalShares) * 100
          : null,
      linkedUserLabel: r.userName || r.userEmail || null,
    })),
  };
}

export async function getShareholder(companyId: string, id: string) {
  const db = getDb();
  const [row] = await db
    .select({
      id: shareholders.id,
      name: shareholders.name,
      shareCount: shareholders.shareCount,
      userId: shareholders.userId,
      archivedAt: shareholders.archivedAt,
      createdAt: shareholders.createdAt,
      userName: users.name,
      userEmail: users.email,
    })
    .from(shareholders)
    .leftJoin(users, eq(shareholders.userId, users.id))
    .where(and(eq(shareholders.id, id), eq(shareholders.companyId, companyId)))
    .limit(1);
  return row ?? null;
}

export async function getActiveShareholdersForSplit(companyId: string) {
  const db = getDb();
  const settings = await getCompanySettings(companyId);
  const active = await db
    .select({
      id: shareholders.id,
      name: shareholders.name,
      shareCount: shareholders.shareCount,
    })
    .from(shareholders)
    .where(
      and(eq(shareholders.companyId, companyId), isNull(shareholders.archivedAt)),
    )
    .orderBy(asc(shareholders.name));

  const activeSum = active.reduce((s, r) => s + Number(r.shareCount), 0);
  const lockedTotal = settings.totalShares;
  const totalShares = lockedTotal ?? (activeSum > 0 ? activeSum : null);
  const balanced =
    totalShares != null &&
    totalShares > 0 &&
    activeSum === totalShares &&
    active.length > 0;

  return {
    totalShares,
    activeSum,
    balanced,
    shareholders: active.map((r) => ({
      ...r,
      shareCount: Number(r.shareCount),
    })),
  };
}

/** Ensure active share counts match company totalShares when total is set. */
export async function assertRegisterBalanced(
  companyId: string,
  db = getDb(),
) {
  const [settings] = await db
    .select()
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const [sumRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${shareholders.shareCount}), 0)`.mapWith(Number),
    })
    .from(shareholders)
    .where(
      and(eq(shareholders.companyId, companyId), isNull(shareholders.archivedAt)),
    );
  const sum = sumRow?.sum ?? 0;
  if (sum === 0) {
    return { ok: false as const, error: "Add at least one active shareholder." };
  }
  if (settings?.totalShares == null) {
    return { ok: true as const, totalShares: sum };
  }
  if (sum !== settings.totalShares) {
    return {
      ok: false as const,
      error: `Active share counts (${sum}) must equal total shares (${settings.totalShares}).`,
    };
  }
  return { ok: true as const, totalShares: settings.totalShares };
}
