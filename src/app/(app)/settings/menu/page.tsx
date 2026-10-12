import { guardTenantPage } from "@/lib/auth";
import { can } from "@/lib/roles";
import { ensureLocalUser } from "@/lib/users";
import { bundlesFor } from "@/lib/menu/features";
import { getMenuFeatures } from "@/lib/menu/queries";
import { NAV_GROUPS, optionalNavItems } from "@/components/dashboard/nav";
import { MenuSettingsForm } from "@/components/menu/menu-settings-form";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";

export default async function MenuSettingsPage() {
  const session = await guardTenantPage("accounts:read");
  const localUserId = await ensureLocalUser(session);
  const enabled = await getMenuFeatures(localUserId, session.companyId);

  const options = optionalNavItems(NAV_GROUPS, {
    permissionCheck: (permission) => can(session.role, permission),
    entityType: session.entityType,
  }).map((item) => ({ feature: item.feature, label: item.label }));

  return (
    <div>
      <SettingsPageHeader
        title="Your menu"
        description={
          <span className={`block ${SETTINGS_FORM_WIDTH}`}>
            Choose which pages show in your sidebar. Overview, Transactions,
            Expenses, Clients, Invoices, Reports, Deadlines, and Settings always
            show. Hidden pages still work: find them with search (⌘K), and their
            reminders and calculations keep running. This only changes your
            menu, not anyone else&apos;s.
          </span>
        }
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
