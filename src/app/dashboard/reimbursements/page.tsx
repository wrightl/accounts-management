import { guardPage } from "@/lib/auth";
import { SectionStub } from "@/components/dashboard/section-stub";

export default async function ReimbursementsPage() {
  await guardPage("accounts:read");
  return (
    <SectionStub
      title="Reimbursements"
      description="Track what the company owes each founder and settle reimbursements in batches."
      phase={3}
    />
  );
}
