import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients } from "@/db/schema";

export async function listClients() {
  const db = getDb();
  return db.select().from(clients).orderBy(clients.name);
}

export async function getClient(id: string) {
  const db = getDb();
  const rows = await db.select().from(clients).where(eq(clients.id, id)).limit(1);
  return rows[0] ?? null;
}
