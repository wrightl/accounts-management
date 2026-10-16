import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { listCompanyOptions, listPlatformActivity } from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ExpandableText } from "@/components/platform/expandable-text";
import { ClearFilters, Pager, parseOffset } from "@/components/platform/pager";
import { formatDateTimeUk } from "@/lib/dates";

const PAGE_SIZE = 50;

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
  const offset = parseOffset(params.offset);

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Activity</h1>
        <p className="mt-2 text-muted">Connect a database to view activity.</p>
      </div>
    );
  }

  const [fetched, companyOptions] = await Promise.all([
    listPlatformActivity({
      companyId: params.companyId || undefined,
      actionPrefix: params.action || undefined,
      limit: PAGE_SIZE + 1,
      offset,
    }),
    listCompanyOptions(),
  ]);
  const rows = fetched.slice(0, PAGE_SIZE);

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
        <ClearFilters
          path="/platform/activity"
          active={Boolean(params.companyId || params.action)}
        />
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
                    {formatDateTimeUk(r.createdAt)}
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
                  <TD>
                    <ExpandableText
                      text={r.meta ? JSON.stringify(r.meta, null, 2) : null}
                      mono
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <Pager
        path="/platform/activity"
        params={{ companyId: params.companyId, action: params.action }}
        offset={offset}
        pageSize={PAGE_SIZE}
        shown={rows.length}
        hasMore={fetched.length > PAGE_SIZE}
        newerLabel="← Newer"
        olderLabel="Older →"
      />
    </div>
  );
}
