import Link from "next/link";
import { notFound } from "next/navigation";
import { InvoiceImportReview } from "@/components/invoices/invoice-import-review";
import { buttonClasses } from "@/components/ui/button";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getImportBatchReview } from "@/lib/invoices/import/queries";

// Server Actions on this page commit and undo large imports.
export const maxDuration = 60;

export default async function InvoiceImportBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const { batchId } = await params;
  const review = await getImportBatchReview(companyId, batchId);
  if (!review) notFound();
  const [canSetCutover, canSetNumber] = await Promise.all([
    hasPermission("books:lock"),
    hasPermission("settings:manage"),
  ]);

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <Link href="/invoices" className={buttonClasses("ghost")}>
          Back to invoices
        </Link>
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
