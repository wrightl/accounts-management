import { guardPage } from "@/lib/auth";
import { SectionStub } from "@/components/dashboard/section-stub";

export default async function InvoicesPage() {
  await guardPage("accounts:read");
  return (
    <SectionStub
      title="Invoices"
      description="Create, send and track invoices to clients, with branded PDFs and payment status."
      phase={1}
    />
  );
}
