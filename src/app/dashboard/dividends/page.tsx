import Link from "next/link";
import { redirect } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import {
  defaultReportPeriod,
  listDividendDeclarations,
} from "@/lib/reports/queries";
import { DeleteDividendDeclarationButton } from "@/components/dividends/dividends-form";
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
  const { companyId, entityType } = await guardTenantPage("accounts:read");
  if (entityType !== "limited_company") {
    redirect("/dashboard");
  }
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

  const defaults = await defaultReportPeriod(companyId);
  const from = sp.from ?? defaults.from;
  const to = sp.to ?? defaults.to;

  const declarations = await listDividendDeclarations(companyId, { from, to });
  const totalPence = declarations.reduce((sum, d) => sum + d.totalPence, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Dividends</h1>
          <p className="mt-1 text-muted">
            Declare a total that splits pro rata across the{" "}
            <Link href="/dashboard/shareholders" className="underline">
              share register
            </Link>
            . Exported in the accountant pack.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/dashboard/dividends/new"
            className={buttonClasses("primary")}
          >
            New dividend
          </Link>
        )}
      </div>

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <div>
          <Label htmlFor="from">From</Label>
          <Input id="from" name="from" type="date" defaultValue={from} />
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
          <CardTitle>Declarations</CardTitle>
          <CardValue>{declarations.length}</CardValue>
        </Card>
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Declarations</h2>
        <div className="mt-4 space-y-8">
          {declarations.length === 0 ? (
            <p className="text-sm text-muted">
              No dividend declarations in this period.
            </p>
          ) : (
            declarations.map((d) => (
              <div key={d.id}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {d.declaredAt} · {d.totalFormatted}
                    </p>
                    {d.notes && (
                      <p className="text-sm text-muted">{d.notes}</p>
                    )}
                  </div>
                  <DeleteDividendDeclarationButton
                    id={d.id}
                    canWrite={canWrite}
                  />
                </div>
                <Table>
                  <THead>
                    <TR>
                      <TH>Shareholder</TH>
                      <TH className="text-right">Amount</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {d.payouts.map((p) => (
                      <TR key={p.id}>
                        <TD>{p.shareholderName}</TD>
                        <TD className="text-right">{p.amountFormatted}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
