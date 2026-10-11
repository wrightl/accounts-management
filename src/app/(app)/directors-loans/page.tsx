import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import {
  DeleteDirectorLoanEntryButton,
  DirectorLoanEntryForm,
} from "@/components/ledger/director-loan-entry-form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { formatIsoDateUk, todayIsoDate } from "@/lib/dates";
import type { DirectorLoanWarning } from "@/lib/ledger/director-loan";
import { getDirectorLoanAccounts, listDirectorLoanEntries } from "@/lib/ledger/queries";
import { formatGBP } from "@/lib/money";

export const metadata: Metadata = { title: "Director's loans" };

function balanceLabel(pence: number): string {
  if (pence > 0) return `Company owes ${formatGBP(pence)}`;
  if (pence < 0) return `Overdrawn by ${formatGBP(-pence)}`;
  return "Clear";
}

function WarningText({ warning }: { warning: DirectorLoanWarning }) {
  switch (warning.kind) {
    case "s455_due":
      return (
        <>
          {formatGBP(warning.outstandingPence)} was still owed at the year end on{" "}
          {formatIsoDateUk(warning.yearEnd)}. Repay it by {formatIsoDateUk(warning.repayBy)} or
          the company pays {formatGBP(warning.taxPence)} of section 455 tax (33.75%), refunded
          only once the loan is repaid.
        </>
      );
    case "overdrawn":
      return (
        <>
          If it&apos;s still overdrawn at the year end on {formatIsoDateUk(warning.yearEnd)} and
          not repaid by {formatIsoDateUk(warning.repayBy)}, the company pays section 455 tax of
          about {formatGBP(warning.taxPence)}.
        </>
      );
    case "benefit_in_kind":
      return (
        <>
          Over £10,000 owed by a director is a benefit in kind unless interest is charged at
          HMRC&apos;s official rate. It goes on a P11D: check with your accountant.
        </>
      );
  }
}

const KIND_LABEL = { drawing: "Took out", paid_in: "Paid in", opening: "Opening" } as const;

export default async function DirectorsLoansPage() {
  const { companyId, entityType } = await guardTenantPage("accounts:read");
  if (entityType !== "limited_company") redirect("/dashboard");
  const canWrite = await hasPermission("accounts:write");
  const today = todayIsoDate();

  const [accounts, entries] = await Promise.all([
    getDirectorLoanAccounts(companyId, today),
    listDirectorLoanEntries(companyId),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Director&apos;s loans</h1>
      <p className="mt-1 max-w-2xl text-muted">
        What each director owes the company, or is owed by it. Expenses a director paid
        personally add to what the company owes them; reimbursements and money they take out
        reduce it.
      </p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {accounts.directors.map((d) => (
          <section key={d.userId} className="rounded-2xl border border-border bg-surface p-5">
            <h2 className="text-sm font-medium text-muted">{d.name}</h2>
            <p
              className={
                d.balancePence < 0
                  ? "mt-1 font-display text-2xl font-semibold text-destructive"
                  : "mt-1 font-display text-2xl font-semibold"
              }
            >
              {balanceLabel(d.balancePence)}
            </p>
            <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 text-sm">
              {d.openingPence ? (
                <>
                  <dt className="text-muted">Opening balance</dt>
                  <dd className="text-right tabular-nums">{formatGBP(d.openingPence)}</dd>
                </>
              ) : null}
              <dt className="text-muted">Expenses paid personally</dt>
              <dd className="text-right tabular-nums">{formatGBP(d.paidPersonallyPence)}</dd>
              <dt className="text-muted">Reimbursed</dt>
              <dd className="text-right tabular-nums">−{formatGBP(d.reimbursedPence)}</dd>
              <dt className="text-muted">Taken out</dt>
              <dd className="text-right tabular-nums">−{formatGBP(d.drawingsPence)}</dd>
              <dt className="text-muted">Paid in</dt>
              <dd className="text-right tabular-nums">{formatGBP(d.paidInPence)}</dd>
            </dl>
            {d.warnings.length > 0 ? (
              <ul className="mt-4 space-y-2">
                {d.warnings.map((w) => (
                  <li
                    key={w.kind}
                    className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                  >
                    <WarningText warning={w} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ))}
      </div>
      {accounts.directors.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          Directors appear here once they have an admin or co-founder login.
        </p>
      ) : null}

      {canWrite && accounts.directors.length > 0 ? (
        <section className="mt-10 max-w-2xl">
          <h2 className="font-display text-lg font-semibold">Add an entry</h2>
          <p className="mb-4 mt-1 text-sm text-muted">
            For money that isn&apos;t an expense: a director taking money for personal use, or
            lending money to the company. Reimbursements are added automatically.
          </p>
          <DirectorLoanEntryForm
            directors={accounts.directors.map((d) => ({ userId: d.userId, name: d.name }))}
            today={today}
          />
        </section>
      ) : null}

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Entries</h2>
        {entries.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No entries yet.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Director</TH>
                  <TH>Type</TH>
                  <TH>Note</TH>
                  <TH className="text-right">Amount</TH>
                  {canWrite ? <TH className="sr-only">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {entries.map((e) => (
                  <TR key={e.id}>
                    <TD>{formatIsoDateUk(e.entryDate)}</TD>
                    <TD>{e.directorName}</TD>
                    <TD>{KIND_LABEL[e.kind]}</TD>
                    <TD className="text-muted">{e.description}</TD>
                    <TD className="text-right tabular-nums">{formatGBP(e.amountPence)}</TD>
                    {canWrite ? (
                      <TD className="text-right">
                        <DeleteDirectorLoanEntryButton id={e.id} />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
        {accounts.settings.openingBalancesAsAt ? (
          <p className="mt-3 text-xs text-muted">
            Opening balances are at {formatIsoDateUk(accounts.settings.openingBalancesAsAt)}. Set
            them on{" "}
            <Link href="/reserves" className="underline">
              Tax &amp; reserves
            </Link>
            .
          </p>
        ) : null}
      </section>
    </div>
  );
}
