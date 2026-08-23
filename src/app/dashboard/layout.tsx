import { cookies } from "next/headers";
import { isAuthConfigured, isDatabaseConfigured } from "@/env";
import { hasDatabaseClient } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { can } from "@/lib/roles";
import { countOverdueInvoices } from "@/lib/invoices/queries";
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
  // Before Clerk is configured, avoid calling auth() (which would throw) and
  // show a friendly notice instead.
  if (!isAuthConfigured()) return <AuthNotConfigured />;

  let user = await requireUser();
  if (hasDatabaseClient()) {
    await ensureLocalUser(user);
    const local = await findLocalUser(user.userId);
    if (local) {
      user = {
        ...user,
        role: local.role,
        name: user.name ?? local.name,
      };
    }
  }

  const groups = filterNavGroups(NAV_GROUPS, (permission) =>
    can(user.role, permission),
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
      overdueInvoiceCount = await countOverdueInvoices();
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
      navCollapsed={navCollapsed}
      overdueInvoiceCount={overdueInvoiceCount}
    >
      {children}
    </DashboardShell>
  );
}
