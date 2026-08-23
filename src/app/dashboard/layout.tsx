import { cookies } from "next/headers";
import { isAuthConfigured } from "@/env";
import { hasDatabaseClient } from "@/db";
import { requireUser } from "@/lib/auth";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { can } from "@/lib/roles";
import { NAV_COLLAPSED_COOKIE, NAV_ITEMS } from "@/components/dashboard/nav";
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
    if (local) user = { ...user, role: local.role };
  }

  const items = NAV_ITEMS.filter((item) => can(user.role, item.permission));
  const navCollapsed =
    (await cookies()).get(NAV_COLLAPSED_COOKIE)?.value === "1";

  return (
    <DashboardShell
      items={items}
      role={user.role}
      userName={user.name}
      navCollapsed={navCollapsed}
    >
      {children}
    </DashboardShell>
  );
}
