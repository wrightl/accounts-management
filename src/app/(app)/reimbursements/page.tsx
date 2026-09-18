import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import {
  getReimbursementBalances,
  listReimbursements,
} from "@/lib/reimbursements/queries";
import { listFounders } from "@/lib/expenses/queries";
import { CreateReimbursementButton } from "@/components/reimbursements/create-button";
import { ReimbursementActions } from "@/components/reimbursements/actions";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { eq } from "drizzle-orm";

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

  const [allRuns, balances, founders] = await Promise.all([
    listReimbursements(companyId),
    getReimbursementBalances(companyId),
    listFounders(companyId),
  ]);

  const runs =
    runFilter === "all"
      ? allRuns
      : allRuns.filter((r) => r.status === runFilter);

  const db = getDb();
  const reimbursable = await db
    .select()
    .from(expenses)
    .where(eq(expenses.status, "reimbursable"));

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
              href="/reimbursements"
              className={buttonClasses(runFilter === "all" ? "primary" : "secondary", "text-sm")}
            >
              All
            </Link>
            <Link
              href="/reimbursements?filter=pending"
              className={buttonClasses(runFilter === "pending" ? "primary" : "secondary", "text-sm")}
            >
              Pending
            </Link>
            <Link
              href="/reimbursements?filter=paid"
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
                <TH>Payee</TH>
                <TH>Status</TH>
                <TH>Reference</TH>
                <TH>Created</TH>
                <TH className="text-right">Total</TH>
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
