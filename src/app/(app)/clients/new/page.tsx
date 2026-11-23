import { guardTenantPage, hasPermission } from "@/lib/auth";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function NewClientPage() {
  await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  return (
    <div>
      <PageHeader
        backHref="/clients"
        backLabel="Clients"
        title="Create client"
        className="mb-6"
      />
      <ClientForm mode="create" canWrite={canWrite} />
    </div>
  );
}
