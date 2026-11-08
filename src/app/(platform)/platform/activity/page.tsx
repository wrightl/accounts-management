import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import {
  countPlatformActivity,
  listCompanyOptions,
  listPlatformActivity,
} from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { ExpandableText } from "@/components/platform/expandable-text";
import { ClearFilters } from "@/components/platform/pager";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging, fetchPage } from "@/lib/list-paging";
import { DisplayDate } from "@/components/date-format-provider";


export default async function PlatformActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePlatformAdmin();
  const params = await searchParams;

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Activity</h1>
        <p className="mt-2 text-muted">Connect a database to view activity.</p>
      </div>
    );
  }

  const filters = {
    companyId: params.companyId || undefined,
    actionPrefix: params.action || undefined,
  };
  const [{ rows, ...paging }, companyOptions] = await Promise.all([
    fetchPage(
      parseListPaging(params),
      () => countPlatformActivity(filters),
      (window) => listPlatformActivity({ ...filters, ...window }),
    ),
    listCompanyOptions(),
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
                    <DisplayDate value={r.createdAt} withTime />
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

      <ListPagination
        {...paging}
        href={(to) => listPageHref("/platform/activity", params, to)}
      />
    </div>
  );
}
