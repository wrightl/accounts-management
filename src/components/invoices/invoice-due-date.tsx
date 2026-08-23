import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/invoices/status";

export function InvoiceDueDate({
  dueDate,
  status,
  prefix,
  className,
}: {
  dueDate: string | null | undefined;
  status: InvoiceStatus;
  prefix?: string;
  className?: string;
}) {
  if (!dueDate) {
    return <span className={cn("text-muted", className)}>—</span>;
  }

  const label = `${prefix ?? ""}${dueDate}`;

  if (status === "overdue") {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full bg-brand/20 px-2 py-0.5 text-sm font-medium text-navy",
          className,
        )}
      >
        <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
        {label}
      </span>
    );
  }

  return <span className={cn("text-muted", className)}>{label}</span>;
}
