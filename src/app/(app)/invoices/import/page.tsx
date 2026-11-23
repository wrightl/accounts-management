import { InvoiceImportStart } from "@/components/invoices/invoice-import-start";
import { InvoiceImportList } from "@/components/invoices/invoice-import-list";
import { InvoicePdfImport } from "@/components/invoices/invoice-pdf-import";
import { guardTenantPage } from "@/lib/auth";
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";
import { listImportBatchPage } from "@/lib/invoices/import/queries";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging } from "@/lib/list-paging";
import { PageHeader } from "@/components/ui/page-header";

// Server Actions on this page stage and commit large files.
export const maxDuration = 60;

export default async function InvoiceImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, entityType } = await guardTenantPage("accounts:write");
  const sp = await searchParams;
  const { rows: batches, ...paging } = await listImportBatchPage(companyId, parseListPaging(sp));
  return (
    <div>
      <SetupStepBanner stepId="invoices" entityType={entityType} from={sp.from} />
      <PageHeader
        backHref="/invoices"
        backLabel="Invoices"
        title="Import invoices"
        description={
          <>
            Bring in invoices you issued before using Alfa, from a CSV exported by your old system or
            spreadsheet, or from the invoice PDFs themselves. You&apos;ll review everything before
            it&apos;s saved, and clients aren&apos;t contacted.
          </>
        }
      />
      {batches.length > 0 ? (
        <>
          <InvoiceImportList batches={batches} />
          <ListPagination {...paging} href={(to) => listPageHref("/invoices/import", sp, to)} />
        </>
      ) : null}
      <InvoiceImportStart />
      <InvoicePdfImport />
    </div>
  );
}
