import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import {
  countInboundEmailIssues,
  listInboundEmailJobs,
  type InboundEmailJobListFilter,
} from "@/lib/expenses/inbound-email";
import {
  inboundJobNeedsAttention,
  type InboundEmailJobStatus,
} from "@/lib/expenses/inbound-errors";
import { InboundErrorDetail } from "@/components/inbound-email/error-detail";
import { InboundJobStatusBadge } from "@/components/inbound-email/error-detail";
import {
  RetryAllInboundIssuesButton,
  RetryInboundJobButton,
} from "@/components/inbound-email/job-actions";
import { buttonClasses } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";

const FILTERS: { value: InboundEmailJobListFilter; label: string }[] = [
  { value: "attention", label: "Needs attention" },
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "rejected", label: "Rejected" },
  { value: "processed", label: "Processed" },
];

function formatWhen(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export default async function InboundEmailPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("users:manage");
  const sp = await searchParams;
  const filter = (sp.filter as InboundEmailJobListFilter | undefined) ?? "attention";

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Inbound email</h1>
        <p className="mt-2 text-muted">Connect a database to view inbound email jobs.</p>
      </div>
    );
  }

  const [rows, issueCount] = await Promise.all([
    listInboundEmailJobs({ companyId,  filter, limit: 100 }),
    countInboundEmailIssues(companyId),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inbound email</h1>
          <p className="mt-1 text-muted">
            Monitor expense emails from Resend and retry or dismiss processing failures.
          </p>
        </div>
        <RetryAllInboundIssuesButton issueCount={issueCount} />
      </div>

      {issueCount > 0 ? (
        <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
          <span className="font-medium text-destructive">{issueCount}</span> job
          {issueCount === 1 ? "" : "s"} need attention — usually attachment download or OCR
          failures. Retry after fixing network or Resend configuration.
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <Link
            key={item.value}
            href={`/dashboard/inbound-email?filter=${item.value}`}
            className={buttonClasses(filter === item.value ? "primary" : "ghost", "text-sm")}
          >
            {item.label}
            {item.value === "attention" && issueCount > 0 ? ` (${issueCount})` : ""}
          </Link>
        ))}
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No inbound email jobs match this filter.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Received</TH>
                <TH>From</TH>
                <TH>Subject</TH>
                <TH>Status</TH>
                <TH>Attempts</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((job) => {
                const needsAttention = inboundJobNeedsAttention(
                  job.status as InboundEmailJobStatus,
                  job.lastError,
                );
                return (
                  <TR key={job.id}>
                    <TD className="whitespace-nowrap text-muted">{formatWhen(job.createdAt)}</TD>
                    <TD className="max-w-[12rem] truncate">{job.fromEmail}</TD>
                    <TD>
                      <Link
                        href={`/dashboard/inbound-email/${job.id}`}
                        className="font-medium hover:underline"
                      >
                        {job.subject || "(no subject)"}
                      </Link>
                      {needsAttention && job.lastError ? (
                        <div className="mt-2 max-w-xl">
                          <InboundErrorDetail lastError={job.lastError} />
                        </div>
                      ) : null}
                    </TD>
                    <TD>
                      <InboundJobStatusBadge
                        status={job.status as InboundEmailJobStatus}
                        lastError={job.lastError}
                      />
                    </TD>
                    <TD className="tabular-nums">{job.attempts}</TD>
                    <TD className="text-right">
                      <div className="flex flex-wrap justify-end gap-2">
                        {needsAttention ? (
                          <RetryInboundJobButton jobId={job.id} />
                        ) : null}
                        <Link
                          href={`/dashboard/inbound-email/${job.id}`}
                          className={buttonClasses("ghost", "text-sm")}
                        >
                          Details
                        </Link>
                        {job.expenseId ? (
                          <Link
                            href={`/dashboard/expenses/${job.expenseId}`}
                            className={buttonClasses("ghost", "text-sm")}
                          >
                            Expense
                          </Link>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </div>
  );
}
