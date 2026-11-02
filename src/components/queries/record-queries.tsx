import Link from "next/link";
import { QueryStatusBadge } from "@/components/queries/query-status-badge";
import { RaiseQueryButton } from "@/components/queries/raise-query-button";
import { DisplayDate } from "@/components/date-format-provider";
import { listQueriesForRecord } from "@/lib/queries/queries";
import type { QueryRecordKind } from "@/lib/queries/status";
import { can, type Role } from "@/lib/roles";

/** Queries on one record, and a way to raise another. Shows nothing if there's nothing to do. */
export async function RecordQueries({
  companyId,
  role,
  kind,
  recordId,
}: {
  companyId: string;
  role: Role;
  kind: QueryRecordKind;
  recordId: string;
}) {
  if (!can(role, "queries:read")) return null;
  const queries = await listQueriesForRecord(companyId, kind, recordId);
  const canRaise = can(role, "queries:raise");
  if (queries.length === 0 && !canRaise) return null;

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Queries</h2>
        {canRaise ? <RaiseQueryButton recordKind={kind} recordId={recordId} /> : null}
      </div>
      {queries.length === 0 ? (
        <p className="text-sm text-muted">No queries about this yet.</p>
      ) : (
        <ul className="space-y-2">
          {queries.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center gap-3 text-sm">
              <Link href={`/queries/${q.id}`} className="font-medium text-foreground hover:underline">
                {q.subject}
              </Link>
              <QueryStatusBadge status={q.status} />
              <span className="text-muted">
                <DisplayDate value={q.updatedAt} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
