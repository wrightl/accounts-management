import { guardTenantPage } from "@/lib/auth";
import { UserForm } from "@/components/users/user-form";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default async function NewUserPage() {
  await guardTenantPage("users:manage");

  return (
    <div>
      <SettingsPageHeader title="Invite user" backHref="/users" backLabel="Users" />
      <UserForm mode="invite" />
    </div>
  );
}
