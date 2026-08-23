"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  dismissInboundEmailJob,
  retryAllInboundEmailIssues,
  retryInboundEmailJob,
} from "@/actions/inbound-email";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label } from "@/components/ui/form";

export function RetryInboundJobButton({
  jobId,
  className,
}: {
  jobId: string;
  className?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onRetry() {
    setError(null);
    startTransition(async () => {
      const result = await retryInboundEmailJob(jobId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={className}>
      <Button type="button" variant="secondary" disabled={pending} onClick={onRetry}>
        {pending ? "Retrying…" : "Retry now"}
      </Button>
      <FieldError>{error}</FieldError>
    </span>
  );
}

export function DismissInboundJobButton({
  jobId,
  subject,
  className,
}: {
  jobId: string;
  subject?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  async function onDismiss() {
    const ok = await confirm({
      title: "Dismiss inbound email",
      message: `Stop retrying${subject ? ` “${subject}”` : ""}? The email will not create an expense.`,
      confirmLabel: "Dismiss",
      variant: "destructive",
    });
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await dismissInboundEmailJob(jobId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={className}>
      <Button type="button" variant="ghost" disabled={pending} onClick={onDismiss}>
        {pending ? "Dismissing…" : "Dismiss"}
      </Button>
      <FieldError>{error}</FieldError>
    </span>
  );
}

export function DismissInboundJobForm({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await dismissInboundEmailJob(jobId, reason);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label htmlFor={`dismiss-reason-${jobId}`}>Dismissal note (optional)</Label>
        <Input
          id={`dismiss-reason-${jobId}`}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="e.g. Duplicate submission"
        />
      </div>
      <Button type="submit" variant="destructive" disabled={pending}>
        {pending ? "Dismissing…" : "Dismiss job"}
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}

export function RetryAllInboundIssuesButton({
  issueCount,
  className,
}: {
  issueCount: number;
  className?: string;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (issueCount === 0) return null;

  async function onRetryAll() {
    const ok = await confirm({
      title: "Retry all failed jobs",
      message: `Retry ${issueCount} inbound email job${issueCount === 1 ? "" : "s"} now?`,
      confirmLabel: "Retry all",
    });
    if (!ok) return;

    setError(null);
    startTransition(async () => {
      const result = await retryAllInboundEmailIssues();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <span className={className}>
      <Button type="button" variant="secondary" disabled={pending} onClick={onRetryAll}>
        {pending ? "Retrying…" : `Retry all (${issueCount})`}
      </Button>
      <FieldError>{error}</FieldError>
    </span>
  );
}
