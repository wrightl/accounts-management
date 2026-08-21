import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/invoices/status";
import { statusLabel } from "@/lib/invoices/status";

const styles: Record<InvoiceStatus, string> = {
  draft: "bg-wash text-muted",
  sent: "bg-accent/30 text-navy",
  paid: "bg-success/15 text-success",
  overdue: "bg-brand text-navy",
  void: "bg-wash text-muted line-through",
};

export function StatusBadge({
  status,
  className,
}: {
  status: InvoiceStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
        className,
      )}
    >
      {statusLabel(status)}
    </span>
  );
}
