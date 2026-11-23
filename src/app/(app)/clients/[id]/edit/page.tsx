import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getClient } from "@/lib/clients/queries";
import { clientDisplayName } from "@/lib/clients/display";
import { ClientForm } from "@/components/clients/client-form";
import { PageHeader } from "@/components/ui/page-header";

export default async function EditClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const client = await getClient(companyId, id);
  if (!client) notFound();

  return (
    <div>
      <PageHeader
        backHref={`/clients/${id}`}
        backLabel={clientDisplayName(client)}
        title="Edit client"
        className="mb-6"
      />
      <ClientForm mode="edit" client={client} canWrite={canWrite} />
    </div>
  );
}
