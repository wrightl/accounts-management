import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { ClientImportButton } from "@/components/clients/client-import-panel";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import { defineTableSort, parseTableSort, sortRows } from "@/lib/table-sort";

const SORT = defineTableSort({
  columns: ["name", "company", "email"],
  fallback: { sort: "name", dir: "asc" },
  descFirst: [],
});

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/clients", sp, SORT, sort);

  // Sorted here too, so name order is case-insensitive like the other columns.
  const rows = sortRows(await listClients(companyId), sort, {
    name: (r) => r.name,
    company: (r) => r.companyName,
    email: (r) => r.email,
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Clients</h1>
          <p className="mt-1 text-muted">People and companies you invoice.</p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            <ClientImportButton canWrite={canWrite} />
            <Link href="/clients/new" className={buttonClasses("primary")}>
              New client
            </Link>
          </div>
        ) : null}
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
                {th("Name", "name")}
                {th("Company", "company")}
                {th("Email", "email")}
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
