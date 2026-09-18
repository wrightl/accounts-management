import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getRecurringInvoiceDetail } from "@/lib/invoices/recurring-queries";
import { RecurringInvoiceActions } from "@/components/recurring-invoices/recurring-actions";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { clientDisplayName } from "@/lib/clients/display";
import { formatGBP } from "@/lib/money";
import { isDatabaseConfigured } from "@/env";
import type { InvoiceStatus } from "@/lib/invoices/status";

export default async function RecurringInvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();

  const detail = await getRecurringInvoiceDetail(companyId, id);
  if (!detail) notFound();

  const { template, client, generatedInvoices } = detail;

  return (
    <div>
      <div className="mb-6">
        <Link href="/recurring-invoices" className={buttonClasses("ghost")}>
          ← Recurring
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">
              {template.name}
            </h1>
            {canWrite ? (
              <Link
                href={`/recurring-invoices/${template.id}/edit`}
                className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
                aria-label="Edit schedule"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <p className="mt-1 text-muted">
            <Link
              href={`/clients/${client.id}`}
              className="text-foreground hover:underline"
            >
              {clientDisplayName(client)}
            </Link>
            {" · "}
            Day {template.dayOfMonth} each month
            {" · "}
            {template.enabled ? "Active" : "Paused"}
            {" · "}
            On generate: {template.onGenerate}
          </p>
          <p className="mt-1 text-sm text-muted">
            Next run: {template.nextRunOn ?? "—"}
            {template.endsOn ? ` · Ends ${template.endsOn}` : ""}
            {template.maxOccurrences != null
              ? ` · ${template.occurrenceCount}/${template.maxOccurrences} invoices`
              : ` · ${template.occurrenceCount} generated`}
          </p>
          <div className="mt-3">
            <RecurringInvoiceActions
              id={template.id}
              enabled={template.enabled}
              canWrite={canWrite}
            />
          </div>
        </div>
        <Card className="min-w-[160px]">
          <CardTitle>Amount</CardTitle>
          <CardValue>{template.grossFormatted}</CardValue>
        </Card>
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
            {template.lineTemplate.map((line, i) => (
              <TR key={i}>
                <TD>{line.description}</TD>
                <TD className="text-right">{line.quantity}</TD>
                <TD className="text-right">
                  {formatGBP(line.unitPricePence)}
                </TD>
                <TD className="text-right">
                  {formatGBP(Math.round(line.quantity * line.unitPricePence))}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 font-display text-lg font-semibold">
          Generated invoices
        </h2>
        {generatedInvoices.length === 0 ? (
          <p className="text-sm text-muted">No invoices generated yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Status</TH>
                <TH>Issue date</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {generatedInvoices.map((inv) => (
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
                  <TD className="text-right font-medium">
                    {inv.grossFormatted}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
