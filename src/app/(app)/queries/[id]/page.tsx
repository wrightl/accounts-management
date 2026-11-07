import Link from "next/link";
import { notFound } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { QueryStatusBadge } from "@/components/queries/query-status-badge";
import { QueryThreadActions } from "@/components/queries/query-thread-actions";
import { DisplayDate } from "@/components/date-format-provider";
import { BackLink } from "@/components/ui/back-link";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { isUuid } from "@/lib/labels/params";
import { getQueryDetail } from "@/lib/queries/queries";
import { findQueryRecord } from "@/lib/queries/records";
import type { QueryRecordKind } from "@/lib/queries/status";
import { can } from "@/lib/roles";

export default async function QueryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId, role } = await guardTenantPage("queries:read");
  const { id } = await params;

  const detail = isUuid(id) ? await getQueryDetail(companyId, id) : null;
  if (!detail) notFound();
  const { query, messages } = detail;

  // No link if the record has since been deleted or left the viewer's scope.
  const record =
    query.recordKind && query.recordId
      ? await findQueryRecord(
          companyId,
          query.recordKind as QueryRecordKind,
          query.recordId,
          recordScopeFor(role),
        )
      : null;

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/queries">Queries</BackLink>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-semibold">{query.subject}</h1>
        <QueryStatusBadge status={query.status} />
      </div>
      <p className="mt-1 text-sm text-muted">
        {record ? (
          <Link href={record.href} className="text-foreground underline underline-offset-2">
            {record.label}
          </Link>
        ) : (
          query.recordLabel ?? "General question"
        )}
      </p>

      <ol className="mt-6 space-y-4">
        {messages.map((m) => (
          <li key={m.id} className="rounded-xl border border-border bg-surface p-4">
            <p className="text-xs text-muted">
              {m.authorName || m.authorEmail || "Former user"} · <DisplayDate value={m.createdAt} />
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm">{m.body}</p>
          </li>
        ))}
      </ol>

      <QueryThreadActions
        queryId={query.id}
        closed={query.status === "closed"}
        canClose={can(role, "queries:raise")}
      />
    </div>
  );
}
