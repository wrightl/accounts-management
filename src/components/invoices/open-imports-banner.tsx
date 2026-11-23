import Link from "next/link";
import type { ImportBatchSummary } from "@/lib/invoices/import/queries";
import { Callout } from "@/components/ui/callout";

/** Banner on the invoice list: imports started but not saved, so their invoices aren't here yet. */
export function OpenImportsBanner({ imports }: { imports: ImportBatchSummary[] }) {
  if (imports.length === 0) return null;
  const [only] = imports;
  const single = imports.length === 1;
  const invoiceCount = only.counts.ready + only.counts.needs_review;

  return (
    <Callout className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {single ? (
            <>
              You have an import that isn&apos;t saved yet ({only.filename ?? "PDF upload"},{" "}
              {invoiceCount} {invoiceCount === 1 ? "invoice" : "invoices"}). Its invoices won&apos;t
              appear here until you save it.
            </>
          ) : (
            <>
              {imports.length} imports aren&apos;t saved yet. Their invoices won&apos;t appear here
              until you save them.
            </>
          )}
        </p>
        <Link
          href={single ? `/invoices/import/${only.id}` : "/invoices/import"}
          className="font-medium text-foreground underline underline-offset-2"
        >
          {single ? "Review and save" : "View imports"}
        </Link>
      </div>
    </Callout>
  );
}
