import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import {
  countPlatformInboundJobs,
  countPlatformSendJobs,
  listPlatformInboundJobs,
  listPlatformSendJobs,
} from "@/lib/platform/queries";
import { InboundJobsTable, SendJobsTable } from "@/components/platform/job-actions";
import { Pager, parseOffset } from "@/components/platform/pager";

const PAGE_SIZE = 50;

type Params = {
  inboundStatus?: string;
  sendStatus?: string;
  inboundOffset?: string;
  sendOffset?: string;
};

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
  const inboundOffset = parseOffset(params.inboundOffset);
  const sendOffset = parseOffset(params.sendOffset);

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Jobs</h1>
        <p className="mt-2 text-muted">Connect a database to view jobs.</p>
      </div>
    );
  }

  const [inbound, inboundTotal, send, sendTotal] = await Promise.all([
    listPlatformInboundJobs({
      status: params.inboundStatus,
      limit: PAGE_SIZE,
      offset: inboundOffset,
    }),
    countPlatformInboundJobs({ status: params.inboundStatus }),
    listPlatformSendJobs({
      status: params.sendStatus,
      limit: PAGE_SIZE,
      offset: sendOffset,
    }),
    countPlatformSendJobs({ status: params.sendStatus }),
  ]);
  // Paging one table keeps the other table's filter and page.
  const keep = {
    inboundStatus: params.inboundStatus,
    sendStatus: params.sendStatus,
    inboundOffset: params.inboundOffset,
    sendOffset: params.sendOffset,
  };

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
            keep={{ sendStatus: params.sendStatus, sendOffset: params.sendOffset }}
            options={[
              { value: "all", label: "Needs attention" },
              { value: "failed", label: "Failed" },
              { value: "pending", label: "Pending" },
              { value: "rejected", label: "Rejected" },
              { value: "processed", label: "Processed" },
            ]}
          />
        </div>
        <InboundJobsTable jobs={inbound} />
        <Pager
          path="/platform/jobs"
          params={keep}
          offset={inboundOffset}
          offsetKey="inboundOffset"
          pageSize={PAGE_SIZE}
          shown={inbound.length}
          total={inboundTotal}
        />
      </section>

      <section className="mt-10">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Send jobs</h2>
          <StatusFilter
            name="sendStatus"
            value={params.sendStatus}
            keep={{ inboundStatus: params.inboundStatus, inboundOffset: params.inboundOffset }}
            options={[
              { value: "all", label: "Pending + failed" },
              { value: "failed", label: "Failed" },
              { value: "pending", label: "Pending" },
              { value: "sent", label: "Sent" },
            ]}
          />
        </div>
        <SendJobsTable jobs={send} />
        <Pager
          path="/platform/jobs"
          params={keep}
          offset={sendOffset}
          offsetKey="sendOffset"
          pageSize={PAGE_SIZE}
          shown={send.length}
          total={sendTotal}
        />
      </section>
    </div>
  );
}
