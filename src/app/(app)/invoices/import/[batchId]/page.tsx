import { notFound } from "next/navigation";
import { InvoiceImportReview } from "@/components/invoices/invoice-import-review";
import { BackLink } from "@/components/ui/back-link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { SetupStepBanner } from "@/components/data-onboarding/setup-step-banner";
import { getImportBatchReview } from "@/lib/invoices/import/queries";

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
  const [canSetCutover, canSetNumber] = await Promise.all([
    hasPermission("books:lock"),
    hasPermission("settings:manage"),
  ]);

  return (
    <div className="max-w-4xl">
      <SetupStepBanner stepId="invoices" entityType={entityType} from={sp.from} />
      <div className="mb-6">
        <BackLink href="/invoices/import">Back to imports</BackLink>
      </div>
      <h1 className="font-display text-2xl font-semibold">Review import</h1>
      <p className="mt-1 text-muted">{review.batch.filename}</p>
      <InvoiceImportReview
        review={review}
        canSetCutover={canSetCutover}
        canSetNumber={canSetNumber}
      />
    </div>
  );
}
