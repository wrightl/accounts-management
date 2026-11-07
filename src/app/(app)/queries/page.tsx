import Link from "next/link";
import { guardTenantPage } from "@/lib/auth";
import { QueryStatusBadge } from "@/components/queries/query-status-badge";
import { RaiseQueryButton } from "@/components/queries/raise-query-button";
import { DisplayDate } from "@/components/date-format-provider";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listQueries } from "@/lib/queries/queries";
import {
  QUERY_STATUSES,
  isQueryStatus,
  queryStatusLabel,
} from "@/lib/queries/status";
import { can } from "@/lib/roles";
import { PageHeader } from "@/components/ui/page-header";

export default async function QueriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, role } = await guardTenantPage("queries:read");
  const canRaise = can(role, "queries:raise");
  const { status: rawStatus } = await searchParams;
  const status = isQueryStatus(rawStatus) ? rawStatus : undefined;
  const rows = await listQueries(companyId, status);

  return (
    <div>
      <PageHeader
        title="Queries"
        description={
          <>
            {canRaise
              ? "Ask the team to clarify anything in the records."
              : "Questions from your accountant about the records."}
          </>
        }
        actions={canRaise ? <RaiseQueryButton /> : null}
      />

      <nav aria-label="Filter by status" className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/queries"
          aria-current={status ? undefined : "page"}
          className={buttonClasses(status ? "ghost" : "secondary", "text-sm")}
        >
          All
        </Link>
        {QUERY_STATUSES.map((s) => (
          <Link
            key={s}
            href={`/queries?status=${s}`}
            aria-current={status === s ? "page" : undefined}
            className={buttonClasses(status === s ? "secondary" : "ghost", "text-sm")}
          >
            {queryStatusLabel(s)}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {rows.length === 0 ? (
          status ? (
            <p className="text-sm text-muted">No queries with this status.</p>
          ) : (
            <EmptyState
              title="No queries yet"
              description={
                canRaise
                  ? "Raise one from any record, or use Raise a query for a general question."
                  : "When your accountant asks about something, it appears here."
              }
            />
          )
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Subject</TH>
                <TH>About</TH>
                <TH>Raised by</TH>
                <TH>Status</TH>
                <TH>Last activity</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((q) => (
                <TR key={q.id}>
                  <TD>
                    <Link href={`/queries/${q.id}`} className="font-medium text-foreground hover:underline">
                      {q.subject}
                    </Link>
                  </TD>
                  <TD className="text-muted">{q.recordLabel ?? "General"}</TD>
                  <TD className="text-muted">{q.raisedByName || q.raisedByEmail || "—"}</TD>
                  <TD>
                    <QueryStatusBadge status={q.status} />
                  </TD>
                  <TD className="text-muted">
                    <DisplayDate value={q.updatedAt} />
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
