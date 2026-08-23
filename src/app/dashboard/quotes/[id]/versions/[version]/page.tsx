import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { guardPage } from "@/lib/auth";
import { getQuoteVersionDetail } from "@/lib/quotes/queries";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatGBP, lineNetPence } from "@/lib/money";
import { clientDisplayName } from "@/lib/clients/display";
import { isDatabaseConfigured } from "@/env";

export default async function QuoteVersionPage({
  params,
}: {
  params: Promise<{ id: string; version: string }>;
}) {
  await guardPage("accounts:read");
  const { id, version: versionParam } = await params;
  const version = Number.parseInt(versionParam, 10);
  if (!Number.isFinite(version) || version < 1) notFound();

  if (!isDatabaseConfigured()) notFound();
  const detail = await getQuoteVersionDetail(id, version);
  if (!detail) notFound();
  if (detail.isCurrent) {
    redirect(`/dashboard/quotes/${id}`);
  }

  return (
    <div>
      <div className="mb-6">
        <Link href={`/dashboard/quotes/${id}`} className={buttonClasses("ghost")}>
          ← Current quote
        </Link>
      </div>

      <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Viewing {detail.quote.versionLabel} — not the current version (
        {detail.currentVersion ? `v${detail.currentVersion}` : "unknown"}).
      </div>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">
            {detail.quote.reference}
          </h1>
          <p className="mt-1 capitalize text-muted">
            {detail.quote.status} · {clientDisplayName(detail.client)}
          </p>
          <p className="mt-1 text-sm text-muted">
            Issued {detail.quote.issueDate}
            {detail.quote.validUntil ? ` · Valid until ${detail.quote.validUntil}` : null}
          </p>
        </div>
        <Card className="min-w-[140px]">
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
