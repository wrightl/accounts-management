import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hasDatabaseClient } from "@/db";
import { requireUser, safeCurrentUser } from "@/lib/auth";
import { isPlatformAdmin } from "@/lib/platform";
import { ensureLocalUser, findLocalUser, listUserMemberships } from "@/lib/users";
import { can } from "@/lib/roles";
import { countOverdueInvoices } from "@/lib/invoices/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { getPlatformSettings } from "@/lib/platform-settings";
import {
  NAV_COLLAPSED_COOKIE,
  NAV_GROUPS,
  filterNavGroups,
} from "@/components/dashboard/nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { SyncUiPrefsCookie } from "@/components/users/sync-ui-prefs-cookie";
import { parseUiPrefs } from "@/lib/ui-prefs";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = await requireUser();
  const clerkUser = await safeCurrentUser();
  const avatarUrl = clerkUser?.imageUrl ?? null;
  let localUserId: string | null = user.localUserId;
  let uiPrefsRaw: Record<string, unknown> | undefined;
  if (hasDatabaseClient()) {
    localUserId = await ensureLocalUser(user);
    const local = await findLocalUser(user.userId);
    if (local) {
      user = {
        ...user,
        role: local.role,
        name: user.name ?? local.name,
        companyId: local.companyId,
        localUserId: local.id,
      };
      localUserId = local.id;
      uiPrefsRaw = local.uiPrefs;
    }
  }

  if (!user.companyId) {
    redirect(isPlatformAdmin(user) ? "/platform" : "/onboarding");
  }

  if (hasDatabaseClient()) {
    const { getDb } = await import("@/db");
    const { eq } = await import("drizzle-orm");
    const { companyBilling } = await import("@/db/schema");
    const db = getDb();
    const [billing] = await db
      .select({
        status: companyBilling.status,
        stripeSubscriptionId: companyBilling.stripeSubscriptionId,
      })
      .from(companyBilling)
      .where(eq(companyBilling.companyId, user.companyId))
      .limit(1);
    if (
      billing &&
      billing.status === "unpaid" &&
      !billing.stripeSubscriptionId
    ) {
      redirect("/subscribe");
    }
  }

  const company = await getCompanySettings(user.companyId);
  const memberships =
    localUserId && hasDatabaseClient()
      ? await listUserMemberships(localUserId)
      : [];

  const groups = filterNavGroups(
    NAV_GROUPS,
    (permission) => can(user.role, permission),
    user.entityType ?? company.entityType,
  );
  const navCollapsed =
    (await cookies()).get(NAV_COLLAPSED_COOKIE)?.value === "1";

  let overdueInvoiceCount = 0;
  if (
    hasDatabaseClient() &&
    can(user.role, "accounts:read")
  ) {
    try {
      overdueInvoiceCount = await countOverdueInvoices(user.companyId);
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "overdue_invoice_count_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  let maintenanceBanner: string | null = null;
  let billingBanner: Awaited<
    ReturnType<typeof import("@/lib/billing/queries").getBillingBanner>
  > = null;
  if (hasDatabaseClient()) {
    try {
      const settings = await getPlatformSettings();
      maintenanceBanner = settings.maintenanceBanner;
    } catch {
      maintenanceBanner = null;
    }
    try {
      const { getBillingBanner } = await import("@/lib/billing/queries");
      billingBanner = await getBillingBanner(user.companyId);
    } catch {
      billingBanner = null;
    }
  }

  const showPlatformLink = isPlatformAdmin(user);
  const uiPrefs = parseUiPrefs(uiPrefsRaw);

  return (
    <>
      <SyncUiPrefsCookie prefs={uiPrefs} />
      <DashboardShell
        groups={groups}
        role={user.role}
        userName={user.name}
        avatarUrl={avatarUrl}
        companyId={user.companyId}
        companyName={company.name}
        companyLogoUrl={company.logoUrl}
        memberships={memberships.map((m) => ({
          companyId: m.companyId,
          companyName: m.companyName,
          logoUrl: m.logoUrl,
        }))}
        navCollapsed={navCollapsed}
        overdueInvoiceCount={overdueInvoiceCount}
        showPlatformLink={showPlatformLink}
        maintenanceBanner={maintenanceBanner}
        billingBanner={billingBanner}
        suspendedReason={
          company.suspendedAt
            ? company.suspendedReason ??
              "This company is suspended. Contact support for help."
            : null
        }
      >
        {children}
      </DashboardShell>
    </>
  );
}
