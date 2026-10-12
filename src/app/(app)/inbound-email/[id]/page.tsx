import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { getInboundEmailJob } from "@/lib/expenses/inbound-email";
import {
  inboundJobNeedsAttention,
  type InboundEmailJobStatus,
} from "@/lib/expenses/inbound-errors";
import { InboundErrorDetail, InboundJobStatusBadge } from "@/components/inbound-email/error-detail";
import {
  DismissInboundJobForm,
  RetryInboundJobButton,
} from "@/components/inbound-email/job-actions";
import { Card, CardTitle } from "@/components/ui/card";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

function formatWhen(date: Date | null): string {
  if (!date) return "—";
  return date.toISOString().replace("T", " ").slice(0, 19);
}

export default async function InboundEmailJobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId } = await guardTenantPage("users:manage");
  const { id } = await params;

  const job = await getInboundEmailJob(companyId, id);
  if (!job) notFound();

  const status = job.status as InboundEmailJobStatus;
  const needsAttention = inboundJobNeedsAttention(status, job.lastError);

  return (
    <div>
      <SettingsPageHeader
        title={job.subject || "(no subject)"}
        description={`From ${job.fromEmail}`}
        backHref="/inbound-email"
        backLabel="Inbound email"
        actions={
          <>
            <InboundJobStatusBadge status={status} lastError={job.lastError} />
            {needsAttention ? <RetryInboundJobButton jobId={job.id} /> : null}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardTitle>Job details</CardTitle>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted">Received</dt>
              <dd>{formatWhen(job.createdAt)}</dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted">To</dt>
              <dd>{job.toEmail}</dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted">Resend ID</dt>
              <dd className="break-all font-mono text-xs">{job.resendEmailId}</dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted">Attempts</dt>
              <dd className="tabular-nums">{job.attempts}</dd>
            </div>
            <div className="grid grid-cols-[8rem_1fr] gap-2">
              <dt className="text-muted">Processed</dt>
              <dd>{formatWhen(job.processedAt)}</dd>
            </div>
            {job.expenseId ? (
              <div className="grid grid-cols-[8rem_1fr] gap-2">
                <dt className="text-muted">Expense</dt>
                <dd>
                  <Link
                    href={`/expenses/${job.expenseId}`}
                    className="font-medium text-brand hover:underline"
                  >
                    View expense →
                  </Link>
                </dd>
              </div>
            ) : null}
          </dl>
        </Card>

        <Card>
          <CardTitle>{needsAttention ? "Processing error" : "Last message"}</CardTitle>
          <div className="mt-4">
            {job.lastError ? (
              <InboundErrorDetail lastError={job.lastError} />
            ) : (
              <p className="text-sm text-muted">No errors recorded for this job.</p>
            )}
          </div>
        </Card>
      </div>

      {needsAttention ? (
        <Card className="mt-6">
          <CardTitle>Dismiss job</CardTitle>
          <p className="mt-2 text-sm text-muted">
            If this email cannot be processed, dismiss it to stop automatic retries and cron
            attempts.
          </p>
          <div className="mt-4 max-w-md">
            <DismissInboundJobForm jobId={job.id} />
          </div>
        </Card>
      ) : null}
    </div>
  );
}
