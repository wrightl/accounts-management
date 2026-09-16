"use server";

import { mutate } from "@/lib/mutate";
import {
  adminDismissInboundEmailJob,
  adminRetryAllInboundEmailIssues,
  adminRetryInboundEmailJob,
} from "@/lib/expenses/inbound-email";
import type { ActionResult } from "@/actions/result";

export async function retryInboundEmailJob(jobId: string): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async () => {
      const result = await adminRetryInboundEmailJob(jobId);
      if (!result.ok) return { ok: false, error: result.error ?? "Retry failed" };
      return { ok: true, id: jobId };
    },
    {
      audit: {
        action: "inbound_email.retry",
        entityType: "inbound_email_job",
        entityId: jobId,
      },
      paths: ["/inbound-email", "/dashboard", `/inbound-email/${jobId}`],
    },
  );
}

export async function dismissInboundEmailJob(
  jobId: string,
  reason?: string,
): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async () => {
      const result = await adminDismissInboundEmailJob(jobId, reason);
      if (!result.ok) return { ok: false, error: result.error ?? "Dismiss failed" };
      return { ok: true, id: jobId };
    },
    {
      audit: {
        action: "inbound_email.dismiss",
        entityType: "inbound_email_job",
        entityId: jobId,
        meta: reason?.trim() ? { reason: reason.trim() } : undefined,
      },
      paths: ["/inbound-email", "/dashboard", `/inbound-email/${jobId}`],
    },
  );
}

export async function retryAllInboundEmailIssues(): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async () => {
      const result = await adminRetryAllInboundEmailIssues();
      if (result.retried === 0) {
        return { ok: false, error: "No jobs need attention." };
      }
      return { ok: true, id: "batch" };
    },
    {
      audit: {
        action: "inbound_email.retry_all",
        entityType: "inbound_email_job",
      },
      paths: ["/inbound-email", "/dashboard"],
    },
  );
}
