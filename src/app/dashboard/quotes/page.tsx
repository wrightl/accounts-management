import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes/queries";
import { listClients } from "@/lib/invoices/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";
import { QuoteCreateForm } from "@/components/quotes/quote-form";

export default async function QuotesPage() {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Quotes</h1>
        <p className="mt-2 text-muted">Connect a database to manage quotes.</p>
      </div>
    );
  }

  const [rows, clients] = await Promise.all([listQuotes(), listClients()]);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Quotes</h1>
      <p className="mt-1 text-muted">Estimates that convert to invoices.</p>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No quotes yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((q) => (
                <TR key={q.id}>
                  <TD>
                    <Link
                      href={`/dashboard/quotes/${q.id}`}
                      className="font-medium text-brand hover:underline"
                    >
                      {q.number}
                    </Link>
                  </TD>
                  <TD>{q.clientName}</TD>
                  <TD className="capitalize">{q.status}</TD>
                  <TD className="text-right">{q.grossFormatted}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      {canWrite && clients.length > 0 && (
        <div className="mt-10 max-w-2xl border-t border-border pt-8">
          <h2 className="mb-4 font-display text-lg font-semibold">New quote</h2>
          <QuoteCreateForm clients={clients} />
        </div>
      )}
    </div>
  );
}
