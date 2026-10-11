import { cn } from "@/lib/utils";
import {
  creditNoteStatusLabel,
  type CreditNoteStatus,
} from "@/lib/credit-notes/status";

const styles: Record<CreditNoteStatus, string> = {
  issued: "bg-accent/30 text-navy",
  void: "bg-wash text-muted line-through",
};

export function CreditNoteStatusBadge({
  status,
  className,
}: {
  status: CreditNoteStatus;
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
      {creditNoteStatusLabel(status)}
    </span>
  );
}
