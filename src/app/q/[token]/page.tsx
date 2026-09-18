import { notFound } from "next/navigation";
import { markPublicQuoteViewed } from "@/actions/public-quotes";
import { PublicQuoteActions } from "@/components/quotes/public-quote-actions";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { clientDisplayName } from "@/lib/clients/display";
import { formatGBP, lineNetPence } from "@/lib/money";
import { getPublicQuoteByToken } from "@/lib/quotes/public-queries";
import { quoteStatusLabel, type QuoteStatus } from "@/lib/quotes/status";
import { todayIsoDate } from "@/lib/invoices/status";
import { canTransitionQuote } from "@/lib/quotes/transitions";

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const data = await getPublicQuoteByToken(token);
  if (!data) notFound();
  if (data.suspended) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-16">
        <h1 className="font-display text-2xl font-semibold">Unavailable</h1>
        <p className="mt-2 text-muted">This quote is no longer available.</p>
      </main>
    );
  }

  await markPublicQuoteViewed(token);

  const { detail, company } = data;
  const status = detail.quote.status as QuoteStatus;
  const expired = Boolean(
    detail.quote.validUntil && detail.quote.validUntil < todayIsoDate(),
  );
  const canRespond =
    canTransitionQuote(status, "accepted") ||
    canTransitionQuote(status, "declined");

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{company.name}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            Quote {detail.quote.number}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {quoteStatusLabel(status)}
            {detail.quote.validUntil
              ? ` · Valid until ${detail.quote.validUntil}`
              : null}
          </p>
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.quote.grossFormatted}</CardValue>
        </Card>
      </header>

      <p className="mb-4 text-sm text-muted">
        Prepared for {clientDisplayName(detail.client)}
      </p>

      <Table>
        <THead>
          <TR>
            <TH>Description</TH>
            <TH className="text-right">Qty</TH>
            <TH className="text-right">Unit</TH>
            {company.vatRegistered ? (
              <TH className="text-right">VAT</TH>
            ) : null}
            <TH className="text-right">Amount</TH>
          </TR>
        </THead>
        <TBody>
          {detail.lines.map((l) => (
            <TR key={l.id}>
              <TD>{l.description}</TD>
              <TD className="text-right">{l.quantity}</TD>
              <TD className="text-right">{formatGBP(l.unitPricePence)}</TD>
              {company.vatRegistered ? (
                <TD className="text-right">{l.vatRate}%</TD>
              ) : null}
              <TD className="text-right">
                {formatGBP(lineNetPence(l))}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="mt-4 space-y-1 text-right text-sm">
        <p className="text-muted">Net {formatGBP(detail.quote.netPence)}</p>
        {detail.quote.vatPence > 0 ? (
          <p className="text-muted">VAT {formatGBP(detail.quote.vatPence)}</p>
        ) : null}
        <p className="font-display text-lg font-semibold">
          Total {detail.quote.grossFormatted}
        </p>
      </div>

      {detail.quote.notes ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
            {detail.quote.notes}
          </p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <a
          href={`/q/${encodeURIComponent(token)}/pdf`}
          className={buttonClasses("secondary")}
        >
          Download PDF
        </a>
      </div>

      <section className="mt-10 border-t border-border pt-8">
        <h2 className="mb-4 font-display text-lg font-semibold">Your response</h2>
        <PublicQuoteActions
          token={token}
          canRespond={canRespond}
          expired={expired}
        />
      </section>
    </main>
  );
}
