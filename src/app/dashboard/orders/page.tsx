import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listOrders } from "@/lib/orders/queries";
import { buttonClasses } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";

export default async function OrdersPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Orders</h1>
        <p className="mt-2 text-muted">Connect a database to manage orders.</p>
      </div>
    );
  }

  const rows = await listOrders(companyId);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Orders</h1>
          <p className="mt-1 text-muted">
            Accepted quotes and manually created work orders before invoicing.
          </p>
        </div>
        {canWrite && (
          <Link href="/dashboard/orders/new" className={buttonClasses("primary")}>
            New order
          </Link>
        )}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No orders yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Quote</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link
                      href={`/dashboard/orders/${o.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {o.number}
                    </Link>
                  </TD>
                  <TD>{o.clientName}</TD>
                  <TD className="text-muted">{o.quoteNumber ?? "—"}</TD>
                  <TD className="capitalize">{o.status}</TD>
                  <TD className="text-right">{o.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
