import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardPage, hasPermission } from "@/lib/auth";
import { getQuoteDetail, listQuoteVersionHistory } from "@/lib/quotes/queries";
import { canEditQuote } from "@/lib/quotes/status";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultQuoteEmailMessage } from "@/lib/quotes/email";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { QuoteHistory } from "@/components/quotes/quote-history";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatGBP, lineNetPence } from "@/lib/money";
import { isDatabaseConfigured } from "@/env";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) notFound();
  const [detail, company, history] = await Promise.all([
    getQuoteDetail(id),
    getOrCreateCompanySettings(),
    listQuoteVersionHistory(id),
  ]);
  if (!detail) notFound();

  const defaultMessage = defaultQuoteEmailMessage({
    number: detail.quote.number,
    version: detail.quote.version,
    grossFormatted: detail.quote.grossFormatted,
    companyName: company.name,
  });

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/quotes" className={buttonClasses("ghost")}>
          ← Quotes
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">
              {detail.quote.reference}
            </h1>
            {canWrite && canEditQuote(detail.quote.status) ? (
              <Link
                href={`/dashboard/quotes/${detail.quote.id}/edit`}
                className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
                aria-label="Edit quote"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <p className="mt-1 capitalize text-muted">
            {detail.quote.status} · {detail.client.name}
          </p>
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.quote.grossFormatted}</CardValue>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        <QuoteActions
          quoteId={detail.quote.id}
          status={detail.quote.status}
          canWrite={canWrite}
          clientEmail={detail.client.email ?? ""}
          defaultMessage={defaultMessage}
        />
        {detail.quote.convertedInvoiceId && (
          <p className="text-sm">
            Converted to{" "}
            <Link
              href={`/dashboard/invoices/${detail.quote.convertedInvoiceId}`}
              className="text-foreground underline"
            >
              invoice
            </Link>
          </p>
        )}
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

      {history && (
        <QuoteHistory
          quoteId={detail.quote.id}
          currentVersion={detail.quote.version}
          canWrite={canWrite}
          history={history}
        />
      )}
    </div>
  );
}
