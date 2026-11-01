"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  commitInvoiceImportChunk,
  discardInvoiceImport,
  setImportClientResolution,
  setImportDraftsSkipped,
  setNextInvoiceSequence,
  undoInvoiceImport,
} from "@/actions/invoice-import";
import { DisplayDate } from "@/components/date-format-provider";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ImportBatchReview } from "@/lib/invoices/import/queries";
import { formatGBP } from "@/lib/money";

const BASIS_NOTE = {
  email: "Same email as an existing client",
  name: "Same name as an existing client",
  similar: "Similar to an existing client: check before linking",
} as const;

export function InvoiceImportReview({
  review,
  canSetCutover,
  canSetNumber,
}: {
  review: ImportBatchReview;
  canSetCutover: boolean;
  canSetNumber: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [kept, setKept] = useState<{ number: string; reason: string }[]>([]);
  const [nextSeq, setNextSeq] = useState(String(review.nextSeq));
  const { batch, counts, cutover } = review;
  const isOpen = batch.status === "draft";
  const hasProblems = counts.needs_review > 0;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Something went wrong");
      else router.refresh();
    });
  }

  function commit() {
    setError(null);
    startTransition(async () => {
      let done = 0;
      for (;;) {
        const result = await commitInvoiceImportChunk(batch.id);
        if (!result.ok) {
          setError(result.error);
          setProgress(null);
          router.refresh();
          return;
        }
        done += result.committed;
        setProgress(`Saved ${done} of ${done + result.remaining} invoices…`);
        if (result.remaining === 0 || result.committed === 0) break;
      }
      setProgress(null);
      router.refresh();
    });
  }

  async function undo() {
    const ok = await confirm({
      title: "Undo this import",
      message:
        "Its invoices and any clients it created are removed. Invoices with real activity, such as a payment recorded in Alfa or a credit note, stay.",
      confirmLabel: "Undo import",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await undoInvoiceImport(batch.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setKept(result.kept);
      router.refresh();
    });
  }

  async function discard() {
    const ok = await confirm({
      title: "Discard this import",
      message: "Nothing has been saved yet. You can upload the file again later.",
      confirmLabel: "Discard",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await discardInvoiceImport(batch.id);
      if (result.ok) router.push("/invoices");
      else setError(result.error);
    });
  }

  const hasCommitted = counts.committed > 0;

  return (
    <div className="mt-6 space-y-8">
      <section className="rounded-2xl border border-border bg-surface p-5 text-sm">
        <h2 className="font-display text-lg font-semibold">
          {batch.status === "committed"
            ? "Import saved"
            : batch.status === "undone"
              ? "Import undone"
              : batch.status === "discarded"
                ? "Import discarded"
                : "What will happen"}
        </h2>
        <ul className="mt-2 space-y-1">
          <li>{counts.ready + counts.committed} invoices {isOpen ? "ready" : "imported"}</li>
          {counts.needs_review > 0 ? <li>{counts.needs_review} with problems to sort out</li> : null}
          {counts.skipped > 0 ? <li>{counts.skipped} left out</li> : null}
          {batch.skippedRows.length > 0 ? <li>{batch.skippedRows.length} skipped from the file (listed below)</li> : null}
        </ul>
        {cutover ? (
          <p className="mt-3">
            Accounts start from <DisplayDate value={cutover} />. {review.broughtForward} invoices
            are brought forward and stay out of P&amp;L and VAT. {review.counted} count, adding{" "}
            {formatGBP(review.netInAccounts)} income and {formatGBP(review.vatInAccounts)} VAT to
            their periods.
          </p>
        ) : (
          <p className="mt-3">
            Set a cutover date first, so invoices from before it stay out of P&amp;L and VAT.{" "}
            {canSetCutover ? (
              <Link className="underline" href="/reports">
                Set it on the Reports page
              </Link>
            ) : (
              "Ask an admin or your accountant to set it on the Reports page."
            )}
          </p>
        )}
        <p className="mt-3 text-muted">
          Clients aren&apos;t contacted. Unpaid imports aren&apos;t chased until you turn it on.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {isOpen ? (
            <Button type="button" disabled={pending || !cutover || hasProblems} onClick={commit}>
              {pending && progress ? progress : "Save invoices"}
            </Button>
          ) : null}
          {isOpen && !hasCommitted ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={discard}>
              Discard
            </Button>
          ) : null}
          {hasCommitted && batch.status !== "undone" ? (
            <Button type="button" variant="ghost" disabled={pending} onClick={undo}>
              Undo import
            </Button>
          ) : null}
          {batch.status === "committed" ? (
            <Link className={buttonClasses("secondary")} href="/invoices">
              View invoices
            </Link>
          ) : null}
        </div>
        <FieldError id="import-review-error">{error}</FieldError>
        {kept.length > 0 ? (
          <div className="mt-3">
            <p>These invoices were kept:</p>
            <ul className="list-disc pl-5">
              {kept.map((k) => (
                <li key={k.number}>
                  {k.number}: {k.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {batch.status === "committed" ? (
        <section className="rounded-2xl border border-border bg-surface p-5 text-sm">
          <h2 className="font-display text-lg font-semibold">Your next invoice</h2>
          <p className="mt-1">Your next invoice in Alfa will be {review.nextNumber}.</p>
          {canSetNumber ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="next-seq">Start numbering from</Label>
                <Input
                  id="next-seq"
                  type="number"
                  min={1}
                  value={nextSeq}
                  disabled={pending}
                  onChange={(e) => setNextSeq(e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => run(() => setNextInvoiceSequence(Number(nextSeq)))}
              >
                Save
              </Button>
            </div>
          ) : null}
        </section>
      ) : null}

      {isOpen && review.clients.length > 0 ? (
        <section>
          <h2 className="font-display text-lg font-semibold">Clients</h2>
          <p className="mt-1 text-sm text-muted">
            Link to a client you already have, or create a new one. Existing client details
            aren&apos;t changed.
          </p>
          <div className="mt-3 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>In the file</TH>
                  <TH className="text-right">Invoices</TH>
                  <TH>In Alfa</TH>
                </TR>
              </THead>
              <TBody>
                {review.clients.map((client) => (
                  <TR key={client.key}>
                    <TD>
                      {client.label}
                      {client.email ? <div className="text-xs text-muted">{client.email}</div> : null}
                      {client.suggestion.basis ? (
                        <div className="text-xs text-muted">{BASIS_NOTE[client.suggestion.basis]}</div>
                      ) : null}
                    </TD>
                    <TD className="text-right">
                      {client.invoiceCount} ({formatGBP(client.grossPence)})
                    </TD>
                    <TD>
                      <Select
                        aria-label={`Client in Alfa for ${client.label}`}
                        value={client.resolution ?? ""}
                        disabled={pending}
                        onChange={(e) =>
                          run(() =>
                            setImportClientResolution(batch.id, client.key, e.target.value || null),
                          )
                        }
                      >
                        <option value="">Create a new client</option>
                        {client.suggestion.clientId && !client.suggestion.preselect ? (
                          <option value={client.suggestion.clientId}>
                            {review.existingClients.find((c) => c.id === client.suggestion.clientId)?.label} (suggested)
                          </option>
                        ) : null}
                        {review.existingClients
                          .filter((c) => client.suggestion.preselect || c.id !== client.suggestion.clientId)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.label}
                            </option>
                          ))}
                      </Select>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Invoices</h2>
          {isOpen && hasProblems ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(() => setImportDraftsSkipped(batch.id, { allWithErrors: true }, true))
              }
            >
              Leave out all with problems
            </Button>
          ) : null}
        </div>
        {review.totalDrafts > review.drafts.length ? (
          <p className="mt-1 text-sm text-muted">
            Showing the first {review.drafts.length} of {review.totalDrafts}.
          </p>
        ) : null}
        <div className="mt-3 overflow-x-auto">
          <Table>
            <THead>
              <TR>
                <TH>Number</TH>
                <TH>Client</TH>
                <TH>Issued</TH>
                <TH>Status</TH>
                <TH className="text-right">Total</TH>
                <TH>Notes</TH>
                {isOpen ? <TH /> : null}
              </TR>
            </THead>
            <TBody>
              {review.drafts.map((draft) => {
                const { parsed } = draft;
                return (
                  <TR key={draft.id}>
                    <TD>{parsed.number ?? "To be created"}</TD>
                    <TD>{parsed.client.companyName || parsed.client.name || parsed.client.email}</TD>
                    <TD>{parsed.issueDate ? <DisplayDate value={parsed.issueDate} /> : "—"}</TD>
                    <TD>{draft.status === "skipped" ? "Left out" : parsed.status === "paid" ? "Paid" : "Unpaid"}</TD>
                    <TD className="text-right">{formatGBP(parsed.grossPence)}</TD>
                    <TD className="text-xs">
                      {draft.errors.map((e) => (
                        <div key={e} className="font-medium">{e}</div>
                      ))}
                      {draft.warnings.map((w) => (
                        <div key={w} className="text-muted">{w}</div>
                      ))}
                    </TD>
                    {isOpen ? (
                      <TD>
                        {draft.status !== "committed" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            disabled={pending}
                            onClick={() =>
                              run(() =>
                                setImportDraftsSkipped(
                                  batch.id,
                                  { draftId: draft.id },
                                  draft.status !== "skipped",
                                ),
                              )
                            }
                          >
                            {draft.status === "skipped" ? "Include" : "Leave out"}
                          </Button>
                        ) : null}
                      </TD>
                    ) : null}
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </section>

      {batch.skippedRows.length > 0 ? (
        <section>
          <h2 className="font-display text-lg font-semibold">Skipped from the file</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {batch.skippedRows.map((row) => (
              <li key={row.rows.join(",")}>
                {row.number ?? `Row ${row.rows[0]}`}: {row.reason}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
