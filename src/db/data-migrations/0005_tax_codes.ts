import { applyTaxCodeBackfill } from "@/lib/tax-code-backfill";
import type { DataMigration } from "./types";

/**
 * Give every existing line, expense and saved line list a tax code, and each
 * VAT-registered company a default code (roadmap item 17). Only the new
 * columns are written; rates and amounts are unchanged. Run
 * `npm run tax-codes:dry-run` first to see what it will do.
 */
export const migration: DataMigration = {
  id: "0005_tax_codes",
  async up(ctx) {
    await applyTaxCodeBackfill(ctx.db);
  },
};
