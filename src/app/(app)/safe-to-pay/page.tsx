import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { SafeToPayAssumptionsForm } from "@/components/safe-to-pay/assumptions-form";
import { buttonClasses } from "@/components/ui/button";
import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import { getSafeToPay } from "@/lib/safe-to-pay/queries";

export const metadata: Metadata = { title: "Safe to pay yourself" };

function Row({
  label,
  pence,
  sign,
  strong,
  children,
}: {
  label: string;
  pence: number;
  sign?: "−" | "+";
  strong?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <>
      <dt className={strong ? "font-medium" : "text-muted"}>
        {label}
        {children}
      </dt>
      <dd className={`text-right tabular-nums ${strong ? "font-medium" : ""}`}>
        {sign && pence ? sign : ""}
        {formatGBP(pence)}
      </dd>
    </>
  );
}

function Parts({ parts }: { parts: Array<{ label: string; pence: number }> }) {
  const shown = parts.filter((p) => p.pence !== 0);
  if (shown.length < 2) return null;
  return (
    <span className="block text-xs">
      {shown.map((p) => `${p.label}: ${formatGBP(p.pence)}`).join(" · ")}
    </span>
  );
}

export default async function SafeToPayPage() {
  const { companyId, entityType } = await guardTenantPage("reports:read");
  if (entityType !== "limited_company") redirect("/reports");
  const [canManage, canDeclare] = await Promise.all([
    hasPermission("settings:manage"),
    hasPermission("accounts:write"),
  ]);
  const data = await getSafeToPay(companyId);
  const { result, cash } = data;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">Safe to pay yourself</h1>
      <p className="mt-1 text-muted">
        How much the company could pay out in dividends today without running short of cash or
        paying more than its profits allow.
      </p>

      {!cash.known ? (
        <p className="mt-6 rounded-xl bg-wash px-4 py-3 text-sm">
          Alfa doesn&apos;t know the company&apos;s bank balance yet.{" "}
          <Link href="/transactions" className="underline">
            Import a bank statement
          </Link>{" "}
          that has a balance column, or set opening cash in{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          .
        </p>
      ) : null}

      <section className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-muted">Safe to pay today</p>
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums">
            {formatGBP(result.safeNowPence)}
          </p>
          <p className="mt-2 text-sm text-muted">
            {result.limitedBy === "reserves"
              ? "Limited by profits available to distribute."
              : "Limited by cash after what the company owes."}
          </p>
          {canDeclare && result.safeNowPence > 0 ? (
            <Link
              href={`/dividends/new?amount=${(result.safeNowPence / 100).toFixed(2)}`}
              className={`${buttonClasses("primary")} mt-4`}
            >
              Declare a dividend
            </Link>
          ) : null}
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5">
          <p className="text-sm text-muted">By {formatIsoDateUk(data.until)}, if clients pay on time</p>
          <p className="mt-1 font-display text-4xl font-semibold tabular-nums">
            {formatGBP(result.safeLaterPence)}
          </p>
          <p className="mt-2 text-sm text-muted">
            Adds {formatGBP(result.expectedInPence)} expected in.
            {result.laterLimitedBy === "reserves" ? " Limited by profits available." : ""}
          </p>
        </div>
      </section>

      {data.split.length > 1 ? (
        <p className="mt-4 text-sm text-muted">
          Split by shareholding today:{" "}
          {data.split.map((s) => `${s.name} ${formatGBP(s.amountPence)}`).join(", ")}.
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">How it&apos;s worked out</h2>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-sm">
          <Row label="Cash at bank" pence={cash.known ? cash.cashPence : 0}>
            {cash.known ? (
              <span className="block text-xs">
                {cash.source === "statement"
                  ? `From the latest statement balance, ${formatIsoDateUk(cash.asOf)}`
                  : `Opening cash plus transactions to ${formatIsoDateUk(cash.asOf)}`}
              </span>
            ) : null}
          </Row>
          {data.vatRegistered ? (
            <Row label="VAT owed" pence={result.vatOwedPence} sign="−">
              <Parts parts={data.vatParts} />
            </Row>
          ) : null}
          <Row label="Corporation tax" pence={result.corporationTaxPence} sign="−">
            <Parts parts={data.taxParts} />
          </Row>
          <Row label="Reimbursements owed to the team" pence={result.billsDuePence} sign="−" />
          <Row
            label={`Buffer: ${data.bufferMonths} month${data.bufferMonths === 1 ? "" : "s"} of spending`}
            pence={result.bufferPence}
            sign="−"
          >
            <span className="block text-xs">
              Average {formatGBP(data.monthlySpendPence)} a month over the last 3 months
            </span>
          </Row>
          <Row label="Free cash" pence={result.freeCashPence} strong />
          <Row label="Profits available to distribute" pence={result.reservesPence}>
            <span className="block text-xs">
              <Link href="/reserves" className="underline">
                Tax &amp; reserves
              </Link>
              {data.hasOpeningBalances ? "" : " (add opening balances if you traded before Alfa)"}
            </span>
          </Row>
          <Row label="Safe to pay today" pence={result.safeNowPence} strong>
            <span className="block text-xs font-normal text-muted">The lower of the two</span>
          </Row>
        </dl>

        <h3 className="mt-8 text-sm font-medium">
          Expected in by {formatIsoDateUk(data.until)}
        </h3>
        <dl className="mt-2 grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          {data.expectedParts.map((p) => (
            <Row key={p.label} label={p.label} pence={p.pence} />
          ))}
        </dl>

        <p className="mt-6 text-xs text-muted">
          An estimate to help you decide, not advice. It assumes last quarter&apos;s VAT and last
          year&apos;s corporation tax are unpaid until their deadlines, and doesn&apos;t include
          PAYE, supplier bills not yet in Alfa, or money the company owes directors. Check with
          your accountant before paying a large dividend.
        </p>
      </section>

      {canManage ? (
        <section className="mt-10 rounded-2xl border border-border bg-surface p-5">
          <h2 className="mb-4 font-display text-lg font-semibold">Assumptions</h2>
          <SafeToPayAssumptionsForm
            vatRegistered={data.vatRegistered}
            vatQuarterEndMonth={data.vatQuarterEndMonth}
            bufferMonths={data.bufferMonths}
          />
        </section>
      ) : null}
    </div>
  );
}
