import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  loadCompanyChannelDefaults,
  loadUserChannelOverrides,
  mergeChannelPrefs,
} from "@/lib/notifications";
import { NotificationPrefsForm } from "@/components/notifications/notification-prefs-form";
import { can } from "@/lib/roles";
import Link from "next/link";

export default async function NotificationSettingsPage() {
  const session = await guardTenantPage("accounts:read");
  const userId =
    session.localUserId ?? (await ensureLocalUser(session));
  const canManageCompany = can(session.role, "settings:manage");

  const [companyDefaults, userOverrides] = await Promise.all([
    loadCompanyChannelDefaults(session.companyId),
    loadUserChannelOverrides(userId, session.companyId),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-2xl font-semibold">Notifications</h1>
        <p className="mt-1 text-sm text-muted">
          Control in-app, email, and push alerts.{" "}
          <Link href="/inbox" className="text-brand underline underline-offset-2">
            Open inbox
          </Link>
        </p>
      </div>

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
    </div>
  );
}
