import { notFound } from "next/navigation";
import { InvoiceImportReview } from "@/components/invoices/invoice-import-review";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";
import { getImportBatchReview } from "@/lib/invoices/import/queries";
import { getCompanySettings } from "@/lib/settings/queries";
import { PageHeader } from "@/components/ui/page-header";

// Server Actions on this page commit and undo large imports.
export const maxDuration = 60;

export default async function InvoiceImportBatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ batchId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId, entityType } = await guardTenantPage("accounts:write");
  const { batchId } = await params;
  const sp = await searchParams;
  const review = await getImportBatchReview(companyId, batchId);
  if (!review) notFound();
  const [canSetCutover, canSetNumber, company] = await Promise.all([
    hasPermission("books:lock"),
    hasPermission("settings:manage"),
    getCompanySettings(companyId),
  ]);

  return (
    <div>
      <SetupStepBanner stepId="invoices" entityType={entityType} from={sp.from} />
      <PageHeader
        backHref="/invoices/import"
        backLabel="Imports"
        title="Review import"
        description={<>{review.batch.filename}</>}
      />
      <InvoiceImportReview
        review={review}
        canSetCutover={canSetCutover}
        canSetNumber={canSetNumber}
        vatRegistered={company.vatRegistered}
      />
    </div>
  );
}
