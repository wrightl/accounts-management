import { guardPage, hasPermission } from "@/lib/auth";
import {
  defaultReportPeriod,
  listDividends,
} from "@/lib/reports/queries";
import {
  DividendForm,
  DeleteDividendButton,
} from "@/components/dividends/dividends-form";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { formatGBP } from "@/lib/money";
import { isDatabaseConfigured } from "@/env";

export default async function DividendsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const sp = await searchParams;

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Dividends</h1>
        <p className="mt-2 text-muted">
          Connect a database to manage dividend records.
        </p>
      </div>
    );
  }

  const defaults = await defaultReportPeriod();
  const from = sp.from ?? defaults.from;
  const to = sp.to ?? defaults.to;

  const dividends = await listDividends({ from, to });
  const totalPence = dividends.reduce((sum, d) => sum + d.amountPence, 0);

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-semibold">Dividends</h1>
        <p className="mt-1 text-muted">
          Register dividend declarations for the accountant. Period totals match
          the dividends export in the accountant pack.
        </p>
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
          />
        </div>
        <div>
          <Label htmlFor="to">To</Label>
          <Input id="to" name="to" type="date" defaultValue={to} />
        </div>
        <button type="submit" className={buttonClasses("secondary")}>
          Update period
        </button>
      </form>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <Card>
          <CardTitle>Declared in period</CardTitle>
          <CardValue>{formatGBP(totalPence)}</CardValue>
        </Card>
        <Card>
          <CardTitle>Records</CardTitle>
          <CardValue>{dividends.length}</CardValue>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Add dividend</h2>
        <DividendForm canWrite={canWrite} />
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Declarations</h2>
        <div className="mt-4">
          {dividends.length === 0 ? (
            <p className="text-sm text-muted">
              No dividend records in this period.
            </p>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Shareholder</TH>
                  <TH>Notes</TH>
                  <TH className="text-right">Amount</TH>
                  <TH />
                </TR>
              </THead>
              <TBody>
                {dividends.map((d) => (
                  <TR key={d.id}>
                    <TD>{d.declaredAt}</TD>
                    <TD>{d.shareholderName}</TD>
                    <TD className="text-muted">{d.notes ?? "—"}</TD>
                    <TD className="text-right">{d.amountFormatted}</TD>
                    <TD>
                      <DeleteDividendButton id={d.id} canWrite={canWrite} />
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
