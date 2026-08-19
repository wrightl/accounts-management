import { guardPage } from "@/lib/auth";
import { SectionStub } from "@/components/dashboard/section-stub";

export default async function ReportsPage() {
  await guardPage("reports:read");
  return (
    <SectionStub
      title="Reports"
      description="P&L, aged receivables and an exportable period pack for the accountant."
      phase={5}
    />
  );
}
