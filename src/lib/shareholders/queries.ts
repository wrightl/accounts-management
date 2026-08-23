import "server-only";
import { asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { companySettings, shareholders, users } from "@/db/schema";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";

export async function listShareholders(options?: { includeArchived?: boolean }) {
  const db = getDb();
  const settings = await getOrCreateCompanySettings();
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
    .where(options?.includeArchived ? undefined : isNull(shareholders.archivedAt))
    .orderBy(asc(shareholders.name));

  const activeSum = rows
    .filter((r) => !r.archivedAt)
    .reduce((s, r) => s + r.shareCount, 0);

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

export async function getShareholder(id: string) {
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
    .where(eq(shareholders.id, id))
    .limit(1);
  return row ?? null;
}

export async function getActiveShareholdersForSplit() {
  const db = getDb();
  const settings = await getOrCreateCompanySettings();
  const active = await db
    .select({
      id: shareholders.id,
      name: shareholders.name,
      shareCount: shareholders.shareCount,
    })
    .from(shareholders)
    .where(isNull(shareholders.archivedAt))
    .orderBy(asc(shareholders.name));

  const activeSum = active.reduce((s, r) => s + r.shareCount, 0);
  const totalShares = settings.totalShares;
  const balanced =
    totalShares != null && totalShares > 0 && activeSum === totalShares && active.length > 0;

  return {
    totalShares,
    activeSum,
    balanced,
    shareholders: active,
  };
}

/** Ensure active share counts match company totalShares when total is set. */
export async function assertRegisterBalanced(db = getDb()) {
  const [settings] = await db.select().from(companySettings).limit(1);
  if (!settings?.totalShares) {
    return { ok: false as const, error: "Set total shares on the Shareholders page first." };
  }
  const [sumRow] = await db
    .select({
      sum: sql<number>`coalesce(sum(${shareholders.shareCount}), 0)`.mapWith(Number),
    })
    .from(shareholders)
    .where(isNull(shareholders.archivedAt));
  const sum = sumRow?.sum ?? 0;
  if (sum !== settings.totalShares) {
    return {
      ok: false as const,
      error: `Active share counts (${sum}) must equal total shares (${settings.totalShares}).`,
    };
  }
  if (sum === 0) {
    return { ok: false as const, error: "Add at least one active shareholder." };
  }
  return { ok: true as const, totalShares: settings.totalShares };
}
