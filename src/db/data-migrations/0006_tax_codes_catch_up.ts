import { applyTaxCodeBackfill } from "@/lib/tax-code-backfill";
import type { DataMigration } from "./types";

/**
 * Code rows saved between the tax code columns going in (0005) and every
 * screen and import storing a code (roadmap item 17, PR 3). The backfill skips
 * rows that already have a code, so this only touches the gap. Once it has
 * run, every row has a code and the column can be made required.
 */
export const migration: DataMigration = {
  id: "0006_tax_codes_catch_up",
  async up(ctx) {
    await applyTaxCodeBackfill(ctx.db);
  },
};
