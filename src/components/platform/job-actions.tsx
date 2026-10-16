"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { Label, Textarea } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { useAlert } from "@/components/ui/alert-dialog";
import { toast } from "@/components/ui/toast";
import { StatusPill } from "@/components/platform/status-pill";
import { ExpandableText } from "@/components/platform/expandable-text";
import { formatDateTimeUk } from "@/lib/dates";
import {
  platformBulkInboundJobs,
  platformBulkRetrySendJobs,
  platformDismissInboundJob,
  platformRetryInboundJob,
  platformRetrySendJob,
  type BulkJobResult,
} from "@/actions/platform";
import type { ActionResult } from "@/actions/result";

export type InboundJobRow = {
  id: string;
  companyId: string;
  companyName: string;
  status: string;
  fromEmail: string;
  subject: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
};

export type SendJobRow = {
  id: string;
  companyId: string;
  companyName: string;
  kind: string;
  status: string;
  invoiceNumber: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
};

const smallButton = "!px-3 !py-1 text-xs";

function useJobRunner() {
  const router = useRouter();
  const { alert } = useAlert();
  const [pending, start] = useTransition();

  function run(action: () => Promise<ActionResult | BulkJobResult>, success: string, after?: () => void) {
    start(async () => {
      const result = await action();
      if (!result.ok) {
        void alert({ title: "Job action failed", message: result.error });
        return;
      }
      const bulk = result as BulkJobResult;
      if (bulk.failed) {
        void alert({
          title: "Some jobs failed",
          message: `${bulk.succeeded ?? 0} succeeded, ${bulk.failed} failed. Failed jobs keep their error message.`,
        });
      } else {
        toast(success);
      }
      after?.();
      router.refresh();
    });
  }

  return { pending, run };
}

function useSelection(ids: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const visible = new Set(ids);
  const current = [...selected].filter((id) => visible.has(id));
  return {
    selected: current,
    isSelected: (id: string) => selected.has(id),
    toggle: (id: string) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    toggleAll: () =>
      setSelected(current.length === ids.length ? new Set() : new Set(ids)),
    allSelected: ids.length > 0 && current.length === ids.length,
    clear: () => setSelected(new Set()),
  };
}

