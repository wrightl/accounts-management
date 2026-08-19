import { guardPage } from "@/lib/auth";
import { SectionStub } from "@/components/dashboard/section-stub";

export default async function UsersPage() {
  await guardPage("users:manage");
  return (
    <SectionStub
      title="Users"
      description="Manage co-founder and accountant access and roles (admin only)."
      phase={0}
    />
  );
}
