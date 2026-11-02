import { cn } from "@/lib/utils";
import { queryStatusLabel, type QueryStatus } from "@/lib/queries/status";

const styles: Record<QueryStatus, string> = {
  open: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  answered: "bg-accent/30 text-navy",
  closed: "bg-wash text-muted",
};

export function QueryStatusBadge({ status }: { status: QueryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        styles[status],
      )}
    >
      {queryStatusLabel(status)}
    </span>
  );
}
