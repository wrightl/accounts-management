import { InvoiceImportStart } from "@/components/invoices/invoice-import-start";
import { InvoiceImportList } from "@/components/invoices/invoice-import-list";
import { InvoicePdfImport } from "@/components/invoices/invoice-pdf-import";
import { BackLink } from "@/components/ui/back-link";
import { guardTenantPage } from "@/lib/auth";
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";
import { listImportBatches } from "@/lib/invoices/import/queries";

// Server Actions on this page stage and commit large files.
export const maxDuration = 60;

export default async function InvoiceImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, entityType } = await guardTenantPage("accounts:write");
  const sp = await searchParams;
  const batches = await listImportBatches(companyId);
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
      {batches.length > 0 ? <InvoiceImportList batches={batches} /> : null}
      <InvoiceImportStart />
      <InvoicePdfImport />
    </div>
  );
}
