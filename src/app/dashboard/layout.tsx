import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { isAuthConfigured, isDatabaseConfigured } from "@/env";
import { hasDatabaseClient } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureLocalUser, findLocalUser, listUserMemberships } from "@/lib/users";
import { can } from "@/lib/roles";
import { countOverdueInvoices } from "@/lib/invoices/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import {
  NAV_COLLAPSED_COOKIE,
  NAV_GROUPS,
  filterNavGroups,
} from "@/components/dashboard/nav";
import { DashboardShell } from "@/components/dashboard/shell";
import { AuthNotConfigured } from "@/components/auth-notice";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAuthConfigured()) return <AuthNotConfigured />;

  let user = await requireUser();
  const clerkUser = await currentUser();
  const avatarUrl = clerkUser?.imageUrl ?? null;
  let localUserId: string | null = user.localUserId;
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
    }
  }

  if (!user.companyId) {
    redirect("/onboarding");
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
    isDatabaseConfigured() &&
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

  return (
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
    >
      {children}
    </DashboardShell>
  );
}
