import "server-only";
import { getDb } from "@/db";
import { companySettings } from "@/db/schema";

export async function getOrCreateCompanySettings() {
  const db = getDb();
  const rows = await db.select().from(companySettings).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(companySettings).values({}).returning();
  return created;
}
