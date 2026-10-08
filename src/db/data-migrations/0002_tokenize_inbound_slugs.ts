import { isNotNull, eq } from "drizzle-orm";
import { users } from "@/db/schema";
import { tokenizedInboundSlug } from "@/lib/expenses/inbound-merge";
import type { DataMigration } from "./types";

/**
 * Inbound expense mailboxes were `{company}.{name}` — guessable, and any
 * sender is accepted. Rotate every existing slug to `{name}-{random token}`.
 * Old addresses stop working; users see the new one on the Expenses page.
 */
export const migration: DataMigration = {
  id: "0002_tokenize_inbound_slugs",
  async up(ctx) {
    const rows = await ctx.db
      .select({ id: users.id, slug: users.expenseInboundSlug })
      .from(users)
      .where(isNotNull(users.expenseInboundSlug));

    const used = new Set<string>();
    for (const row of rows) {
      let next = tokenizedInboundSlug(row.slug ?? "user");
      while (used.has(next)) next = tokenizedInboundSlug(row.slug ?? "user");
      used.add(next);
      await ctx.db
        .update(users)
        .set({ expenseInboundSlug: next })
        .where(eq(users.id, row.id));
    }
  },
};
