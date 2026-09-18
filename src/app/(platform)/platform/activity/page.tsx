import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { listPlatformActivity, listPlatformCompanies } from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function PlatformActivityPage({
  searchParams,
}: {
  searchParams: Promise<{
    companyId?: string;
    action?: string;
    offset?: string;
  }>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;
  const offset = Math.max(0, Number(params.offset ?? 0) || 0);

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Activity</h1>
        <p className="mt-2 text-muted">Connect a database to view activity.</p>
      </div>
    );
  }

  const [rows, companyOptions] = await Promise.all([
    listPlatformActivity({
      companyId: params.companyId || undefined,
      actionPrefix: params.action || undefined,
      limit: 50,
      offset,
    }),
    listPlatformCompanies(),
  ]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Activity</h1>
      <p className="mt-1 text-muted">
        Cross-tenant audit feed including platform actions.
      </p>

      <form className="mt-6 flex flex-wrap gap-3">
        <select
          name="companyId"
          defaultValue={params.companyId ?? ""}
          className="rounded-lg border border-border bg-white px-3 py-2 text-sm"
        >
          <option value="">All companies</option>
          {companyOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          name="action"
          defaultValue={params.action ?? ""}
          placeholder="Action prefix (e.g. platform.)"
          className="rounded-lg border border-border px-3 py-2 text-sm"
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
          <p className="text-sm text-muted">No activity matching filters.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Company</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
                <TH>Meta</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-muted">
                    {r.createdAt.toLocaleString("en-GB")}
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
                      <span className="text-muted">System</span>
                    )}
                  </TD>
                  <TD>{r.actorName ?? r.actorEmail ?? "—"}</TD>
                  <TD className="font-mono text-xs">{r.action}</TD>
                  <TD className="max-w-xs truncate font-mono text-xs text-muted">
                    {r.meta ? JSON.stringify(r.meta) : "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div className="mt-4 flex gap-3 text-sm">
        {offset > 0 ? (
          <Link
            href={`/platform/activity?offset=${Math.max(0, offset - 50)}${
              params.companyId ? `&companyId=${params.companyId}` : ""
            }${params.action ? `&action=${encodeURIComponent(params.action)}` : ""}`}
            className="text-navy hover:underline"
          >
            ← Newer
          </Link>
        ) : null}
        {rows.length === 50 ? (
          <Link
            href={`/platform/activity?offset=${offset + 50}${
              params.companyId ? `&companyId=${params.companyId}` : ""
            }${params.action ? `&action=${encodeURIComponent(params.action)}` : ""}`}
            className="text-navy hover:underline"
          >
            Older →
          </Link>
        ) : null}
      </div>
    </div>
  );
}
