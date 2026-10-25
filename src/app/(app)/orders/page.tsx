import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listOrders } from "@/lib/orders/queries";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import { defineTableSort, parseTableSort, rankIn, sortRows } from "@/lib/table-sort";

/** "created" is the loaded order (newest first) and has no header. */
const SORT = defineTableSort({
  columns: ["created", "number", "client", "quote", "status", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "total"],
});
const STATUS_ORDER = ["draft", "active", "completed", "cancelled"] as const;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/orders", sp, SORT, sort);

  const rows = sortRows(await listOrders(companyId), sort, {
    number: (r) => r.number,
    client: (r) => r.clientName,
    quote: (r) => r.quoteNumber,
    status: (r) => rankIn(STATUS_ORDER, r.status),
    total: (r) => r.grossPence,
  });

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
          <Link href="/orders/new" className={buttonClasses("primary")}>
            New order
          </Link>
        )}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <EmptyState
            title="No orders yet"
            description="Orders come from accepted quotes, or you can create one by hand before invoicing."
            actionHref={canWrite ? "/orders/new" : undefined}
            actionLabel={canWrite ? "Create an order" : undefined}
          />
        ) : (
          <Table>
            <THead>
              <TR>
                {th("Number", "number")}
                {th("Client", "client")}
                {th("Quote", "quote")}
                {th("Status", "status")}
                {th("Total", "total", "end")}
              </TR>
            </THead>
            <TBody>
              {rows.map((o) => (
                <TR key={o.id}>
                  <TD>
                    <Link
                      href={`/orders/${o.id}`}
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
