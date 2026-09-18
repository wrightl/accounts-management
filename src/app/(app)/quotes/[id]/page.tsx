import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getQuoteDetail, listQuoteVersionHistory } from "@/lib/quotes/queries";
import { listDeclineReasonCategories } from "@/lib/quotes/decline-reasons";
import { canEditQuote, quoteStatusLabel, type QuoteStatus } from "@/lib/quotes/status";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import { defaultQuoteEmailMessage } from "@/lib/quotes/email";
import { QuoteActions } from "@/components/quotes/quote-actions";
import { QuoteStatusActions } from "@/components/quotes/quote-status-actions";
import { QuoteHistory } from "@/components/quotes/quote-history";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatGBP, lineNetPence } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const [detail, company, history, declineCategories] = await Promise.all([
    getQuoteDetail(companyId, id),
    getOrCreateCompanySettings(companyId),
    listQuoteVersionHistory(companyId, id),
    listDeclineReasonCategories(companyId),
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
        <Link href="/quotes" className={buttonClasses("ghost")}>
          ← Quotes
        </Link>
      </div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl font-semibold">
              {detail.quote.reference}
            </h1>
            {canWrite && canEditQuote(detail.quote.status) ? (
              <Link
                href={`/quotes/${detail.quote.id}/edit`}
                className={buttonClasses("ghost", "size-9 shrink-0 px-0")}
                aria-label="Edit quote"
              >
                <Pencil className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
          <p className="mt-1 text-muted">
            {quoteStatusLabel(detail.quote.status as QuoteStatus)} · {clientDisplayName(detail.client)}
          </p>
          {canWrite ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <QuoteStatusActions
                quoteId={detail.quote.id}
                status={detail.quote.status as QuoteStatus}
                canWrite={canWrite}
                declineCategories={declineCategories}
              />
              <QuoteActions
                quoteId={detail.quote.id}
                status={detail.quote.status}
                canWrite={canWrite}
                clientEmail={detail.client.email ?? ""}
                defaultMessage={defaultMessage}
              />
            </div>
          ) : null}
        </div>
        <Card className="min-w-[140px]">
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.quote.grossFormatted}</CardValue>
        </Card>
      </div>

      <div className="mt-6 space-y-4">
        {detail.quote.orderId ? (
          <p className="text-sm">
            Order{" "}
            <Link
              href={`/orders/${detail.quote.orderId}`}
              className="text-foreground underline"
            >
              view order
            </Link>
          </p>
        ) : null}
        {detail.quote.status === "declined" && detail.quote.declinedReasonCategory ? (
          <Card>
            <CardTitle>Decline reason</CardTitle>
            <p className="mt-2 text-sm font-medium">{detail.quote.declinedReasonCategory}</p>
            {detail.quote.declinedReasonNarrative ? (
              <p className="mt-1 text-sm text-muted">{detail.quote.declinedReasonNarrative}</p>
            ) : null}
          </Card>
        ) : null}
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

      {history && (
        <QuoteHistory
          quoteId={detail.quote.id}
          currentVersion={detail.quote.version}
          canWrite={canWrite && canEditQuote(detail.quote.status)}
          history={history}
        />
      )}
    </div>
  );
}
