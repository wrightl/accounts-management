import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { companies, companyMemberships, users } from "@/db/schema";
import {
  defaultInboundAliasCandidates,
  inboundSlugToken,
} from "@/lib/expenses/inbound-merge";
import type { DataMigration } from "./types";

/**
 * Give every founder membership a short inbound address (`lee@…`) in place of
 * `{prefix}+{company}.{name}-{token}@…`. Their old address keeps working.
 */
export const migration: DataMigration = {
  id: "0003_membership_inbound_aliases",
  async up(ctx) {
    const taken = await ctx.db
      .select({ alias: companyMemberships.inboundAlias })
      .from(companyMemberships)
      .where(isNotNull(companyMemberships.inboundAlias));
    const used = new Set(taken.map((r) => r.alias!));

    const rows = await ctx.db
      .select({
        id: companyMemberships.id,
        name: users.name,
        email: users.email,
        companySlug: companies.slug,
      })
      .from(companyMemberships)
      .innerJoin(users, eq(users.id, companyMemberships.userId))
      .innerJoin(companies, eq(companies.id, companyMemberships.companyId))
      .where(
        and(
          isNull(companyMemberships.inboundAlias),
          inArray(companyMemberships.role, ["admin", "user"]),
        ),
      )
      .orderBy(companyMemberships.createdAt);

    for (const row of rows) {
      const candidates = defaultInboundAliasCandidates(row.name, row.email, row.companySlug);
      let alias = candidates.find((c) => !used.has(c));
      while (!alias || used.has(alias)) {
        alias = `${(candidates[0] ?? "member").slice(0, 20)}-${inboundSlugToken().slice(0, 6)}`;
      }
      used.add(alias);
      await ctx.db
        .update(companyMemberships)
        .set({ inboundAlias: alias })
        .where(eq(companyMemberships.id, row.id));
    }
  },
};
