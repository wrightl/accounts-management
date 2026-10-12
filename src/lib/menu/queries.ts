import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companyMemberships } from "@/db/schema";
import { parseEnabledFeatures, type MenuFeature } from "./features";

export interface MenuState {
  /** Enabled optional menu items; null shows everything. */
  enabled: MenuFeature[] | null;
  /** Suggestion ids this person dismissed. */
  dismissed: string[];
}

function membershipWhere(userId: string, companyId: string) {
  return and(
    eq(companyMemberships.userId, userId),
    eq(companyMemberships.companyId, companyId),
  );
}

export async function getMenuState(
  userId: string,
  companyId: string,
): Promise<MenuState> {
  const db = getDb();
  const [row] = await db
    .select({
      menuFeatures: companyMemberships.menuFeatures,
      dismissed: companyMemberships.menuSuggestionsDismissed,
    })
    .from(companyMemberships)
    .where(membershipWhere(userId, companyId))
    .limit(1);
  return {
    enabled: parseEnabledFeatures(row?.menuFeatures ?? null),
    dismissed: row?.dismissed ?? [],
  };
}

/** This person's enabled optional menu items for a company (null = show all). */
export async function getMenuFeatures(
  userId: string,
  companyId: string,
): Promise<MenuFeature[] | null> {
  return (await getMenuState(userId, companyId)).enabled;
}

export async function setMenuFeatures(
  userId: string,
  companyId: string,
  features: readonly MenuFeature[],
): Promise<void> {
  await getDb()
    .update(companyMemberships)
    .set({ menuFeatures: [...features] })
    .where(membershipWhere(userId, companyId));
}

export async function setDismissedMenuSuggestions(
  userId: string,
  companyId: string,
  dismissed: readonly string[],
): Promise<void> {
  await getDb()
    .update(companyMemberships)
    .set({ menuSuggestionsDismissed: [...dismissed] })
    .where(membershipWhere(userId, companyId));
}
