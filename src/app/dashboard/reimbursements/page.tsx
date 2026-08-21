import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import {
  getReimbursementBalances,
  listReimbursements,
} from "@/lib/reimbursements/queries";
import { listFounders } from "@/lib/expenses/queries";
import { CreateReimbursementForm } from "@/components/reimbursements/create-form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { isDatabaseConfigured } from "@/env";
import { getDb } from "@/db";
import { expenses } from "@/db/schema";
import { eq } from "drizzle-orm";

export default async function ReimbursementsPage() {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Reimbursements</h1>
        <p className="mt-2 text-muted">Connect a database to manage reimbursements.</p>
      </div>
    );
  }

  const [runs, balances, founders] = await Promise.all([
    listReimbursements(),
    getReimbursementBalances(),
    listFounders(),
  ]);

  const db = getDb();
  const reimbursable = await db
    .select()
    .from(expenses)
    .where(eq(expenses.status, "reimbursable"));

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Reimbursements</h1>
      <p className="mt-1 text-muted">
        Batch founder expenses into runs and settle them.
      </p>

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
        <h2 className="mb-3 font-display text-lg font-semibold">Runs</h2>
        {runs.length === 0 ? (
          <p className="text-sm text-muted">No reimbursement runs yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Payee</TH>
                <TH>Status</TH>
                <TH>Created</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {runs.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`/dashboard/reimbursements/${r.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {r.payeeName || r.payeeEmail}
                    </Link>
                  </TD>
                  <TD className="capitalize">{r.status}</TD>
                  <TD className="text-muted">
                    {r.createdAt.toISOString().slice(0, 10)}
                  </TD>
                  <TD className="text-right font-medium">{r.totalFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {canWrite && founders.length > 0 && (
        <div className="mt-10 max-w-xl border-t border-border pt-8">
          <h2 className="mb-4 font-display text-lg font-semibold">
            New reimbursement run
          </h2>
          <CreateReimbursementForm founders={founders} expenses={reimbursable} />
        </div>
      )}
    </div>
  );
}
