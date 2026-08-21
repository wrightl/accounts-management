import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { getDashboardKpis } from "@/lib/invoices/queries";
import { getOwedSummary } from "@/lib/reimbursements/queries";
import { isDatabaseConfigured } from "@/env";

export default async function DashboardOverview() {
  const user = await requireUser();

  let kpis = {
    outstandingFormatted: "—",
    overdueFormatted: "—",
    invoicedThisMonthFormatted: "—",
    reimbursementsFormatted: "—",
  };

  if (isDatabaseConfigured()) {
    try {
      const [live, owed] = await Promise.all([
        getDashboardKpis(),
        getOwedSummary(user),
      ]);
      kpis = {
        outstandingFormatted: live.outstandingFormatted,
        overdueFormatted: live.overdueFormatted,
        invoicedThisMonthFormatted: live.invoicedThisMonthFormatted,
        reimbursementsFormatted: owed.owedToMeFormatted,
      };
    } catch (err) {
      console.warn(
        JSON.stringify({
          level: "warn",
          msg: "dashboard_kpi_failed",
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    }
  }

  const cards = [
    { title: "Outstanding invoices", value: kpis.outstandingFormatted },
    { title: "Overdue", value: kpis.overdueFormatted },
    { title: "Invoiced this month", value: kpis.invoicedThisMonthFormatted },
    { title: "Owed to me", value: kpis.reimbursementsFormatted },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">
        Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-2 text-muted">
        Your account role is <span className="text-foreground">{user.role}</span>.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((kpi) => (
          <Card key={kpi.title}>
            <CardTitle>{kpi.title}</CardTitle>
            <CardValue>{kpi.value}</CardValue>
          </Card>
        ))}
      </div>
    </div>
  );
}
