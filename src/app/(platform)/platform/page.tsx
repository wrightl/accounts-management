import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { getPlatformOverviewStats } from "@/lib/platform/queries";
import { getPlatformSettings } from "@/lib/platform-settings";
import { formatDateTimeUk } from "@/lib/dates";
import { cn } from "@/lib/utils";

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
      href: stats.suspended ? "/platform/companies?filter=suspended" : "/platform/companies",
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
      href: "/platform/logs?level=error",
      alert: stats.errors24h > 0,
    },
    {
      label: "Warnings (24h)",
      value: stats.warnings24h,
      href: "/platform/logs?level=warn",
    },
    {
      label: "Failed inbound",
      value: stats.failedInbound,
      href: "/platform/jobs?inboundStatus=failed",
      alert: stats.failedInbound > 0,
    },
    {
      label: "Failed sends",
      value: stats.failedSend,
      href: "/platform/jobs?sendStatus=failed",
      alert: stats.failedSend > 0,
    },
    {
      label: "Pending jobs",
      value: stats.pendingInbound + stats.pendingSend,
      href: "/platform/jobs?inboundStatus=pending&sendStatus=pending",
      note:
        stats.pendingInbound + stats.pendingSend > 0
          ? `${stats.pendingInbound} inbound · ${stats.pendingSend} send`
          : undefined,
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Overview</h1>
      <p className="mt-1 text-muted">
        Platform health at a glance. Last daily cron:{" "}
        {settings.lastCronDailyAt ? formatDateTimeUk(settings.lastCronDailyAt) : "never"}
        .
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.label}
            href={card.href}
            className={cn(
              "rounded-2xl border bg-white p-5 shadow-sm transition hover:border-navy/30",
              "alert" in card && card.alert ? "border-red-300" : "border-border",
            )}
          >
            <p className="text-sm text-muted">{card.label}</p>
            <p
              className={cn(
                "mt-2 font-display text-3xl font-semibold",
                "alert" in card && card.alert && "text-red-700",
              )}
            >
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
