import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getOrderDetail } from "@/lib/orders/queries";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { OrderActions } from "@/components/orders/order-actions";
import { InvoiceDueDate } from "@/components/invoices/invoice-due-date";
import { StatusBadge } from "@/components/ui/badge";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatGBP, lineNetPence } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";
import type { InvoiceStatus } from "@/lib/invoices/status";

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const [detail, company] = await Promise.all([
    getOrderDetail(companyId, id),
    getOrCreateCompanySettings(companyId),
  ]);
  if (!detail) notFound();

  const issueDate = todayIsoDate();
  const defaultDue = defaultDueDate(issueDate, company.invoicePaymentTermsDays);

  return (
    <div>
      <div className="mb-6">
        <Link href="/orders" className={buttonClasses("ghost")}>
          ← Orders
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-2xl font-semibold">{detail.order.number}</h1>
          <p className="mt-1 text-muted capitalize">
            {detail.order.status} ·{" "}
            <Link
              href={`/clients/${detail.client.id}`}
              className="text-foreground hover:underline"
            >
              {clientDisplayName(detail.client)}
            </Link>
            {" · Created "}
            {detail.order.createdDateFormatted}
          </p>
          {detail.quote ? (
            <p className="mt-1 text-sm">
              From quote{" "}
              <Link
                href={`/quotes/${detail.quote.id}`}
                className="text-foreground underline"
              >
                {detail.quote.number}
              </Link>
            </p>
          ) : null}
          {canWrite ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <OrderActions
                orderId={detail.order.id}
                canWrite={canWrite}
                remainingPence={detail.remainingPence}
                orderGrossPence={detail.order.grossPence}
                availableMilestones={detail.availableMilestones}
                defaultDueDate={defaultDue}
              />
              {detail.remainingPence <= 0 ? (
                <span className="text-sm text-muted">Fully invoiced</span>
              ) : null}
            </div>
          ) : null}
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.order.grossFormatted}</CardValue>
          {detail.priorInvoicedPence > 0 ? (
            <p className="mt-2 text-xs text-muted">
              Remaining {detail.remainingFormatted}
            </p>
          ) : null}
        </Card>
      </div>

      <div className="mt-8">
        <Table>
          <THead>
            <TR>
              <TH>Description</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Unit</TH>
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {detail.lines.map((l) => (
              <TR key={l.id}>
                <TD>{l.description}</TD>
                <TD className="text-right">{l.quantity}</TD>
                <TD className="text-right">{formatGBP(l.unitPricePence)}</TD>
                <TD className="text-right">{formatGBP(lineNetPence(l))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {detail.milestones.length > 0 ? (
        <div className="mt-8">
          <h2 className="mb-3 font-display text-lg font-semibold">Payment schedule</h2>
          <Table>
            <THead>
              <TR>
                <TH>Milestone</TH>
                <TH className="text-right">Amount</TH>
                <TH className="text-right">Due</TH>
              </TR>
            </THead>
            <TBody>
              {detail.milestones.map((m) => (
                <TR key={m.id}>
                  <TD>{m.label}</TD>
                  <TD className="text-right">
                    {m.amountPence != null
                      ? formatGBP(m.amountPence)
                      : m.percentBasisPoints != null
                        ? `${m.percentBasisPoints / 100}%`
                        : "—"}
                  </TD>
                  <TD className="text-right text-muted">
                    {m.dueDate ?? (m.dueInDays != null ? `${m.dueInDays} days` : "—")}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      ) : null}

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Invoices</h2>
        {detail.invoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices for this order yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Status</TH>
                <TH>Issued</TH>
                <TH>Due</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {detail.invoices.map((inv) => (
                <TR key={inv.id}>
                  <TD>
                    <Link
                      href={`/invoices/${inv.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {inv.number}
                    </Link>
                  </TD>
                  <TD>
                    <StatusBadge status={inv.status as InvoiceStatus} />
                  </TD>
                  <TD className="text-muted">{inv.issueDate ?? "—"}</TD>
                  <TD>
                    <InvoiceDueDate
                      dueDate={inv.dueDate}
                      status={inv.status as InvoiceStatus}
                    />
                  </TD>
                  <TD className="text-right">{inv.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {detail.order.notes ? (
        <div className="mt-8">
          <h2 className="mb-2 font-display text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm">{detail.order.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
