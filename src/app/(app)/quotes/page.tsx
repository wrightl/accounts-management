import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listClients } from "@/lib/clients/queries";
import { listQuotes } from "@/lib/quotes/queries";
import { getQuotesSummary } from "@/lib/quotes/summary";
import { QUOTE_STATUSES, quoteStatusLabel, type QuoteStatus } from "@/lib/quotes/status";
import { QuotesSummaryPanel } from "@/components/quotes/quotes-summary";
import { clientDisplayName } from "@/lib/clients/display";
import { buttonClasses } from "@/components/ui/button";
import { Label, Select } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;

  const filters = {
    status: sp.status,
    clientId: sp.client,
  };

  const [rows, clients, summary] = await Promise.all([
    listQuotes(companyId, filters),
    listClients(companyId),
    getQuotesSummary(companyId, filters),
  ]);

  const filtersActive = Boolean(sp.status || sp.client);

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Quotes</h1>
          <p className="mt-1 text-muted">
            Estimates for clients. Send a PDF, mark accepted to create an order, or
            capture decline reasons for pipeline reporting.
          </p>
        </div>
        {canWrite && (
          <Link href="/quotes/new" className={buttonClasses("primary")}>
            New quote
          </Link>
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_320px]">
        <div>
          <form className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="status">Status</Label>
              <Select id="status" name="status" defaultValue={sp.status ?? ""}>
                <option value="">All</option>
                {QUOTE_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {quoteStatusLabel(status)}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="client">Client</Label>
              <Select id="client" name="client" defaultValue={sp.client ?? ""}>
                <option value="">All</option>
                {clients.map((client) => (
                  <option key={client.id} value={client.id}>
                    {clientDisplayName(client)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className={buttonClasses("secondary")}>
                Filter
              </button>
            </div>
          </form>

          <div className="mt-6">
            {rows.length === 0 ? (
              <p className="text-sm text-muted">
                {filtersActive ? "No quotes match these filters." : "No quotes yet."}
              </p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Number</TH>
                    <TH>Version</TH>
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
                          href={`/quotes/${q.id}`}
                          className="font-medium text-foreground hover:underline"
                        >
                          {q.number}
                        </Link>
                      </TD>
                      <TD className="text-muted">{q.versionLabel}</TD>
                      <TD>{q.clientName}</TD>
                      <TD>{quoteStatusLabel(q.status as QuoteStatus)}</TD>
                      <TD className="text-right">{q.grossFormatted}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <QuotesSummaryPanel summary={summary} />
        </aside>
      </div>
    </div>
  );
}
