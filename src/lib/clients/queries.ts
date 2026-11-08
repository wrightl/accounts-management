import "server-only";
import { and, asc, count, eq, type SQL } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { type ListPaging, fetchPage } from "@/lib/list-paging";
import { sortExpr, sortText } from "@/lib/sql-paging";
import type { TableSort } from "@/lib/table-sort";

export async function listClients(companyId: string) {
  const db = getDb();
  return db
    .select()
    .from(clients)
    .where(eq(clients.companyId, companyId))
    .orderBy(clients.name);
}

export type ClientSortColumn = "name" | "company" | "email";

function clientListOrderBy({ sort, dir }: TableSort<ClientSortColumn>): SQL[] {
  const by = sortExpr(dir);
  const column = { name: clients.name, company: clients.companyName, email: clients.email }[sort];
  return [by(sortText(column)), by(sortText(clients.name)), asc(clients.id)];
}

/** One page of the clients list. */
export async function listClientPage(
  companyId: string,
  options: TableSort<ClientSortColumn> & ListPaging,
) {
  const db = getDb();
  const where = eq(clients.companyId, companyId);
  return fetchPage(
    options,
    async () => (await db.select({ n: count() }).from(clients).where(where))[0]?.n ?? 0,
    ({ limit, offset }) =>
      db
        .select()
        .from(clients)
        .where(where)
        .orderBy(...clientListOrderBy(options))
        .limit(limit)
        .offset(offset),
  );
}

export async function getClient(companyId: string, id: string) {
  const db = getDb();
  const rows = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.companyId, companyId)))
    .limit(1);
  return rows[0] ?? null;
}
