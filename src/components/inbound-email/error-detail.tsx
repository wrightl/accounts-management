import {
  inboundJobNeedsAttention,
  inboundJobStatusLabel,
  parseInboundErrorMessage,
  type InboundEmailJobStatus,
} from "@/lib/expenses/inbound-errors";
import { cn } from "@/lib/utils";

const statusStyles: Record<InboundEmailJobStatus, string> = {
  pending: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  processed: "bg-success/15 text-success",
  rejected: "bg-wash text-muted",
  failed: "bg-destructive/15 text-destructive",
};

export function InboundJobStatusBadge({
  status,
  lastError,
  className,
}: {
  status: InboundEmailJobStatus;
  lastError?: string | null;
  className?: string;
}) {
  const needsAttention = inboundJobNeedsAttention(status, lastError);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        needsAttention ? statusStyles.failed : statusStyles[status],
        className,
      )}
    >
      {inboundJobStatusLabel(status, lastError)}
    </span>
  );
}

export function InboundErrorDetail({
  lastError,
  className,
}: {
  lastError: string | null | undefined;
  className?: string;
}) {
  const parsed = parseInboundErrorMessage(lastError);
  if (!parsed) return null;

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-wash/40 p-4 text-sm",
        className,
      )}
    >
      <dl className="grid gap-2">
        {parsed.step ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Failed step
            </dt>
            <dd className="mt-0.5 font-mono text-xs">{parsed.step}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">Summary</dt>
          <dd className="mt-0.5">{parsed.summary}</dd>
        </div>
        {parsed.cause ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Cause</dt>
            <dd className="mt-0.5 break-words">{parsed.cause}</dd>
          </div>
        ) : null}
        {parsed.code ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">Code</dt>
            <dd className="mt-0.5 font-mono text-xs">{parsed.code}</dd>
          </div>
        ) : null}
        {parsed.attachment ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">
              Attachment
            </dt>
            <dd className="mt-0.5">{parsed.attachment}</dd>
          </div>
        ) : null}
        {parsed.url ? (
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted">URL</dt>
            <dd className="mt-0.5 break-all font-mono text-xs">{parsed.url}</dd>
          </div>
        ) : null}
      </dl>
      {lastError && parsed.step ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted hover:text-foreground">
            Raw error
          </summary>
          <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded border border-border bg-background p-2 font-mono text-xs">
            {lastError}
          </pre>
        </details>
      ) : null}
    </div>
  );
}
