import type { Metadata } from "next";
import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { formatIsoDateUk, monthName } from "@/lib/dates";
import { getDeadlines, type DeadlineRow } from "@/lib/deadlines/queries";
import type { DeadlineStatus } from "@/lib/deadlines/calc";
import { DeadlineDoneButton } from "@/components/deadlines/deadline-done-button";
import { VatQuartersForm } from "@/components/deadlines/vat-quarters-form";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Deadlines" };

const STATUS_STYLES: Record<DeadlineStatus, string> = {
  overdue: "bg-brand text-navy",
  due_soon: "bg-accent/30 text-navy",
  upcoming: "bg-wash text-muted",
  done: "bg-success/15 text-success",
};

function statusText(d: DeadlineRow): string {
  if (d.status === "done") return "Done";
  if (d.daysLeft < 0) return `${-d.daysLeft} day${d.daysLeft === -1 ? "" : "s"} late`;
  if (d.daysLeft === 0) return "Due today";
  return `In ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"}`;
}

export default async function DeadlinesPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const [canWrite, canManage] = await Promise.all([
    hasPermission("accounts:write"),
    hasPermission("settings:manage"),
  ]);
  const { deadlines, settings, missingCompaniesHouse } = await getDeadlines(companyId);
  const isLtd = settings.entityType === "limited_company";
  // Admins edit Companies House details; everyone else can view them.
  const companiesHouseHref = canManage
    ? "/settings/business#companies-house"
    : "/company#companies-house";

  const open = deadlines.filter((d) => d.status !== "done");
  const overdue = open.filter((d) => d.status === "overdue");
  const dueSoon = open.filter((d) => d.status === "due_soon");
  const next = open.find((d) => d.status !== "overdue") ?? null;

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Deadlines</h1>
      <p className="mt-1 max-w-3xl text-muted">
        {isLtd
          ? "Companies House and HMRC deadlines for the next year, worked out from your year end, VAT quarters and Companies House record."
          : "HMRC deadlines for the next year, worked out from the tax year and your VAT quarters."}{" "}
        Mark each one done once it&apos;s filed or paid.
      </p>

      {missingCompaniesHouse ? (
        <p className="mt-6 rounded-xl bg-wash px-4 py-3 text-sm">
          Your confirmation statement isn&apos;t shown because Alfa doesn&apos;t know your
          incorporation date.{" "}
          <Link href={companiesHouseHref} className="underline">
            {canManage ? "Add your Companies House details" : "See Companies House details"}
          </Link>
          .
        </p>
      ) : null}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardTitle>Overdue</CardTitle>
          <CardValue className={overdue.length ? "text-destructive" : undefined}>
            {overdue.length}
          </CardValue>
        </Card>
        <Card>
          <CardTitle>Due in the next 30 days</CardTitle>
          <CardValue>{dueSoon.length}</CardValue>
        </Card>
        <Card>
          <CardTitle>Next deadline</CardTitle>
          {next ? (
            <>
              <CardValue>{formatIsoDateUk(next.dueDate)}</CardValue>
              <p className="mt-1 text-sm text-muted">{next.label}</p>
            </>
          ) : (
            <CardValue>—</CardValue>
          )}
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Calendar</h2>
        {deadlines.length === 0 ? (
          <p className="mt-4 text-sm text-muted">
            Nothing due in the next year. Register for VAT in Settings to see VAT returns here.
          </p>
        ) : (
          <div className="mt-4">
            <Table>
              <THead>
                <TR>
                  <TH>Due</TH>
                  <TH>Deadline</TH>
                  <TH>Status</TH>
                  {canWrite ? <TH className="text-right">Action</TH> : null}
                </TR>
              </THead>
              <TBody>
                {deadlines.map((d) => (
                  <TR key={`${d.kind}:${d.dueDate}`}>
                    <TD className="whitespace-nowrap align-top tabular-nums">
                      {formatIsoDateUk(d.dueDate)}
                    </TD>
                    <TD className="align-top">
                      <p className={cn("font-medium", d.status === "done" && "text-muted")}>
                        {d.label}
                      </p>
                      <p className="text-sm text-muted">
                        {[d.period, d.source === "companies_house" ? "Date from Companies House" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {d.status !== "done" ? (
                        <p className="mt-1 max-w-xl text-xs text-muted">{d.detail}</p>
                      ) : d.filedOn ? (
                        <p className="mt-1 text-xs text-muted">
                          Marked done {formatIsoDateUk(d.filedOn)}
                          {d.filedByName ? ` by ${d.filedByName}` : ""}
                        </p>
                      ) : null}
                    </TD>
                    <TD className="align-top">
                      <span
                        className={cn(
                          "inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium",
                          STATUS_STYLES[d.status],
                        )}
                      >
                        {statusText(d)}
                      </span>
                    </TD>
                    {canWrite ? (
                      <TD className="text-right align-top">
                        <DeadlineDoneButton
                          kind={d.kind}
                          dueDate={d.dueDate}
                          done={d.status === "done"}
                          label={d.label}
                        />
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>

      <section className="mt-10 max-w-3xl space-y-4 text-sm text-muted">
        <h2 className="font-display text-lg font-semibold text-foreground">How these are worked out</h2>
        {isLtd ? (
          <p>
            From a year end of {monthName(settings.financialYearEndMonth)}: accounts are due at
            Companies House 9 months after it, corporation tax 9 months and a day after, and the
            CT600 12 months after. Companies House&apos;s own dates replace these where Alfa has
            them, which covers first accounts and changed year ends. Large companies paying
            corporation tax in instalments aren&apos;t covered.{" "}
            {canManage ? (
              <Link href={companiesHouseHref} className="underline">
                Companies House details
              </Link>
            ) : null}
          </p>
        ) : (
          <p>
            Self Assessment returns and payments are due on 31 January after the tax year ends on 5
            April, with a second payment on account on 31 July.
          </p>
        )}
        {settings.vatRegistered ? (
          <>
            <p>
              VAT returns and payments are due one month and seven days after each quarter ends.
            </p>
            {canManage ? <VatQuartersForm vatQuarterEndMonth={settings.vatQuarterEndMonth} /> : null}
          </>
        ) : null}
      </section>
    </div>
  );
}
