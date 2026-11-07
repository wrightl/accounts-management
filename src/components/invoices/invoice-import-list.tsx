import Link from "next/link";
import { DisplayDate } from "@/components/date-format-provider";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ImportBatchSummary } from "@/lib/invoices/import/queries";
import { cn } from "@/lib/utils";

const STATUS = {
  draft: { label: "Not saved yet", className: "bg-brand text-navy" },
  committed: { label: "Saved", className: "bg-success/15 text-success" },
  undone: { label: "Undone", className: "bg-wash text-muted" },
  discarded: { label: "Discarded", className: "bg-wash text-muted" },
} as const;

function invoiceSummary({ status, counts }: ImportBatchSummary): string {
  if (status === "committed") return `${counts.committed} saved`;
  if (status === "undone") return `${counts.committed} imported`;
  const parts = [];
  if (counts.committed > 0) parts.push(`${counts.committed} saved`);
  if (counts.ready > 0) parts.push(`${counts.ready} ready`);
  if (counts.needs_review > 0) parts.push(`${counts.needs_review} to check`);
  return parts.join(", ") || "None";
}

/** Every import the company has started, so any of them can be reopened. */
export function InvoiceImportList({ batches }: { batches: ImportBatchSummary[] }) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 font-display text-lg font-semibold">Your imports</h2>
      <Table>
        <THead>
          <TR>
            <TH>File</TH>
            <TH>Type</TH>
            <TH>Started</TH>
            <TH>Status</TH>
            <TH>Invoices</TH>
          </TR>
        </THead>
        <TBody>
          {batches.map((batch) => {
            const status = STATUS[batch.status];
            return (
              <TR key={batch.id}>
                <TD className="max-w-xs">
                  <Link
                    href={`/invoices/import/${batch.id}`}
                    className="block truncate font-medium text-foreground hover:underline"
                  >
                    {batch.filename ?? "PDF upload"}
                  </Link>
                  {batch.status === "draft" ? (
                    <Link
                      href={`/invoices/import/${batch.id}`}
                      className="text-xs text-brand underline underline-offset-2"
                    >
                      Review and save
                    </Link>
                  ) : null}
                </TD>
                <TD className="text-muted">{batch.kind === "pdf" ? "PDF" : "CSV"}</TD>
                <TD className="text-muted">
                  <DisplayDate value={batch.createdAt} />
                </TD>
                <TD>
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                      status.className,
                    )}
                  >
                    {status.label}
                  </span>
                  {batch.status === "committed" && batch.committedAt ? (
                    <div className="mt-1 text-xs text-muted">
                      <DisplayDate value={batch.committedAt} />
                    </div>
                  ) : null}
                  {batch.expiresAt ? (
                    <div className="mt-1 text-xs text-muted">
                      Deleted if not saved by <DisplayDate value={batch.expiresAt} />
                    </div>
                  ) : null}
                </TD>
                <TD className="text-muted">{invoiceSummary(batch)}</TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
    </section>
  );
}
