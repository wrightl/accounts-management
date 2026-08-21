import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, hasPermission } from "@/lib/auth";
import { getInvoiceDetail } from "@/lib/invoices/queries";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { InvoiceActions } from "@/components/invoices/invoice-actions";
import { formatGBP, lineNetPence } from "@/lib/money";
import { isDatabaseConfigured } from "@/env";
import type { InvoiceStatus } from "@/lib/invoices/status";

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const detail = await getInvoiceDetail(id);
  if (!detail) notFound();

  const { invoice, client, lines, payments, paidFormatted, balanceFormatted } =
    detail;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/invoices" className={buttonClasses("ghost")}>
            ← Invoices
          </Link>
          <StatusBadge status={invoice.status as InvoiceStatus} />
        </div>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">{invoice.number}</h1>
          <p className="mt-1 text-muted">
            <Link
              href={`/dashboard/clients/${client.id}`}
              className="text-brand hover:underline"
            >
              {client.name}
            </Link>
            {invoice.issueDate ? ` · Issued ${invoice.issueDate}` : null}
            {invoice.dueDate ? ` · Due ${invoice.dueDate}` : null}
          </p>
        </div>
        <Card className="min-w-[160px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{invoice.grossFormatted}</CardValue>
        </Card>
      </div>

      <div className="mt-6">
        <InvoiceActions
          invoiceId={invoice.id}
          status={invoice.status}
          canWrite={canWrite}
          balanceFormatted={balanceFormatted}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Line items</h2>
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
            {lines.map((line) => (
              <TR key={line.id}>
                <TD>{line.description}</TD>
                <TD className="text-right">{line.quantity}</TD>
                <TD className="text-right">{formatGBP(line.unitPricePence)}</TD>
                <TD className="text-right">{formatGBP(lineNetPence(line))}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      {invoice.notes && (
        <div className="mt-6">
          <h2 className="mb-2 font-display text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm text-muted">{invoice.notes}</p>
        </div>
      )}

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">Payments</h2>
        {payments.length === 0 ? (
          <p className="text-sm text-muted">No payments recorded.</p>
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH>Received</TH>
                  <TH>Method</TH>
                  <TH>Reference</TH>
                  <TH className="text-right">Amount</TH>
                </TR>
              </THead>
              <TBody>
                {payments.map((p) => (
                  <TR key={p.id}>
                    <TD>{p.receivedAt.toISOString().slice(0, 10)}</TD>
                    <TD>{p.method ?? "—"}</TD>
                    <TD className="text-muted">{p.reference ?? "—"}</TD>
                    <TD className="text-right">{p.amountFormatted}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
            <p className="mt-3 text-sm text-muted">
              Paid {paidFormatted} · Balance {balanceFormatted}
            </p>
          </>
        )}
      </div>
    </div>
  );
}
