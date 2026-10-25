import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import {
  getReimbursementBalances,
  listReimbursements,
} from "@/lib/reimbursements/queries";
import { listFounders, listReimbursableExpenses } from "@/lib/expenses/queries";
import { CreateReimbursementButton } from "@/components/reimbursements/create-button";
import { ReimbursementActions } from "@/components/reimbursements/actions";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { sortHeaders } from "@/components/ui/sortable-th";
import {
  defineTableSort,
  parseTableSort,
  rankIn,
  setTableSortParams,
  sortRows,
} from "@/lib/table-sort";

const SORT = defineTableSort({
  columns: ["payee", "status", "reference", "created", "total"],
  fallback: { sort: "created", dir: "desc" },
  descFirst: ["created", "total"],
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
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
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

  const [allRuns, balances, founders, reimbursable] = await Promise.all([
    listReimbursements(companyId),
    getReimbursementBalances(companyId),
    listFounders(companyId),
    listReimbursableExpenses(companyId),
  ]);

  const runs = sortRows(
    runFilter === "all" ? allRuns : allRuns.filter((r) => r.status === runFilter),
    sort,
    {
      payee: (r) => r.payeeName || r.payeeEmail,
      status: (r) => rankIn(["pending", "paid"], r.status),
      reference: (r) => r.reference,
      created: (r) => r.createdAt.getTime(),
      total: (r) => r.totalPence,
    },
  );

  const initialPayee =
    sp.payee && founders.some((f) => f.id === sp.payee) ? sp.payee : undefined;

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Reimbursements</h1>
          <p className="mt-1 text-muted">
            Batch founder expenses into runs and settle them.
          </p>
        </div>
        <CreateReimbursementButton
          canWrite={canWrite}
          founders={founders}
          expenses={reimbursable}
          initialPayeeUserId={initialPayee}
          defaultOpen={Boolean(initialPayee)}
        />
      </div>

      <ol className="mt-4 list-inside list-decimal space-y-1 text-sm text-muted">
        {WORKFLOW_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>

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
        </div>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No reimbursement runs match.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                {th("Payee", "payee")}
                {th("Status", "status")}
                {th("Reference", "reference")}
                {th("Created", "created")}
                {th("Total", "total", "end")}
                {canWrite ? <TH className="text-right">Actions</TH> : null}
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
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
                  <TD className="text-muted">
                    {r.createdAt.toISOString().slice(0, 10)}
                  </TD>
                  <TD className="text-right font-medium">{r.totalFormatted}</TD>
                  {canWrite ? (
                    <TD className="text-right">
                      <ReimbursementActions
                        id={r.id}
                        status={r.status}
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
      </div>

    </div>
  );
}
