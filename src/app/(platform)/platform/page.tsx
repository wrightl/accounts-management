import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { getPlatformOverviewStats } from "@/lib/platform/queries";
import { getPlatformSettings } from "@/lib/platform-settings";

export default async function PlatformOverviewPage() {
  await requirePlatformAdmin();

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Platform</h1>
        <p className="mt-2 text-muted">Connect a database to view ops stats.</p>
      </div>
    );
  }

  const [stats, settings, billingStats] = await Promise.all([
    getPlatformOverviewStats(),
    getPlatformSettings(),
    hasDatabaseClient()
      ? import("@/lib/platform/billing-queries").then((m) =>
          m.getPlatformBillingStats(),
        )
      : null,
  ]);

  const cards = [
    {
      label: "Companies",
      value: stats.companies,
      href: "/platform/companies",
      note: stats.suspended ? `${stats.suspended} suspended` : undefined,
    },
    {
      label: "MRR (ex VAT)",
      value: billingStats
        ? `£${(billingStats.mrrPence / 100).toFixed(0)}`
        : "—",
      href: "/platform/billing",
      note: billingStats
        ? `${billingStats.trialing} trial · ${billingStats.pastDue} past due`
        : undefined,
    },
    {
      label: "Errors (24h)",
      value: stats.errors24h,
      href: "/platform/logs",
    },
    {
      label: "Warnings (24h)",
      value: stats.warnings24h,
      href: "/platform/logs",
    },
    {
      label: "Failed inbound",
      value: stats.failedInbound,
      href: "/platform/jobs",
    },
    {
      label: "Failed sends",
      value: stats.failedSend,
      href: "/platform/jobs",
    },
    {
      label: "Pending jobs",
      value: stats.pendingInbound + stats.pendingSend,
      href: "/platform/jobs",
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-muted">
        Platform health at a glance. Last daily cron:{" "}
        {settings.lastCronDailyAt
          ? settings.lastCronDailyAt.toLocaleString("en-GB")
          : "never"}
        .
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className="rounded-2xl border border-border bg-white p-5 shadow-sm transition hover:border-navy/30"
          >
            <p className="text-sm text-muted">{card.label}</p>
            <p className="mt-2 font-display text-3xl font-semibold">
              {card.value}
            </p>
            {card.note ? (
              <p className="mt-1 text-xs text-amber-700">{card.note}</p>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
