import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getMembership, getUser } from "@/lib/users";
import { UserForm } from "@/components/users/user-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function EditUserPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await guardTenantPage("users:manage");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const membership = await getMembership(id, session.companyId);
  if (!membership) notFound();

  const user = await getUser(id);
  if (!user) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/users" className={buttonClasses("ghost")}>
          ← Users
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">Edit user</h1>
      <UserForm
        mode="edit"
        user={{ ...user, role: membership.role }}
        isSelf={user.clerkUserId === session.userId}
      />
    </div>
  );
}
