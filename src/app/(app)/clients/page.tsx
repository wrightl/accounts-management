import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function ClientsPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  const rows = await listClients(companyId);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Clients</h1>
          <p className="mt-1 text-muted">People and companies you invoice.</p>
        </div>
        {canWrite && (
          <Link href="/clients/new" className={buttonClasses("primary")}>
            New client
          </Link>
        )}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No clients yet"
            description="Add the people or companies you invoice so quotes and invoices have somewhere to go."
            actionHref={canWrite ? "/clients/new" : undefined}
            actionLabel={canWrite ? "Add a client" : undefined}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Company</TH>
                <TH>Email</TH>
                <TH>Notes</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Link
                      href={`/clients/${c.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {c.name}
                    </Link>
                  </TD>
                  <TD className="text-muted">{c.companyName ?? "—"}</TD>
                  <TD className="text-muted">{c.email ?? "—"}</TD>
                  <TD className="max-w-xs truncate text-muted">{c.notes ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
