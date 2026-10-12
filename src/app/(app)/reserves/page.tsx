import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { OpeningBalancesForm } from "@/components/ledger/opening-balances-form";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { financialYearStartDate, formatIsoDateUk } from "@/lib/dates";
import { addDays, ctPaymentDueDate } from "@/lib/ledger/corporation-tax";
import {
  getDirectorLoanBalances,
  getReservesPosition,
  listDirectorOpeningBalances,
} from "@/lib/ledger/queries";
import { formatGBP } from "@/lib/money";

export const metadata: Metadata = { title: "Tax & reserves" };

const BAND_LABEL = {
  none: "No tax on a loss",
  small: "Small profits rate, 19%",
  marginal: "Marginal relief, between 19% and 25%",
  main: "Main rate, 25%",
} as const;

function percent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export default async function ReservesPage() {
  const { companyId, entityType } = await guardTenantPage("reports:read");
  if (entityType !== "limited_company") redirect("/reports");
  const canSetOpening = await hasPermission("books:lock");

  const position = await getReservesPosition(companyId);
  const { currentYear, settings } = position;
  const lastYearEnd = addDays(
    financialYearStartDate(settings.financialYearEndMonth, position.asOf),
    -1,
  );
  // Corporation tax is due 9 months and 1 day after the year end.
  const taxDue = ctPaymentDueDate(currentYear.end);

  const [directors, openings] = canSetOpening
    ? await Promise.all([
        getDirectorLoanBalances(companyId, position.asOf, settings.openingBalancesAsAt),
        listDirectorOpeningBalances(companyId),
      ])
    : [[], []];
  const openingByDirector = new Map(openings.map((o) => [o.directorUserId, o.amountPence]));

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Tax &amp; reserves</h1>
      <p className="mt-1 max-w-2xl text-muted">
        A running estimate of corporation tax and of the profit the company can pay out as
        dividends. Your accountant finalises the real figures.
      </p>

      {!position.hasOpeningBalances ? (
        <p className="mt-6 max-w-2xl rounded-xl bg-wash px-4 py-3 text-sm">
          These figures start from the first records in Alfa. If the company traded before
          then, add the retained earnings from its last balance sheet below
          {canSetOpening ? "" : " (an admin or your accountant can do this)"}, or reserves
          will be understated.
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Available to distribute</CardTitle>
          <CardValue>{formatGBP(position.availablePence)}</CardValue>
          <p className="mt-1 text-xs text-muted">After dividends declared this year</p>
        </Card>
        <Card>
          <CardTitle>Profit this year to date</CardTitle>
          <CardValue>{formatGBP(currentYear.profitPence)}</CardValue>
          <p className="mt-1 text-xs text-muted">
            {formatIsoDateUk(currentYear.start)} to {formatIsoDateUk(position.asOf)}
          </p>
        </Card>
        <Card>
          <CardTitle>Corporation tax so far</CardTitle>
          <CardValue>{formatGBP(currentYear.tax.taxPence)}</CardValue>
          <p className="mt-1 text-xs text-muted">Due {formatIsoDateUk(taxDue)}</p>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Corporation tax this year</h2>
        <dl className="mt-3 grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted">Profit before tax to date</dt>
          <dd className="text-right tabular-nums">{formatGBP(currentYear.profitPence)}</dd>
          {currentYear.lossesUsedPence > 0 ? (
            <>
              <dt className="text-muted">Losses brought forward</dt>
              <dd className="text-right tabular-nums">
                −{formatGBP(currentYear.lossesUsedPence)}
              </dd>
            </>
          ) : null}
          <dt className="text-muted">Taxable profit</dt>
          <dd className="text-right tabular-nums">{formatGBP(currentYear.taxablePence)}</dd>
          <dt className="text-muted">Rate</dt>
          <dd className="text-right">
            {BAND_LABEL[currentYear.tax.band]}
            {currentYear.tax.band === "marginal"
              ? ` (${percent(currentYear.tax.effectiveRate)} overall)`
              : ""}
          </dd>
          <dt className="font-medium">Estimated tax</dt>
          <dd className="text-right font-medium tabular-nums">
            {formatGBP(currentYear.tax.taxPence)}
          </dd>
        </dl>
        <p className="mt-3 max-w-2xl text-xs text-muted">
          Worked out on accounting profit for {formatIsoDateUk(currentYear.start)} to{" "}
          {formatIsoDateUk(currentYear.end)} at current rates
          {settings.associatedCompanies > 0
            ? `, with the limits shared across ${settings.associatedCompanies + 1} associated companies`
            : ""}
          . It doesn&apos;t include capital allowances or costs that aren&apos;t allowed for
          tax, such as client entertaining, so the real figure can differ.
        </p>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Retained earnings by year</h2>
        <div className="mt-3">
          <Table>
            <THead>
              <TR>
                <TH>Year</TH>
                <TH className="text-right">Brought forward</TH>
                <TH className="text-right">Profit</TH>
                <TH className="text-right">Tax</TH>
                <TH className="text-right">Dividends</TH>
                <TH className="text-right">Carried forward</TH>
              </TR>
            </THead>
            <TBody>
              {position.years.map((y) => (
                <TR key={y.start}>
                  <TD>
                    Year to {formatIsoDateUk(y.end)}
                    {y.current ? <span className="text-muted"> (so far)</span> : null}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {formatGBP(y.openingReservesPence)}
                  </TD>
                  <TD className="text-right tabular-nums">{formatGBP(y.profitPence)}</TD>
                  <TD className="text-right tabular-nums">
                    {y.tax.taxPence ? `−${formatGBP(y.tax.taxPence)}` : formatGBP(0)}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {y.dividendsPence ? `−${formatGBP(y.dividendsPence)}` : formatGBP(0)}
                  </TD>
                  <TD className="text-right font-medium tabular-nums">
                    {formatGBP(y.closingReservesPence)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
        {position.hasOpeningBalances ? (
          <p className="mt-3 text-xs text-muted">
            Starts from retained earnings of {formatGBP(settings.openingReservesPence ?? 0)} at{" "}
            {formatIsoDateUk(settings.openingBalancesAsAt)}.
          </p>
        ) : null}
        <p className="mt-1 text-xs text-muted">
          Tax for past years is estimated the same way. See{" "}
          <Link href="/directors-loans" className="underline">
            director&apos;s loans
          </Link>{" "}
          for money directors owe or are owed.
        </p>
      </section>

      {canSetOpening ? (
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5">
          <h2 className="font-display text-lg font-semibold">Opening balances</h2>
          <p className="mb-4 mt-1 max-w-2xl text-sm text-muted">
            For a company that traded before its records in Alfa. Enter the figures from the
            last filed accounts. Records dated on or before this date are then left out of the
            reserves and director&apos;s loan figures. Clear the date to remove them.
          </p>
          <OpeningBalancesForm
            openingBalancesAsAt={settings.openingBalancesAsAt}
            openingReservesPence={settings.openingReservesPence}
            associatedCompanies={settings.associatedCompanies}
            suggestedDate={lastYearEnd}
            directors={directors.map((d) => ({
              userId: d.userId,
              name: d.name,
              openingPence: openingByDirector.get(d.userId) ?? 0,
            }))}
          />
        </section>
      ) : null}
    </div>
  );
}
