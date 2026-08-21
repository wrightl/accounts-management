import { guardPage, hasPermission } from "@/lib/auth";
import { listBankTransactions } from "@/lib/bank/queries";
import { BankImportForm, BankToolbar, MatchActions } from "@/components/bank/bank-ui";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";

export default async function BankPage() {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Bank</h1>
        <p className="mt-2 text-muted">Connect a database to import statements.</p>
      </div>
    );
  }

  const rows = await listBankTransactions();
  const unreconciled = rows.filter((r) => !r.reconciled).length;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Bank</h1>
          <p className="mt-1 text-muted">
            Import Starling CSV and reconcile against payments and expenses.
            {unreconciled > 0 ? ` ${unreconciled} unreconciled.` : ""}
          </p>
        </div>
        <BankToolbar canWrite={canWrite} />
      </div>

      {canWrite && (
        <div className="mt-6 max-w-lg">
          <BankImportForm />
        </div>
      )}

      <div className="mt-8">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No bank transactions imported yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Counterparty</TH>
                <TH>Reference</TH>
                <TH>Status</TH>
                <TH className="text-right">Amount</TH>
                <TH />
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="text-muted">{r.bookedAt}</TD>
                  <TD>{r.counterparty ?? r.description ?? "—"}</TD>
                  <TD className="text-muted">{r.reference ?? "—"}</TD>
                  <TD className="text-sm">
                    {r.reconciled
                      ? `Matched (${r.matchType})`
                      : r.suggested
                        ? `Suggested (${r.matchType})`
                        : "Unreconciled"}
                  </TD>
                  <TD className="text-right font-medium">{r.amountFormatted}</TD>
                  <TD>
                    <MatchActions
                      matchId={r.matchId}
                      confirmed={r.confirmed}
                      canWrite={canWrite}
                    />
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
