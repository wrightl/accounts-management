import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { countUserMemberships, getMembership, getUser } from "@/lib/users";
import { countPendingReimbursementsByPayee } from "@/lib/reimbursements/queries";
import { UserForm } from "@/components/users/user-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await guardTenantPage("users:manage");
  const { id } = await params;

  const membership = await getMembership(id, session.companyId);
  if (!membership) notFound();

  const user = await getUser(id);
  if (!user) notFound();

  const [pendingByPayee, membershipCount] = await Promise.all([
    countPendingReimbursementsByPayee(session.companyId),
    countUserMemberships(id),
  ]);

  return (
    <div>
      <SettingsPageHeader title="Edit user" backHref="/users" backLabel="Users" />
      <UserForm
        mode="edit"
        user={{ ...user, role: membership.role }}
        isSelf={user.clerkUserId === session.userId}
        sharedWithOtherCompanies={membershipCount > 1}
        pendingReimbursementCount={pendingByPayee.get(id) ?? 0}
      />
    </div>
  );
}
