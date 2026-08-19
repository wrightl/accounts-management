import { isAuthConfigured } from "@/env";
import { requireUser } from "@/lib/auth";
import { can } from "@/lib/roles";
import { NAV_ITEMS } from "@/components/dashboard/nav";
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

  const user = await requireUser();
  const items = NAV_ITEMS.filter((item) => can(user.role, item.permission));

  return (
    <DashboardShell items={items} role={user.role} userName={user.name}>
      {children}
    </DashboardShell>
  );
}
