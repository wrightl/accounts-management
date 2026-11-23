import { guardTenantPage } from "@/lib/auth";
import { can } from "@/lib/roles";
import { ensureLocalUser } from "@/lib/users";
import { bundlesFor } from "@/lib/menu/features";
import { getMenuFeatures } from "@/lib/menu/queries";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { NAV_GROUPS, optionalNavItems } from "@/components/dashboard/nav";
import { MenuSettingsForm } from "@/components/menu/menu-settings-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default async function MenuSettingsPage() {
  const session = await guardTenantPage("workspace:read");
  const localUserId = await ensureLocalUser(session);
  const enabled = await getMenuFeatures(localUserId, session.companyId);

  const options = optionalNavItems(NAV_GROUPS, {
    permissionCheck: (permission) => can(session.role, permission),
    entityType: session.entityType,
    aiAvailable: aiGatewayConfigured(),
  }).map((item) => ({ feature: item.feature, label: item.label }));

  return (
    <div>
      <SettingsPageHeader
        title="Your menu"
        description="Choose which pages show in your own sidebar; hidden pages still work and can be found with search (⌘K)."
      />
      <MenuSettingsForm
        bundles={bundlesFor(session.entityType)}
        options={options}
        initialEnabled={enabled}
        entityType={session.entityType}
      />
    </div>
  );
}
