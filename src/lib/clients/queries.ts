import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";

export async function listClients(companyId: string) {
  const db = getDb();
  return db
    .select()
    .from(clients)
    .where(eq(clients.companyId, companyId))
    .orderBy(clients.name);
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
