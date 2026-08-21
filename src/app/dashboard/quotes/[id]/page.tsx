import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, hasPermission } from "@/lib/auth";
import { getQuoteDetail } from "@/lib/quotes/queries";
import { ConvertQuoteButton } from "@/components/quotes/quote-form";
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
  const detail = await getQuoteDetail(id);
  if (!detail) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/quotes" className={buttonClasses("ghost")}>
          ← Quotes
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {detail.quote.number}
          </h1>
          <p className="mt-1 capitalize text-muted">
            {detail.quote.status} · {detail.client.name}
          </p>
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.quote.grossFormatted}</CardValue>
        </Card>
      </div>

      <div className="mt-6">
        <ConvertQuoteButton
          quoteId={detail.quote.id}
          status={detail.quote.status}
          canWrite={canWrite}
        />
        {detail.quote.convertedInvoiceId && (
          <p className="mt-2 text-sm">
            Converted to{" "}
            <Link
              href={`/dashboard/invoices/${detail.quote.convertedInvoiceId}`}
              className="text-brand underline"
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
    </div>
  );
}
