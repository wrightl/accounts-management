import { companies, dataOnboarding } from "@/db/schema";
import type { DataMigration } from "./types";

/**
 * Companies that already use Alfa have loaded their history (or chosen not
 * to), so hide the checklist for them. They can reopen it from Settings.
 */
export const migration: DataMigration = {
  id: "0004_data_onboarding_existing",
  async up(ctx) {
    const rows = await ctx.db.select({ id: companies.id }).from(companies);
    if (rows.length === 0) return;
    await ctx.db
      .insert(dataOnboarding)
      .values(rows.map((r) => ({ companyId: r.id, status: "dismissed" as const })))
      .onConflictDoNothing();
  },
};
