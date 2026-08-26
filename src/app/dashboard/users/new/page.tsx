import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { UserForm } from "@/components/users/user-form";
import { buttonClasses } from "@/components/ui/button";

export default async function NewUserPage() {
  const { companyId } = await guardTenantPage("users:manage");

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/users" className={buttonClasses("ghost")}>
          ← Users
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">Invite user</h1>
      <UserForm mode="invite" />
    </div>
  );
}
