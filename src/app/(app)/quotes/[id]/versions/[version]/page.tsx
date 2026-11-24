import { notFound, redirect } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getQuoteVersionDetail } from "@/lib/quotes/queries";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  formatDiscountPercent,
  formatMoney,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { DisplayDate } from "@/components/date-format-provider";
import { Callout } from "@/components/ui/callout";
import { PageHeader } from "@/components/ui/page-header";

export default async function QuoteVersionPage({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const { id, version: versionParam } = await params;
  const version = Number.parseInt(versionParam, 10);
  if (!Number.isFinite(version) || version < 1) notFound();

  const detail = await getQuoteVersionDetail(companyId, id, version);
  if (!detail) notFound();
  if (detail.isCurrent) {
    redirect(`/quotes/${id}`);
  }

  return (
    <div>
      <PageHeader
        backHref={`/quotes/${id}`}
        backLabel="Current quote"
        title={detail.quote.reference}
        description={
          <>
            <p className="capitalize">
              {detail.quote.status} · {clientDisplayName(detail.client)}
            </p>
            <p className="mt-1 text-sm">
              Issued <DisplayDate value={detail.quote.issueDate} />
              {detail.quote.validUntil ? <> · Valid until <DisplayDate value={detail.quote.validUntil} /></> : null}
            </p>
          </>
        }
      />

      <Callout tone="warning" className="mt-4">
        You&apos;re viewing {detail.quote.versionLabel}, not the current version
        {detail.currentVersion ? ` (v${detail.currentVersion})` : ""}.
      </Callout>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card>
          <CardTitle>Total</CardTitle>
          <CardValue>{detail.quote.grossFormatted}</CardValue>
        </Card>
      </div>

      {detail.quote.notes ? (
        <div className="mt-6">
          <h2 className="mb-2 font-display text-lg font-semibold">Notes</h2>
          <p className="whitespace-pre-wrap text-sm">{detail.quote.notes}</p>
        </div>
      ) : null}

      <div className="mt-8">
        <Table>
          <THead>
            <TR>
              <TH>Description</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Unit</TH>
              {hasLineDiscount(detail.lines) ? (
                <TH className="text-right">Discount</TH>
              ) : null}
              <TH className="text-right">Amount</TH>
            </TR>
          </THead>
          <TBody>
            {detail.lines.map((l) => (
              <TR key={l.id}>
                <TD>{l.description}</TD>
                <TD className="text-right">{formatQuantity(l.quantity)}</TD>
                <TD className="text-right">{formatMoney(l.unitPricePence, detail.quote.currency)}</TD>
                {hasLineDiscount(detail.lines) ? (
                  <TD className="text-right">
                    {formatDiscountPercent(l.discountPercent)}
                  </TD>
                ) : null}
                <TD className="text-right">{formatMoney(lineNetPence(l), detail.quote.currency)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
