import { InvoiceImportStart } from "@/components/invoices/invoice-import-start";
import { InvoicePdfImport } from "@/components/invoices/invoice-pdf-import";
import { BackLink } from "@/components/ui/back-link";
import { guardTenantPage } from "@/lib/auth";
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";

// Server Actions on this page stage and commit large files.
export const maxDuration = 60;

export default async function InvoiceImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { entityType } = await guardTenantPage("accounts:write");
  const sp = await searchParams;
  return (
    <div className="max-w-3xl">
      <SetupStepBanner stepId="invoices" entityType={entityType} from={sp.from} />
      <div className="mb-6">
        <BackLink href="/invoices">Back to invoices</BackLink>
      </div>
      <h1 className="font-display text-2xl font-semibold">Import invoices</h1>
      <p className="mt-1 text-muted">
        Bring in invoices you issued before using Alfa, from a CSV exported by your old system or
        spreadsheet, or from the invoice PDFs themselves. You&apos;ll review everything before
        it&apos;s saved, and clients aren&apos;t contacted.
      </p>
      <InvoiceImportStart />
      <InvoicePdfImport />
    </div>
  );
}
