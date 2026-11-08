import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import {
  countPlatformInboundJobs,
  countPlatformSendJobs,
  listPlatformInboundJobs,
  listPlatformSendJobs,
} from "@/lib/platform/queries";
import { InboundJobsTable, SendJobsTable } from "@/components/platform/job-actions";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging, fetchPage } from "@/lib/list-paging";

type Params = Record<string, string | undefined>;

function StatusFilter({
  name,
  value,
  options,
  keep,
}: {
  name: "inboundStatus" | "sendStatus";
  value: string | undefined;
  options: { value: string; label: string }[];
  keep: Record<string, string | undefined>;
}) {
  return (
    <form className="flex gap-2">
      <select
        name={name}
        defaultValue={value ?? "all"}
        aria-label="Filter by status"
        className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {Object.entries(keep).map(([k, v]) =>
        v ? <input key={k} type="hidden" name={k} value={v} /> : null,
      )}
      <button type="submit" className="rounded-full bg-navy px-3 py-2 text-sm text-white">
        Filter
      </button>
    </form>
  );
}

export default async function PlatformJobsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
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

  // Each table pages on its own: ?inboundPage= and ?sendPage=.
  const [inbound, send] = await Promise.all([
    fetchPage(
      parseListPaging(params, "inbound"),
      () => countPlatformInboundJobs({ status: params.inboundStatus }),
      (window) => listPlatformInboundJobs({ status: params.inboundStatus, ...window }),
    ),
    fetchPage(
      parseListPaging(params, "send"),
      () => countPlatformSendJobs({ status: params.sendStatus }),
      (window) => listPlatformSendJobs({ status: params.sendStatus, ...window }),
    ),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Jobs</h1>
      <p className="mt-1 text-muted">
        Cross-tenant inbound email and invoice send queues.
      </p>

      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Inbound email</h2>
          <StatusFilter
            name="inboundStatus"
            value={params.inboundStatus}
            keep={{
              sendStatus: params.sendStatus,
              sendPage: params.sendPage,
              sendPageSize: params.sendPageSize,
            }}
            options={[
              { value: "all", label: "Needs attention" },
              { value: "failed", label: "Failed" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" },
              { value: "processed", label: "Processed" },
            ]}
          />
        </div>
        <InboundJobsTable jobs={inbound.rows} />
        <ListPagination
          {...inbound}
          href={(to) => listPageHref("/platform/jobs", params, to, "inbound")}
        />
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Send jobs</h2>
          <StatusFilter
            name="sendStatus"
            value={params.sendStatus}
            keep={{
              inboundStatus: params.inboundStatus,
              inboundPage: params.inboundPage,
              inboundPageSize: params.inboundPageSize,
            }}
            options={[
              { value: "all", label: "Pending + failed" },
              { value: "failed", label: "Failed" },
              { value: "pending", label: "Pending" },
              { value: "sent", label: "Sent" },
            ]}
          />
        </div>
        <SendJobsTable jobs={send.rows} />
        <ListPagination
          {...send}
          href={(to) => listPageHref("/platform/jobs", params, to, "send")}
        />
      </section>
    </div>
  );
}
