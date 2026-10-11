import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, Circle } from "lucide-react";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { CloseWeekButton } from "@/components/close/close-week-button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  getWeeklyCloseChecklist,
  listWeeklyCloses,
  type CloseItemKey,
} from "@/lib/close/checklist";
import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";

export const metadata: Metadata = { title: "Weekly close" };

function formatClosedAt(d: Date): string {
  return d.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/London",
  });
}

function openCount(snapshot: unknown): number {
  const counts = snapshot as Partial<Record<CloseItemKey, number>>;
  return Object.values(counts).filter((n) => (n ?? 0) > 0).length;
}

export default async function WeeklyClosePage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const [checklist, closes] = await Promise.all([
    getWeeklyCloseChecklist(companyId),
    listWeeklyCloses(companyId),
  ]);
  const last = closes[0] ?? null;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Weekly close</h1>
          <p className="mt-1 text-muted">
            Fifteen minutes a week keeps the books up to date. Work down the list, then close
            the week.
          </p>
        </div>
        {canWrite ? <CloseWeekButton outstanding={checklist.outstanding} /> : null}
      </div>

      <div className="mt-6 rounded-2xl border border-border bg-surface p-5">
        <p className="font-display text-lg font-semibold">
          {checklist.bankReconciledThrough
            ? `Bank reconciled to ${formatIsoDateUk(checklist.bankReconciledThrough)}`
            : "No bank transactions imported yet"}
        </p>
        <p className="mt-1 text-sm text-muted">
          {last
            ? `Last closed ${formatClosedAt(last.closedAt)}${last.closedByName ? ` by ${last.closedByName}` : ""}.`
            : "The week hasn't been closed yet."}{" "}
          {checklist.bankReconciledThrough ? (
            <>
              Import a newer{" "}
              <Link href="/transactions" className="underline">
                bank statement
              </Link>{" "}
              to move this date on.
            </>
          ) : null}
        </p>
      </div>

      <ol className="mt-6 space-y-3">
        {checklist.items.map((item) => {
          const done = item.count === 0;
          return (
            <li
              key={item.key}
              className="flex items-start gap-3 rounded-xl border border-border bg-surface px-4 py-3"
            >
              {done ? (
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
              ) : (
                <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className={done ? "text-muted" : "font-medium"}>
                  {done ? item.doneLabel : item.label}
                  <span className="sr-only">{done ? " (done)" : " (to do)"}</span>
                </p>
                {!done ? (
                  <p className="text-sm text-muted">
                    {item.count}
                    {item.amountPence ? ` · ${formatGBP(item.amountPence)}` : ""}
                  </p>
                ) : null}
                {item.key === "milestones" && checklist.milestones.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {checklist.milestones.slice(0, 5).map((m) => (
                      <li key={`${m.orderId}:${m.label}`}>
                        <Link href={`/orders/${m.orderId}`} className="underline">
                          {m.orderNumber}
                        </Link>{" "}
                        {m.label} · {formatGBP(m.amountPence)} · due {formatIsoDateUk(m.dueDate)}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {item.key === "overdue" && checklist.overdue.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-sm">
                    {checklist.overdue.map((inv) => (
                      <li key={inv.id}>
                        <Link href={`/invoices/${inv.id}`} className="underline">
                          {inv.number}
                        </Link>{" "}
                        {inv.clientName} · {inv.balanceFormatted}
                        {inv.dueDate ? ` · due ${formatIsoDateUk(inv.dueDate)}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              {!done ? (
                <Link href={item.href} className="shrink-0 text-sm text-brand underline">
                  Open
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Previous closes</h2>
        {closes.length === 0 ? (
          <p className="mt-3 text-sm text-muted">None yet.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <THead>
                <TR>
                  <TH>Closed</TH>
                  <TH>By</TH>
                  <TH>Bank reconciled to</TH>
                  <TH className="text-right">Left open</TH>
                </TR>
              </THead>
              <TBody>
                {closes.map((c) => (
                  <TR key={c.id}>
                    <TD>{formatClosedAt(c.closedAt)}</TD>
                    <TD>{c.closedByName ?? "—"}</TD>
                    <TD>{formatIsoDateUk(c.bankReconciledThrough) ?? "—"}</TD>
                    <TD className="text-right">{openCount(c.snapshot) || "None"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
