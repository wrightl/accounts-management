import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { can } from "@/lib/roles";
import { QueryCell, QueryHeaderCell } from "@/components/queries/query-cells";
import { recordQueriesFor } from "@/lib/queries/queries";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import {
  getReimbursementBalances,
  listReimbursementPage,
} from "@/lib/reimbursements/queries";
import { listFounders, listReimbursableExpenses } from "@/lib/expenses/queries";
import { CreateReimbursementButton } from "@/components/reimbursements/create-button";
import { ReimbursementActions } from "@/components/reimbursements/actions";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { sortHeaders } from "@/components/ui/sortable-th";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging } from "@/lib/list-paging";
import { defineTableSort, parseTableSort, setTableSortParams } from "@/lib/table-sort";
import { DisplayDate } from "@/components/date-format-provider";
import { PageHeader } from "@/components/ui/page-header";

const SORT = defineTableSort({
  columns: ["payee", "status", "reference", "date", "created", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["date", "created", "total"],
});

const WORKFLOW_STEPS = [
  "Log expenses as reimbursable when you pay personally",
  "Batch them into a reimbursement run per founder",
  "Transfer the total from the business bank account",
  "Mark the run paid (or reconcile the bank transaction)",
];

export default async function ReimbursementsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, role } = await guardTenantPage("records:read");
  const scope = recordScopeFor(role);
  const inPack = scope === "pack";
  const canWrite = await hasPermission("accounts:write");
  const canRaiseQuery = can(role, "queries:raise");
  const sp = await searchParams;
  const runFilter = sp.filter === "paid" ? "paid" : sp.filter === "pending" ? "pending" : "all";
  const sort = parseTableSort(sp, SORT);
  const th = sortHeaders("/reimbursements", sp, SORT, sort);
  /** All / Pending / Paid links keep the current sort. */
  const filterHref = (filter: "all" | "pending" | "paid") => {
    const qs = new URLSearchParams(filter === "all" ? {} : { filter });
    setTableSortParams(qs, SORT, sort);
    const query = qs.toString();
    return query ? `/reimbursements?${query}` : "/reimbursements";
  };

  // Money still owed and runs not yet paid aren't in the pack, so don't load them.
  const [{ rows: runs, ...paging }, balances, founders, reimbursable] = await Promise.all([
    listReimbursementPage(companyId, {
      scope,
      status: runFilter === "all" ? undefined : runFilter,
      ...sort,
      ...parseListPaging(sp),
    }),
    inPack ? [] : getReimbursementBalances(companyId),
    inPack ? [] : listFounders(companyId),
    inPack ? [] : listReimbursableExpenses(companyId),
  ]);

  const queries = await recordQueriesFor(role, companyId, "reimbursement", runs.map((r) => r.id));
  const showQueries = canRaiseQuery || queries.size > 0;

  const initialPayee =
    sp.payee && founders.some((f) => f.id === sp.payee) ? sp.payee : undefined;
  const initialExpense = initialPayee
    ? reimbursable.find((e) => e.id === sp.expense && e.paidByUserId === initialPayee)
    : undefined;

  return (
    <div>
      <PageHeader
        title="Reimbursements"
        description={inPack ? "Reimbursement runs that have been paid." : "Batch founder expenses into runs and settle them."}
        actions={
          <CreateReimbursementButton
            canWrite={canWrite}
            founders={founders}
            expenses={reimbursable}
            initialPayeeUserId={initialPayee}
            initialExpenseId={initialExpense?.id}
            defaultOpen={Boolean(initialPayee)}
          />
        }
      />

      {inPack ? null : (
        <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-muted">
          {WORKFLOW_STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      )}

      {balances.length > 0 && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {balances.map((b) => (
            <Card key={b.payeeUserId}>
              <CardTitle>Owed to {b.name}</CardTitle>
              <CardValue>{b.totalFormatted}</CardValue>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Runs</h2>
          {inPack ? null : (
          <div className="flex gap-2">
            <Link
              href={filterHref("all")}
              className={buttonClasses(runFilter === "all" ? "primary" : "secondary", "text-sm")}
            >
              All
            </Link>
            <Link
              href={filterHref("pending")}
              className={buttonClasses(runFilter === "pending" ? "primary" : "secondary", "text-sm")}
            >
              Pending
            </Link>
            <Link
              href={filterHref("paid")}
              className={buttonClasses(runFilter === "paid" ? "primary" : "secondary", "text-sm")}
            >
              Paid
            </Link>
          </div>
          )}
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No reimbursement runs match.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                {showQueries ? <QueryHeaderCell /> : null}
                {th("Payee", "payee")}
                {th("Status", "status")}
                {th("Reference", "reference")}
                {th("Reimbursement date", "date")}
                {th("Created", "created")}
                {th("Total", "total", "end")}
                {canWrite ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  {showQueries ? (
                    <QueryCell kind="reimbursement" id={r.id} queries={queries.get(r.id)} canRaise={canRaiseQuery} />
                  ) : null}
                  <TD>
                    <Link
                      href={`/reimbursements/${r.id}`}
                      className="font-medium text-foreground hover:underline"
                    >
                      {r.payeeName || r.payeeEmail}
                    </Link>
                  </TD>
                  <TD className="capitalize">{r.status}</TD>
                  <TD className="text-muted">{r.reference ?? "—"}</TD>
                  <TD className="text-muted"><DisplayDate value={r.reimbursementDate} /></TD>
                  <TD className="text-muted">
                    <DisplayDate value={r.createdAt} />
                  </TD>
                  <TD className="text-right font-medium">{r.totalFormatted}</TD>
                  {canWrite ? (
                    <TD className="text-right">
                      <ReimbursementActions
                        id={r.id}
                        status={r.status}
                        reimbursementDate={r.reimbursementDate}
                        canWrite={canWrite}
                        compact
                      />
                    </TD>
                  ) : null}
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <ListPagination {...paging} href={(to) => listPageHref("/reimbursements", sp, to)} />
      </div>

    </div>
  );
}
