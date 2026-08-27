import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { ClientForm } from "@/components/clients/client-form";
import { buttonClasses } from "@/components/ui/button";

export default async function NewClientPage() {
  await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/clients" className={buttonClasses("ghost")}>
          ← Clients
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">New client</h1>
      <ClientForm mode="create" canWrite={canWrite} />
    </div>
  );
}
