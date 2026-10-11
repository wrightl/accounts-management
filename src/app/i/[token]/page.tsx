import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { markPublicInvoiceViewed } from "@/actions/public-invoices";
import { PublicInvoicePayButton } from "@/components/invoices/public-invoice-pay-button";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { clientDisplayName } from "@/lib/clients/display";
import { getPublicInvoiceByToken } from "@/lib/invoices/public-queries";
import { storedStatus } from "@/lib/invoices/status";
import { canPayInvoiceOnline } from "@/lib/payments/online-status";
import { getOrCreateCompanySettings } from "@/lib/settings/queries";
import {
  formatDiscountPercent,
  formatGBP,
  formatQuantity,
  hasLineDiscount,
  lineNetPence,
} from "@/lib/money";

export const metadata: Metadata = {
  title: "Invoice",
  robots: { index: false, follow: false },
};

function Notice({ tone, children }: { tone: "success" | "muted"; children: React.ReactNode }) {
  return (
    <p
      className={
        tone === "success"
          ? "rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm text-foreground"
          : "rounded-xl bg-wash px-4 py-3 text-sm text-muted"
      }
    >
      {children}
    </p>
  );
}

export default async function PublicInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ payment?: string; accepted?: string }>;
}) {
  const { token } = await params;
  const { payment, accepted } = await searchParams;
  const data = await getPublicInvoiceByToken(token);
  if (!data) notFound();
  if (data.suspended) {
    return (
      <main className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-16">
        <h1 className="font-display text-2xl font-semibold">Unavailable</h1>
        <p className="mt-2 text-muted">This invoice is no longer available.</p>
      </main>
    );
  }

  await markPublicInvoiceViewed(token);

  const { detail, company } = data;
  const { invoice, client, lines } = detail;
  const stored = storedStatus(invoice.status);
  const settings = await getOrCreateCompanySettings(invoice.companyId);
  const amountDuePence = detail.balancePence;
  const payable = canPayInvoiceOnline({
    status: invoice.status,
    amountDuePence,
    onlinePayments: company.onlinePayments,
  });
  const hasBankDetails = Boolean(settings.sortCode && settings.accountNumber);

  return (
    <main className="mx-auto flex min-h-full max-w-3xl flex-col px-4 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{company.name}</p>
          <h1 className="mt-1 font-display text-3xl font-semibold">
            Invoice {invoice.number}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {invoice.issueDate ? `Issued ${invoice.issueDate}` : null}
            {invoice.dueDate && stored === "sent" ? ` · Due ${invoice.dueDate}` : null}
          </p>
        </div>
        <Card className="min-w-[160px]">
          <CardTitle>{stored === "sent" ? "Amount due" : "Total"}</CardTitle>
          <CardValue>
            {stored === "sent" ? formatGBP(amountDuePence) : invoice.grossFormatted}
          </CardValue>
        </Card>
      </header>

      <div className="mb-6">
        {stored === "void" ? (
          <Notice tone="muted">This invoice has been cancelled. Nothing is owed on it.</Notice>
        ) : stored === "paid" || amountDuePence === 0 ? (
          <Notice tone="success">This invoice is paid. Thank you.</Notice>
        ) : payment === "success" ? (
          <Notice tone="success">
            Thank you. Your payment is being confirmed and this page will show it as paid
            shortly.
          </Notice>
        ) : payment === "cancelled" ? (
          <Notice tone="muted">Payment cancelled. You haven&apos;t been charged.</Notice>
        ) : accepted ? (
          <Notice tone="success">
            Thank you for accepting the quote. This invoice is for the first payment.
          </Notice>
        ) : null}
      </div>

      <p className="mb-4 text-sm text-muted">Billed to {clientDisplayName(client)}</p>

      <Table>
        <THead>
          <TR>
            <TH>Description</TH>
            <TH className="text-right">Qty</TH>
            <TH className="text-right">Unit</TH>
            {hasLineDiscount(lines) ? <TH className="text-right">Discount</TH> : null}
            {invoice.vatPence > 0 ? <TH className="text-right">VAT</TH> : null}
            <TH className="text-right">Amount</TH>
          </TR>
        </THead>
        <TBody>
          {lines.map((l) => (
            <TR key={l.id}>
              <TD>{l.description}</TD>
              <TD className="text-right">{formatQuantity(l.quantity)}</TD>
              <TD className="text-right">{formatGBP(l.unitPricePence)}</TD>
              {hasLineDiscount(lines) ? (
                <TD className="text-right">{formatDiscountPercent(l.discountPercent)}</TD>
              ) : null}
              {invoice.vatPence > 0 ? <TD className="text-right">{l.vatRate}%</TD> : null}
              <TD className="text-right">{formatGBP(lineNetPence(l))}</TD>
            </TR>
          ))}
        </TBody>
      </Table>

      <div className="mt-4 space-y-1 text-right text-sm">
        {invoice.vatPence > 0 ? (
          <>
            <p className="text-muted">Net {invoice.netFormatted}</p>
            <p className="text-muted">VAT {formatGBP(invoice.vatPence)}</p>
          </>
        ) : null}
        <p className="font-display text-lg font-semibold">Total {invoice.grossFormatted}</p>
        {detail.creditedPence > 0 ? (
          <p className="text-muted">Credited {detail.creditedFormatted}</p>
        ) : null}
        {detail.paidPence > 0 ? <p className="text-muted">Paid {detail.paidFormatted}</p> : null}
      </div>

      {invoice.notes ? (
        <section className="mt-8">
          <h2 className="font-display text-lg font-semibold">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{invoice.notes}</p>
        </section>
      ) : null}

      <section className="mt-10 flex flex-col gap-6 border-t border-border pt-8 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {payable && payment !== "success" ? (
            <PublicInvoicePayButton
              token={token}
              amountFormatted={formatGBP(amountDuePence)}
            />
          ) : null}
          {stored === "sent" && amountDuePence > 0 && hasBankDetails ? (
            <div className={payable ? "mt-6 text-sm" : "text-sm"}>
              <h2 className="font-display text-base font-semibold">
                {payable ? "Or pay by bank transfer" : "Pay by bank transfer"}
              </h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-muted">
                {settings.bankAccountName ? (
                  <>
                    <dt>Account name</dt>
                    <dd className="text-foreground">{settings.bankAccountName}</dd>
                  </>
                ) : null}
                <dt>Sort code</dt>
                <dd className="text-foreground tabular-nums">{settings.sortCode}</dd>
                <dt>Account number</dt>
                <dd className="text-foreground tabular-nums">{settings.accountNumber}</dd>
                <dt>Reference</dt>
                <dd className="text-foreground">{invoice.number}</dd>
              </dl>
            </div>
          ) : null}
        </div>
        <a
          href={`/i/${encodeURIComponent(token)}/pdf`}
          className={buttonClasses("secondary")}
        >
          Download PDF
        </a>
      </section>
    </main>
  );
}
