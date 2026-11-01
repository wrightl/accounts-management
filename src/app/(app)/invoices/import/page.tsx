import Link from "next/link";
import { InvoiceImportStart } from "@/components/invoices/invoice-import-start";
import { buttonClasses } from "@/components/ui/button";
import { guardTenantPage } from "@/lib/auth";

// Server Actions on this page stage and commit large files.
export const maxDuration = 60;

export default async function InvoiceImportPage() {
  await guardTenantPage("accounts:write");
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/invoices" className={buttonClasses("ghost")}>
          Back to invoices
        </Link>
      </div>
      <h1 className="font-display text-2xl font-semibold">Import invoices</h1>
      <p className="mt-1 text-muted">
        Bring in invoices you issued before using Alfa, from a CSV exported by your old system or
        spreadsheet. You&apos;ll review everything before it&apos;s saved, and clients aren&apos;t
        contacted.
      </p>
      <InvoiceImportStart />
    </div>
  );
}
