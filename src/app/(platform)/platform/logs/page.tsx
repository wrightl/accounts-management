import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { isDatabaseConfigured } from "@/env";
import { hasDatabaseClient } from "@/db";
import { listPlatformLogs } from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function PlatformLogsPage({
  searchParams,
}: {
  searchParams: Promise<{
    level?: string;
    source?: string;
    q?: string;
    hours?: string;
  }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const hours = Math.min(168, Math.max(1, Number(params.hours ?? 24) || 24));

  if (!isDatabaseConfigured() || !hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Logs</h1>
        <p className="mt-2 text-muted">Connect a database to view logs.</p>
      </div>
    );
  }

  const rows = await listPlatformLogs({
    level: params.level,
    source: params.source,
    q: params.q,
    sinceHours: hours,
  });

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Logs</h1>
      <p className="mt-1 text-muted">
        Persisted errors and warnings (default last {hours}h).
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
        <input
          name="hours"
          type="number"
          min={1}
          max={168}
          defaultValue={hours}
          className="w-24 rounded-lg border border-border px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-full bg-navy px-4 py-2 text-sm text-white"
        >
          Filter
        </button>
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
                    {r.createdAt.toLocaleString("en-GB")}
                  </TD>
                  <TD>
                    <span
                      className={
                        r.level === "error"
                          ? "text-red-700"
                          : r.level === "warn"
                            ? "text-amber-700"
                            : "text-muted"
                      }
                    >
                      {r.level}
                    </span>
                  </TD>
                  <TD className="font-mono text-xs">{r.source}</TD>
                  <TD className="max-w-md">
                    <p className="truncate text-sm" title={r.message}>
                      {r.message}
                    </p>
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
      </div>
    </div>
  );
}
