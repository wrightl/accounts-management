import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import {
  getPlatformBillingStats,
  listPlatformBillingCompanies,
} from "@/lib/platform/billing-queries";
import { formatGBP } from "@/lib/money";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function PlatformBillingPage() {
  await requirePlatformAdmin();

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Billing</h1>
        <p className="mt-2 text-muted">Connect a database to view billing metrics.</p>
      </div>
    );
  }

  const [stats, companies] = await Promise.all([
    getPlatformBillingStats(),
    listPlatformBillingCompanies(),
  ]);

  const cards = [
    { label: "Trialing", value: stats.trialing },
    { label: "Active Essentials", value: stats.activeEssentials },
    { label: "Active Premium", value: stats.activePremium },
    { label: "Past due", value: stats.pastDue },
    { label: "Canceled / unpaid", value: stats.canceled },
    { label: "Complimentary", value: stats.complimentary },
    { label: "Read-only", value: stats.readOnly },
    { label: "Trials ending (7d)", value: stats.trialsEnding7d },
    { label: "MRR (ex VAT)", value: formatGBP(stats.mrrPence) },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Billing</h1>
          <p className="mt-1 text-muted">
            Subscription metrics from local webhook-synced state.
          </p>
        </div>
        <Link
          href="/platform/billing/tiers"
          className="rounded-full bg-navy px-4 py-2 text-sm text-white hover:bg-navy/90"
        >
          Manage tiers
        </Link>
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-border bg-white p-5 shadow-sm"
          >
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Companies</h2>
        <div className="mt-3">
          <Table>
            <THead>
              <TR>
                <TH>Company</TH>
                <TH>Plan</TH>
                <TH>Status</TH>
                <TH>Access</TH>
                <TH>Trial / period</TH>
              </TR>
            </THead>
            <TBody>
              {companies.length === 0 ? (
                <TR>
                  <TD colSpan={5}>No billing rows yet.</TD>
                </TR>
              ) : (
                companies.map((c) => (
                  <TR key={c.companyId}>
                    <TD>
                      <Link
                        href={`/platform/companies/${c.companyId}`}
                        className="text-brand underline-offset-2 hover:underline"
                      >
                        {c.companyName}
                      </Link>
                      {c.readOnly ? (
                        <span className="ml-2 text-xs text-red-700">
                          read-only
                        </span>
                      ) : null}
                    </TD>
                    <TD className="capitalize">{c.plan}</TD>
                    <TD className="capitalize">
                      {c.status.replace("_", " ")}
                    </TD>
                    <TD>
                      {c.access === "complimentary_unlimited"
                        ? "Complimentary"
                        : "Standard"}
                    </TD>
                    <TD className="text-xs text-muted">
                      {c.trialEndsAt
                        ? `Trial ${c.trialEndsAt.toLocaleDateString("en-GB")}`
                        : c.currentPeriodEnd
                          ? c.currentPeriodEnd.toLocaleDateString("en-GB")
                          : "—"}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
