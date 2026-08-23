import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, hasPermission } from "@/lib/auth";
import { getClient } from "@/lib/clients/queries";
import { ClientForm } from "@/components/clients/client-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const client = await getClient(id);
  if (!client) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link href="/dashboard/clients" className={buttonClasses("ghost")}>
          ← Clients
        </Link>
      </div>
      <h1 className="mb-6 font-display text-2xl font-semibold">{client.name}</h1>
      <ClientForm mode="edit" client={client} canWrite={canWrite} />
    </div>
  );
}
