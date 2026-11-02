import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { accountantQueries, accountantQueryMessages, users } from "@/db/schema";
import { can, type Role } from "@/lib/roles";
import type { QueryRecordKind, QueryStatus, RecordQuery } from "./status";

export async function listQueries(companyId: string, status?: QueryStatus) {
  const rows = await getDb()
    .select({
      id: accountantQueries.id,
      subject: accountantQueries.subject,
      status: accountantQueries.status,
      recordLabel: accountantQueries.recordLabel,
      updatedAt: accountantQueries.updatedAt,
      raisedByName: users.name,
      raisedByEmail: users.email,
    })
    .from(accountantQueries)
    .leftJoin(users, eq(accountantQueries.raisedByUserId, users.id))
    .where(
      and(
        eq(accountantQueries.companyId, companyId),
        status ? eq(accountantQueries.status, status) : undefined,
      ),
    )
    .orderBy(desc(accountantQueries.updatedAt));
  return rows.map((r) => ({ ...r, status: r.status as QueryStatus }));
}

export async function listQueriesForRecord(
  companyId: string,
  kind: QueryRecordKind,
  recordId: string,
) {
  const rows = await getDb()
    .select({
      id: accountantQueries.id,
      subject: accountantQueries.subject,
      status: accountantQueries.status,
      updatedAt: accountantQueries.updatedAt,
    })
    .from(accountantQueries)
    .where(
      and(
        eq(accountantQueries.companyId, companyId),
        eq(accountantQueries.recordKind, kind),
        eq(accountantQueries.recordId, recordId),
      ),
    )
    .orderBy(desc(accountantQueries.updatedAt));
  return rows.map((r) => ({ ...r, status: r.status as QueryStatus }));
}

/** Queries on a page of records, by record id, in one lookup. */
export async function listQueriesForRecords(
  companyId: string,
  kind: QueryRecordKind,
  recordIds: readonly string[],
): Promise<Map<string, RecordQuery[]>> {
  const byRecord = new Map<string, RecordQuery[]>();
  if (recordIds.length === 0) return byRecord;
  const rows = await getDb()
    .select({
      id: accountantQueries.id,
      subject: accountantQueries.subject,
      status: accountantQueries.status,
      recordId: accountantQueries.recordId,
    })
    .from(accountantQueries)
    .where(
      and(
        eq(accountantQueries.companyId, companyId),
        eq(accountantQueries.recordKind, kind),
        inArray(accountantQueries.recordId, [...recordIds]),
      ),
    )
    .orderBy(desc(accountantQueries.updatedAt));
  for (const { recordId, ...query } of rows) {
    if (!recordId) continue;
    const list = byRecord.get(recordId) ?? [];
    list.push({ ...query, status: query.status as QueryStatus });
    byRecord.set(recordId, list);
  }
  return byRecord;
}

/** The same, empty for anyone who can't read queries. */
export async function recordQueriesFor(
  role: Role,
  companyId: string,
  kind: QueryRecordKind,
  recordIds: readonly string[],
): Promise<Map<string, RecordQuery[]>> {
  if (!can(role, "queries:read")) return new Map();
  return listQueriesForRecords(companyId, kind, recordIds);
}

export async function getQueryDetail(companyId: string, id: string) {
  const db = getDb();
  const [query] = await db
    .select()
    .from(accountantQueries)
    .where(and(eq(accountantQueries.id, id), eq(accountantQueries.companyId, companyId)))
    .limit(1);
  if (!query) return null;

  const messages = await db
    .select({
      id: accountantQueryMessages.id,
      body: accountantQueryMessages.body,
      createdAt: accountantQueryMessages.createdAt,
      authorName: users.name,
      authorEmail: users.email,
    })
    .from(accountantQueryMessages)
    .leftJoin(users, eq(accountantQueryMessages.authorUserId, users.id))
    .where(
      and(
        eq(accountantQueryMessages.companyId, companyId),
        eq(accountantQueryMessages.queryId, id),
      ),
    )
    .orderBy(asc(accountantQueryMessages.createdAt));

  return { query: { ...query, status: query.status as QueryStatus }, messages };
}
