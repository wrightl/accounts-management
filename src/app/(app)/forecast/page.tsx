import type { Metadata } from "next";
import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { ForecastView } from "@/components/forecast/forecast-view";
import { formatIsoDateUk } from "@/lib/dates";
import { getForecastInputs } from "@/lib/forecast/queries";
import { formatGBP } from "@/lib/money";

export const metadata: Metadata = { title: "Cash forecast" };

const SPEND_BASIS = {
  expenses: "the average of expenses recorded over the last 12 weeks",
  bank: "the average money out of the bank over the last 12 weeks",
  none: "nothing yet, as there are no expenses or bank transactions",
} as const;

export default async function ForecastPage() {
  const { companyId, entityType } = await guardTenantPage("reports:read");
  const inputs = await getForecastInputs(companyId);
  const isLtd = entityType === "limited_company";

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-2xl font-semibold">Cash forecast</h1>
      <p className="mt-1 text-muted">
        Cash at the end of each of the next 13 weeks, from the money you&apos;re owed and the
        bills you know about.
      </p>

      {!inputs.cash.known ? (
        <p className="mt-6 rounded-xl bg-wash px-4 py-3 text-sm">
          Alfa doesn&apos;t know the bank balance yet, so this starts from £0.{" "}
          <Link href="/transactions" className="underline">
            Import a bank statement
          </Link>{" "}
          with a balance column, or set opening cash in{" "}
          <Link href="/settings/business" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-6">
        <ForecastView
          openingCashPence={inputs.cash.known ? inputs.cash.cashPence : 0}
          cashKnown={inputs.cash.known}
          firstWeekStart={inputs.firstWeekStart}
          events={inputs.events}
          weeklySpendPence={inputs.weeklySpendPence}
          clients={inputs.clients}
        />
      </div>

      <section className="mt-10 max-w-2xl text-sm text-muted">
        <h2 className="font-display text-lg font-semibold text-foreground">What&apos;s included</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Starting cash:{" "}
            {inputs.cash.known
              ? `${formatGBP(inputs.cash.cashPence)} ${
                  inputs.cash.source === "statement"
                    ? `from the latest statement balance on ${formatIsoDateUk(inputs.cash.asOf)}`
                    : `from opening cash plus transactions to ${formatIsoDateUk(inputs.cash.asOf)}`
                }`
              : "unknown"}
            .
          </li>
          <li>Unpaid invoices, on their due date. Overdue ones are counted in the first week.</li>
          <li>Order milestones and recurring invoices, paid after your usual payment terms.</li>
          <li>VAT returns, with this quarter projected from the VAT so far.</li>
          {isLtd ? <li>Corporation tax and dividends declared for future dates.</li> : null}
          <li>Reimbursements owed to the team, in the first week.</li>
          <li>
            Regular spending of {formatGBP(inputs.weeklySpendPence)} a week:{" "}
            {SPEND_BASIS[inputs.spendBasis]}.
          </li>
        </ul>
        <p className="mt-3">
          Not included: payroll and PAYE, and supplier bills not yet recorded in Alfa. Use the
          what-ifs to add them.
        </p>
      </section>
    </div>
  );
}
