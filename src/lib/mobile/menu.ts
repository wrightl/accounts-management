import { NAV_GROUPS, optionalNavItems } from "@/components/dashboard/nav";
import { isFeatureEnabled, type MenuFeature } from "@/lib/menu/features";
import { can, type Role } from "@/lib/roles";

/**
 * Optional menu items this person shows on the web, after role and entity
 * type. The mobile app shows only these, so hiding a page in Settings → Your
 * menu hides it on the phone too.
 */
export function visibleMenuFeatures(
  role: Role | null | undefined,
  entityType: string | null | undefined,
  enabled: readonly MenuFeature[] | null,
): MenuFeature[] {
  return optionalNavItems(NAV_GROUPS, {
    permissionCheck: (permission) => can(role, permission),
    entityType,
  })
    .map((item) => item.feature)
    .filter((feature) => isFeatureEnabled(feature, enabled));
}
