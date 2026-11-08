import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { countPlatformLogs, listPlatformLogs } from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ExpandableText } from "@/components/platform/expandable-text";
import { StatusPill } from "@/components/platform/status-pill";
import { ClearFilters } from "@/components/platform/pager";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging, fetchPage } from "@/lib/list-paging";
import { DisplayDate } from "@/components/date-format-provider";


export default async function PlatformLogsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const hours = Math.min(168, Math.max(1, Number(params.hours ?? 24) || 24));

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Logs</h1>
        <p className="mt-2 text-muted">Connect a database to view logs.</p>
      </div>
    );
  }

  const filters = {
    level: params.level,
    source: params.source,
    q: params.q,
    sinceHours: hours,
  };
  const { rows, ...paging } = await fetchPage(
    parseListPaging(params),
    () => countPlatformLogs(filters),
    (window) => listPlatformLogs({ ...filters, ...window }),
  );

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Logs</h1>
      <p className="mt-1 text-muted">
        Persisted errors and warnings from the last {hours} hours.
      </p>

      <form className="mt-6 flex flex-wrap gap-3">
        <select
          name="level"
          defaultValue={params.level ?? "all"}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
        >
          <option value="all">Errors + warnings</option>
          <option value="error">Errors only</option>
          <option value="warn">Warnings only</option>
          <option value="info">Info only</option>
        </select>
        <input
          name="source"
          defaultValue={params.source ?? ""}
          placeholder="Source contains…"
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <input
          name="q"
          defaultValue={params.q ?? ""}
          placeholder="Message contains…"
          className="rounded-lg border border-border px-3 py-2 text-sm"
        />
        <label className="flex items-center gap-2 text-sm text-muted">
          Last
          <input
            name="hours"
            type="number"
            min={1}
            max={168}
            defaultValue={hours}
            className="w-20 rounded-lg border border-border px-3 py-2 text-sm text-foreground"
          />
          hours
        </label>
        <button
          type="submit"
          className="rounded-full bg-navy px-4 py-2 text-sm text-white"
        >
          Filter
        </button>
        <ClearFilters
          path="/platform/logs"
          active={Boolean(params.level || params.source || params.q || params.hours)}
        />
      </form>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No log entries.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Level</TH>
                <TH>Source</TH>
                <TH>Message</TH>
                <TH>Company</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-muted">
                    <DisplayDate value={r.createdAt} withTime />
                  </TD>
                  <TD>
                    <StatusPill
                      status={r.level}
                      tone={
                        r.level === "error"
                          ? "danger"
                          : r.level === "warn"
                            ? "warning"
                            : "neutral"
                      }
                    />
                  </TD>
                  <TD className="font-mono text-xs">{r.source}</TD>
                  <TD className="max-w-md">
                    <ExpandableText
                      text={
                        r.meta
                          ? `${r.message}\n\n${JSON.stringify(r.meta, null, 2)}`
                          : r.message
                      }
                    />
                    {r.digest ? (
                      <p className="font-mono text-xs text-muted">
                        digest {r.digest}
                      </p>
                    ) : null}
                  </TD>
                  <TD>
                    {r.companyId ? (
                      <Link
                        href={`/platform/companies/${r.companyId}`}
                        className="text-navy hover:underline"
                      >
                        {r.companyName ?? "—"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <ListPagination
          {...paging}
          href={(to) => listPageHref("/platform/logs", params, to)}
        />
      </div>
    </div>
  );
}
