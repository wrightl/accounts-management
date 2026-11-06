import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  loadCompanyChannelDefaults,
  loadHidePushDetails,
  loadUserChannelOverrides,
  mergeChannelPrefs,
} from "@/lib/notifications";
import { LockScreenPrivacy } from "@/components/notifications/lock-screen-privacy";
import { NotificationPrefsForm } from "@/components/notifications/notification-prefs-form";
import { can } from "@/lib/roles";
import Link from "next/link";
import { buttonClasses } from "@/components/ui/button";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";

export default async function NotificationSettingsPage() {
  const session = await guardTenantPage("workspace:read");
  const userId =
    session.localUserId ?? (await ensureLocalUser(session));
  const canManageCompany = can(session.role, "settings:manage");

  const [companyDefaults, userOverrides, hidePushDetails] = await Promise.all([
    loadCompanyChannelDefaults(session.companyId),
    loadUserChannelOverrides(userId, session.companyId),
    loadHidePushDetails(userId, session.companyId),
  ]);

  return (
    <div>
      <SettingsPageHeader
        title="Notifications"
        description="Which events reach you in the app, by email, or as push alerts."
        actions={
          <Link href="/inbox" className={buttonClasses("secondary")}>
            Open inbox
          </Link>
        }
      />
      <div className={`${SETTINGS_FORM_WIDTH} space-y-10`}>
        {canManageCompany ? (
          <NotificationPrefsForm
            mode="company"
            initial={companyDefaults}
          />
        ) : null}

        <NotificationPrefsForm
          mode="user"
          initial={mergeChannelPrefs(companyDefaults, userOverrides)}
          showPushEnable
        />

        <LockScreenPrivacy initial={hidePushDetails} />
      </div>
    </div>
  );
}
