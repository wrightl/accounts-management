import Link from "next/link";
import { redirect } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { listShareholders } from "@/lib/shareholders/queries";
import { TotalSharesForm } from "@/components/shareholders/total-shares-form";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function ShareholdersPage() {
  const { companyId, entityType } = await guardTenantPage("accounts:read");
  if (entityType !== "limited_company") {
    redirect("/dashboard");
  }
  const canWrite = await hasPermission("accounts:write");

  const { shareholders, totalShares, activeShareSum, registerBalanced } =
    await listShareholders(companyId, { includeArchived: true });
  const active = shareholders.filter((s) => !s.archivedAt);
  const archived = shareholders.filter((s) => s.archivedAt);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Shareholders</h1>
          <p className="mt-1 text-muted">
            Company share register. Dividends split pro rata across active
            holders when the register is balanced.
          </p>
        </div>
        {canWrite && (
          <Link
            href="/shareholders/new"
            className={buttonClasses("primary")}
          >
            New shareholder
          </Link>
        )}
      </div>

      <div className="mt-6">
        <TotalSharesForm
          totalShares={totalShares}
          activeShareSum={activeShareSum}
          canWrite={canWrite}
        />
        {registerBalanced && (
          <p className="mt-2 text-sm text-muted">Register is balanced.</p>
        )}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Active</h2>
        <div className="mt-4">
          {active.length === 0 ? (
            <EmptyState
              title="No active shareholders yet"
              description="Add shareholders so dividend runs can split amounts by shareholding."
              actionHref={canWrite ? "/shareholders/new" : undefined}
              actionLabel={canWrite ? "Add a shareholder" : undefined}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH className="text-right">Shares</TH>
                  <TH className="text-right">%</TH>
                  <TH>Linked user</TH>
                </TR>
              </THead>
              <TBody>
                {active.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link
                        href={`/shareholders/${s.id}`}
                        className="font-medium text-foreground hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="text-right">{s.shareCount}</TD>
                    <TD className="text-right">
                      {s.percent != null ? `${s.percent.toFixed(1)}%` : "—"}
                    </TD>
                    <TD className="text-muted">{s.linkedUserLabel ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>

      {archived.length > 0 && (
        <section className="mt-10">
          <h2 className="font-display text-lg font-semibold">Archived</h2>
          <div className="mt-4">
            <Table>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH className="text-right">Shares</TH>
                  <TH>Linked user</TH>
                </TR>
              </THead>
              <TBody>
                {archived.map((s) => (
                  <TR key={s.id}>
                    <TD>
                      <Link
                        href={`/shareholders/${s.id}`}
                        className="text-muted hover:underline"
                      >
                        {s.name}
                      </Link>
                    </TD>
                    <TD className="text-right text-muted">{s.shareCount}</TD>
                    <TD className="text-muted">{s.linkedUserLabel ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
