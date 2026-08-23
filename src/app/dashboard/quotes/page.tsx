import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { listQuotes } from "@/lib/quotes/queries";
import { buttonClasses } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { isDatabaseConfigured } from "@/env";

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

  const rows = await listQuotes();

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Quotes</h1>
          <p className="mt-1 text-muted">
            Estimates that convert to invoices. Download or email a PDF, then convert
            to an invoice when the client accepts.
          </p>
        </div>
        {canWrite && (
          <Link href="/dashboard/quotes/new" className={buttonClasses("primary")}>
            New quote
          </Link>
        )}
      </div>

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
                      className="font-medium text-foreground hover:underline"
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
    </div>
  );
}
