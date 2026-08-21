import { Card, CardTitle, CardValue } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";

const KPIS = [
  { title: "Outstanding invoices", value: "—" },
  { title: "Overdue", value: "—" },
  { title: "Invoiced this month", value: "—" },
  { title: "Reimbursements owed", value: "—" },
];

export default async function DashboardOverview() {
  const user = await requireUser();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">
        Welcome{user.name ? `, ${user.name.split(" ")[0]}` : ""}
      </h1>
      <p className="mt-2 text-muted">
        Live figures arrive with Phase 1 (invoicing). Your account role is{" "}
        <span className="text-foreground">{user.role}</span>.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {KPIS.map((kpi) => (
          <Card key={kpi.title}>
            <CardTitle>{kpi.title}</CardTitle>
            <CardValue>{kpi.value}</CardValue>
          </Card>
        ))}
      </div>
    </div>
  );
}
