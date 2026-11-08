import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listOrderPage } from "@/lib/orders/queries";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TD } from "@/components/ui/table";
import { sortHeaders } from "@/components/ui/sortable-th";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging } from "@/lib/list-paging";
import { defineTableSort, parseTableSort } from "@/lib/table-sort";
import { PageHeader } from "@/components/ui/page-header";

/** "created" is the loaded order (newest first) and has no header. */
const SORT = defineTableSort({
  columns: ["created", "number", "client", "quote", "status", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "total"],
});

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

  const { rows, ...paging } = await listOrderPage(companyId, { ...sort, ...parseListPaging(sp) });

  return (
    <div>
      <PageHeader
        title="Orders"
        description="Accepted quotes and manually created work orders before invoicing."
        actions={
          canWrite ? (
            <Link href="/orders/new" className={buttonClasses("primary")}>
              New order
            </Link>
          ) : null
        }
      />

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
        <ListPagination {...paging} href={(to) => listPageHref("/orders", sp, to)} />
      </div>
    </div>
  );
}
