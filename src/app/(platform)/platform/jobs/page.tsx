import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import {
  listPlatformInboundJobs,
  listPlatformSendJobs,
} from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { JobRetryButton } from "@/components/platform/job-actions";

export default async function PlatformJobsPage({
  searchParams,
}: {
  searchParams: Promise<{ inboundStatus?: string; sendStatus?: string }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Jobs</h1>
        <p className="mt-2 text-muted">Connect a database to view jobs.</p>
      </div>
    );
  }

  const [inbound, send] = await Promise.all([
    listPlatformInboundJobs({ status: params.inboundStatus }),
    listPlatformSendJobs({ status: params.sendStatus }),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Jobs</h1>
      <p className="mt-1 text-muted">
        Cross-tenant inbound email and invoice send queues.
      </p>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Inbound email</h2>
          <form className="flex gap-2">
            <select
              name="inboundStatus"
              defaultValue={params.inboundStatus ?? "all"}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">Needs attention</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected</option>
              <option value="processed">Processed</option>
            </select>
            {params.sendStatus ? (
              <input type="hidden" name="sendStatus" value={params.sendStatus} />
            ) : null}
            <button
              type="submit"
              className="rounded-full bg-navy px-3 py-2 text-sm text-white"
            >
              Filter
            </button>
          </form>
        </div>
        <div className="mt-3">
          {inbound.length === 0 ? (
            <p className="text-sm text-muted">No inbound jobs.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Company</TH>
                  <TH>Status</TH>
                  <TH>From</TH>
                  <TH>Error</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {inbound.map((j) => (
                  <TR key={j.id}>
                    <TD className="whitespace-nowrap text-muted">
                      {j.createdAt.toLocaleString("en-GB")}
                    </TD>
                    <TD>
                      <Link
                        href={`/platform/companies/${j.companyId}`}
                        className="text-navy hover:underline"
                      >
                        {j.companyName}
                      </Link>
                    </TD>
                    <TD>{j.status}</TD>
                    <TD className="text-sm">{j.fromEmail}</TD>
                    <TD className="max-w-xs truncate text-xs text-muted">
                      {j.lastError ?? "—"}
                    </TD>
                    <TD className="space-y-1">
                      {j.status !== "processed" ? (
                        <>
                          <JobRetryButton kind="inbound" jobId={j.id} />
                          <JobRetryButton kind="inbound-dismiss" jobId={j.id} />
                        </>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Send jobs</h2>
          <form className="flex gap-2">
            <select
              name="sendStatus"
              defaultValue={params.sendStatus ?? "all"}
              className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
            >
              <option value="all">Pending + failed</option>
              <option value="failed">Failed</option>
              <option value="pending">Pending</option>
              <option value="sent">Sent</option>
            </select>
            {params.inboundStatus ? (
              <input
                type="hidden"
                name="inboundStatus"
                value={params.inboundStatus}
              />
            ) : null}
            <button
              type="submit"
              className="rounded-full bg-navy px-3 py-2 text-sm text-white"
            >
              Filter
            </button>
          </form>
        </div>
        <div className="mt-3">
          {send.length === 0 ? (
            <p className="text-sm text-muted">No send jobs.</p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>When</TH>
                  <TH>Company</TH>
                  <TH>Kind</TH>
                  <TH>Status</TH>
                  <TH>Error</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {send.map((j) => (
                  <TR key={j.id}>
                    <TD className="whitespace-nowrap text-muted">
                      {j.createdAt.toLocaleString("en-GB")}
                    </TD>
                    <TD>
                      <Link
                        href={`/platform/companies/${j.companyId}`}
                        className="text-navy hover:underline"
                      >
                        {j.companyName}
                      </Link>
                    </TD>
                    <TD className="font-mono text-xs">{j.kind}</TD>
                    <TD>{j.status}</TD>
                    <TD className="max-w-xs truncate text-xs text-muted">
                      {j.lastError ?? "—"}
                    </TD>
                    <TD>
                      {j.status !== "sent" ? (
                        <JobRetryButton kind="send" jobId={j.id} />
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