function DismissDialog({
  open,
  count,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  count: number;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={count === 1 ? "Dismiss inbound email" : `Dismiss ${count} inbound emails`}
    >
      <p className="text-sm text-muted">
        Dismissed emails stop retrying and are marked rejected. The reason is
        saved as the job&apos;s error message.
      </p>
      <div className="mt-3">
        <Label htmlFor="dismissReason">Reason (optional)</Label>
        <Textarea
          id="dismissReason"
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Spam, duplicate, not a receipt"
        />
      </div>
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={pending}
          onClick={() => {
            onConfirm(reason);
            setReason("");
          }}
        >
          Dismiss
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function CompanyLink({ id, name }: { id: string; name: string }) {
  return (
    <Link href={`/platform/companies/${id}`} className="text-navy hover:underline">
      {name}
    </Link>
  );
}

export function InboundJobsTable({ jobs }: { jobs: InboundJobRow[] }) {
  const actionable = jobs.filter((j) => j.status !== "processed").map((j) => j.id);
  const selection = useSelection(actionable);
  const { pending, run } = useJobRunner();
  const [dismissIds, setDismissIds] = useState<string[] | null>(null);

  if (jobs.length === 0) return <p className="text-sm text-muted">No inbound jobs.</p>;

  return (
    <>
      {selection.selected.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-wash px-4 py-2 text-sm">
          <span>{selection.selected.length} selected</span>
          <Button
            type="button"
            variant="secondary"
            className={smallButton}
            disabled={pending}
            onClick={() =>
              run(
                () => platformBulkInboundJobs(selection.selected, "retry"),
                "Selected jobs retried.",
                selection.clear,
              )
            }
          >
            Retry selected
          </Button>
          <Button
            type="button"
            variant="ghost"
            className={smallButton}
            disabled={pending}
            onClick={() => setDismissIds(selection.selected)}
          >
            Dismiss selected
          </Button>
        </div>
      ) : null}
      <Table>
        <THead>
          <TR>
            <TH className="w-8">
              <input
                type="checkbox"
                aria-label="Select all inbound jobs"
                checked={selection.allSelected}
                disabled={actionable.length === 0}
                onChange={selection.toggleAll}
              />
            </TH>
            <TH>When</TH>
            <TH>Company</TH>
            <TH>Status</TH>
            <TH>From / subject</TH>
            <TH>Error</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {jobs.map((j) => {
            const canAct = j.status !== "processed";
            return (
              <TR key={j.id}>
                <TD>
                  {canAct ? (
                    <input
                      type="checkbox"
                      aria-label={`Select email from ${j.fromEmail}`}
                      checked={selection.isSelected(j.id)}
                      onChange={() => selection.toggle(j.id)}
                    />
                  ) : null}
                </TD>
                <TD className="whitespace-nowrap text-muted">{formatDateTimeUk(j.createdAt)}</TD>
                <TD>
                  <CompanyLink id={j.companyId} name={j.companyName} />
                </TD>
                <TD>
                  <StatusPill status={j.status} />
                  {j.attempts > 0 ? (
                    <span className="ml-1 text-xs text-muted">×{j.attempts}</span>
                  ) : null}
                </TD>
                <TD className="text-sm">
                  <div>{j.fromEmail}</div>
                  {j.subject ? <div className="truncate text-xs text-muted">{j.subject}</div> : null}
                </TD>
                <TD>
                  <ExpandableText text={j.lastError} />
                </TD>
                <TD>
                  {canAct ? (
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="secondary"
                        className={smallButton}
                        disabled={pending}
                        onClick={() => run(() => platformRetryInboundJob(j.id), "Job retried.")}
                      >
                        Retry
                      </Button>
                      {j.status !== "rejected" ? (
                        <Button
                          type="button"
                          variant="ghost"
                          className={smallButton}
                          disabled={pending}
                          onClick={() => setDismissIds([j.id])}
                        >
                          Dismiss
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>
      <DismissDialog
        open={dismissIds !== null}
        count={dismissIds?.length ?? 0}
        pending={pending}
        onClose={() => setDismissIds(null)}
        onConfirm={(reason) => {
          const ids = dismissIds ?? [];
          setDismissIds(null);
          run(
            () =>
              ids.length === 1
                ? platformDismissInboundJob(ids[0], reason)
                : platformBulkInboundJobs(ids, "dismiss", reason),
            ids.length === 1 ? "Job dismissed." : "Selected jobs dismissed.",
            selection.clear,
          );
        }}
      />
    </>
  );
}

export function SendJobsTable({ jobs }: { jobs: SendJobRow[] }) {
  const retryable = jobs.filter((j) => j.status === "failed").map((j) => j.id);
  const selection = useSelection(retryable);
  const { pending, run } = useJobRunner();

  if (jobs.length === 0) return <p className="text-sm text-muted">No send jobs.</p>;

  return (
    <>
      {selection.selected.length > 0 ? (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-wash px-4 py-2 text-sm">
          <span>{selection.selected.length} selected</span>
          <Button
            type="button"
            variant="secondary"
            className={smallButton}
            disabled={pending}
            onClick={() =>
              run(
                () => platformBulkRetrySendJobs(selection.selected),
                "Selected jobs retried.",
                selection.clear,
              )
            }
          >
            Retry selected
          </Button>
        </div>
      ) : null}
      <Table>
        <THead>
          <TR>
            <TH className="w-8">
              <input
                type="checkbox"
                aria-label="Select all failed send jobs"
                checked={selection.allSelected}
                disabled={retryable.length === 0}
                onChange={selection.toggleAll}
              />
            </TH>
            <TH>When</TH>
            <TH>Company</TH>
            <TH>Invoice</TH>
            <TH>Kind</TH>
            <TH>Status</TH>
            <TH>Error</TH>
            <TH />
          </TR>
        </THead>
        <TBody>
          {jobs.map((j) => (
            <TR key={j.id}>
              <TD>
                {j.status === "failed" ? (
                  <input
                    type="checkbox"
                    aria-label={`Select send job for invoice ${j.invoiceNumber ?? j.id}`}
                    checked={selection.isSelected(j.id)}
                    onChange={() => selection.toggle(j.id)}
                  />
                ) : null}
              </TD>
              <TD className="whitespace-nowrap text-muted">{formatDateTimeUk(j.createdAt)}</TD>
              <TD>
                <CompanyLink id={j.companyId} name={j.companyName} />
              </TD>
              <TD className="font-mono text-xs">{j.invoiceNumber ?? "—"}</TD>
              <TD className="text-xs">
                {j.kind === "invoice_remind" ? "Reminder" : "Invoice send"}
              </TD>
              <TD>
                <StatusPill status={j.status} />
                {j.attempts > 0 ? (
                  <span className="ml-1 text-xs text-muted">×{j.attempts}</span>
                ) : null}
              </TD>
              <TD>
                <ExpandableText text={j.lastError} />
              </TD>
              <TD>
                {j.status === "failed" ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className={smallButton}
                    disabled={pending}
                    onClick={() => run(() => platformRetrySendJob(j.id), "Job retried.")}
                  >
                    Retry
                  </Button>
                ) : null}
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </>
  );
}
