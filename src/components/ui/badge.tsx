import { cn } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/invoices/status";
import { statusLabel } from "@/lib/invoices/status";

const styles: Record<InvoiceStatus, string> = {
  draft: "bg-surface-2 text-muted",
  sent: "bg-accent/15 text-accent",
  paid: "bg-emerald-100 text-emerald-800",
  overdue: "bg-brand/15 text-brand",
  void: "bg-surface-2 text-muted line-through",
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
