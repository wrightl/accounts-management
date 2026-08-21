import { guardPage } from "@/lib/auth";
import { SectionStub } from "@/components/dashboard/section-stub";

export default async function ExpensesPage() {
  await guardPage("accounts:read");
  return (
    <SectionStub
      title="Expenses"
      description="Log expenses and upload receipts, categorised and ready for reimbursement or reporting."
      phase={2}
    />
  );
}
