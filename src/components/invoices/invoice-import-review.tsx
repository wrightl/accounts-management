"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useState, useTransition } from "react";
import {
  commitInvoiceImportChunk,
  discardInvoiceImport,
  setImportClientForKey,
  setImportDraftClient,
  setImportDraftsSkipped,
  setNextInvoiceSequence,
  undoInvoiceImport,
} from "@/actions/invoice-import";
import { approveImportDrafts } from "@/actions/invoice-import-pdf";
import { DisplayDate } from "@/components/date-format-provider";
import { ClientSelect } from "@/components/clients/client-select";
import { InvoiceDraftEditor } from "@/components/invoices/invoice-draft-editor";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import type { ImportBatchReview } from "@/lib/invoices/import/queries";
import { formatGBP } from "@/lib/money";

const BASIS_NOTE = {
  email: "Same email as an existing client",
  name: "Same name as an existing client",
  similar: "Similar to an existing client: check before linking",
} as const;

/** The Clients section's value when a file client's invoices go to different clients. */
const MIXED = "__mixed";

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
  const [openDraft, setOpenDraft] = useState<string | null>(null);
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
  const toCheck = counts.needs_review;

  /** The one thing to do before this import can be saved. */
  const nextStep = !cutover ? null : toCheck > 0 ? (
    <>
      <a className="underline" href="#import-invoices">
        {batch.kind === "pdf"
          ? `Check and approve ${toCheck} ${toCheck === 1 ? "invoice" : "invoices"} below`
          : `Fix or leave out ${toCheck} ${toCheck === 1 ? "invoice" : "invoices"} with problems below`}
      </a>
      , then save.
    </>
  ) : hasCommitted && counts.ready > 0 ? (
    `${counts.committed} invoices are saved and ${counts.ready} still to save. Save the rest to finish.`
  ) : counts.ready > 0 ? (
    `Click Save invoices to add ${counts.ready} ${counts.ready === 1 ? "invoice" : "invoices"}.`
  ) : (
    "Nothing is ready to save. Approve or fix an invoice below, or discard this import."
  );

  type Draft = ImportBatchReview["drafts"][number];

  function fileClientName(draft: Draft): string {
    const { client } = draft.parsed;
    return client.companyName || client.name || client.email || "Client";
  }

  /** The client an invoice is (or will be) saved against. */
  function clientLabelFor(draft: Draft): string {
    const existing = draft.clientId
      ? review.existingClients.find((c) => c.id === draft.clientId)
      : null;
    if (existing) return existing.label;
    return draft.status === "committed" || !isOpen
      ? fileClientName(draft)
      : `${fileClientName(draft)} (new client)`;
  }

  /** A client picker for invoices from one client in the file, suggestion first. */
  function clientSelect({
    key,
    value,
    label,
    onChange,
    extraOptions = [],
  }: {
    key: string;
    value: string;
    label: string;
    onChange: (id: string | null) => void;
    extraOptions?: { value: string; label: string }[];
  }) {
    const suggestion = review.clients.find((c) => c.key === key)?.suggestion;
    const suggestedId = suggestion && !suggestion.preselect ? suggestion.clientId : null;
    return (
      <ClientSelect
        aria-label={label}
        value={value}
        disabled={pending}
        onChange={(id) => {
          if (id !== MIXED) onChange(id || null);
        }}
        leadingOptions={[
          ...extraOptions,
          { value: "", label: "Create a new client from the file" },
          ...(suggestedId
            ? [
                {
                  value: suggestedId,
                  label: `${review.existingClients.find((c) => c.id === suggestedId)?.label} (suggested)`,
                },
              ]
            : []),
        ]}
        clients={review.existingClients
          .filter((c) => c.id !== suggestedId)
          .map((c) => ({ id: c.id, name: c.label }))}
      />
    );
  }

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
                : "Not saved yet"}
        </h2>
        {isOpen ? (
          <p className="mt-1 text-muted">
            Nothing is in your invoices until you click Save invoices.
          </p>
        ) : null}
        <ul className="mt-2 space-y-1">
          <li>{counts.ready + counts.committed} invoices {isOpen ? "ready" : "imported"}</li>
          {counts.needs_review > 0 ? <li>{counts.needs_review} {batch.kind === "pdf" ? "to check and approve" : "with problems to sort out"}</li> : null}
          {counts.skipped > 0 ? <li>{counts.skipped} left out</li> : null}
          {batch.skippedRows.length > 0 ? <li>{batch.skippedRows.length} skipped from the file (listed below)</li> : null}
        </ul>
        {isOpen && nextStep ? (
          <p className="mt-3 rounded-xl bg-wash px-4 py-3">
            <span className="font-medium">Next step: </span>
            {nextStep}
          </p>
        ) : null}
        {cutover ? (
          <p className="mt-3">
            Accounts start from <DisplayDate value={cutover} />. {review.broughtForward} invoices
            are brought forward and stay out of P&amp;L and VAT. {review.counted} count, adding{" "}
            {formatGBP(review.netInAccounts)} income and {formatGBP(review.vatInAccounts)} VAT to
            their periods.
          </p>
        ) : (
          <p className={isOpen ? "mt-3 rounded-xl bg-wash px-4 py-3" : "mt-3"}>
            {isOpen ? <span className="font-medium">Next step: </span> : null}
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
        {review.expiresAt ? (
          <p className="mt-1 text-muted">
            Unsaved imports are deleted after 30 days, so save this one by{" "}
            <DisplayDate value={review.expiresAt} />.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {isOpen ? (
            <Button type="button" disabled={pending || !cutover || hasProblems} onClick={commit}>
              {pending && progress
                ? progress
                : hasCommitted
                  ? `Save remaining ${counts.ready} invoices`
                  : "Save invoices"}
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
        <section id="import-clients" className="scroll-mt-20">
          <h2 className="font-display text-lg font-semibold">Clients</h2>
          <p className="mt-1 text-sm text-muted">
            Link to a client you already have, or create a new one. A choice here applies to
            every unsaved invoice from that client; change a single invoice in its row below.
            Existing client details aren&apos;t changed.
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
                      {clientSelect({
                        key: client.key,
                        value: client.mixed ? MIXED : (client.resolution ?? ""),
                        label: `Client in Alfa for ${client.label}`,
                        onChange: (id) =>
                          run(() => setImportClientForKey(batch.id, client.key, id)),
                        extraOptions: client.mixed
                          ? [{ value: MIXED, label: "Several clients: pick one to set all" }]
                          : [],
                      })}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        </section>
      ) : null}

      <section id="import-invoices" className="scroll-mt-20">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">Invoices</h2>
          {isOpen && batch.kind === "pdf" && review.approvable > 0 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={() => run(() => approveImportDrafts(batch.id, { allWithoutProblems: true }))}
            >
              Approve all {review.approvable} without problems
            </Button>
          ) : null}
          {isOpen && hasProblems ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                run(() => setImportDraftsSkipped(batch.id, { allWithErrors: true }, true))
              }
            >
              Leave out all {batch.kind === "pdf" ? "unapproved" : "with problems"}
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
                  <Fragment key={draft.id}>
                  <TR>
                    <TD>
                      {parsed.number ?? "To be created"}
                      {draft.documentFilename ? (
                        <div className="text-xs text-muted">{draft.documentFilename}</div>
                      ) : null}
                    </TD>
                    <TD>
                      {isOpen && draft.status !== "committed" && draft.status !== "skipped" ? (
                        <>
                          {clientSelect({
                            key: parsed.client.key,
                            value: draft.clientId ?? "",
                            label: `Client in Alfa for ${parsed.number ?? fileClientName(draft)}`,
                            onChange: (id) =>
                              run(() => setImportDraftClient(batch.id, draft.id, id)),
                          })}
                          <div className="text-xs text-muted">In the file: {fileClientName(draft)}</div>
                        </>
                      ) : (
                        clientLabelFor(draft)
                      )}
                    </TD>
                    <TD>{parsed.issueDate ? <DisplayDate value={parsed.issueDate} /> : "—"}</TD>
                    <TD>
                      {draft.status === "skipped" ? "Left out" : parsed.status === "paid" ? "Paid" : "Unpaid"}
                      {draft.bankTransactionId && draft.status !== "skipped" ? (
                        <div className="text-xs text-muted">Linked to a bank payment</div>
                      ) : null}
                    </TD>
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
                        {draft.documentPath && draft.status !== "committed" && draft.status !== "skipped" ? (
                          <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpenDraft(openDraft === draft.id ? null : draft.id)}
                          >
                            {openDraft === draft.id ? "Close" : "Check"}
                          </Button>
                        ) : null}
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
                  {openDraft === draft.id ? (
                    <TR>
                      <TD colSpan={7}>
                        <InvoiceDraftEditor
                          batchId={batch.id}
                          draftId={draft.id}
                          invoice={parsed}
                          clientLabel={clientLabelFor(draft)}
                          bankTransactionId={draft.bankTransactionId}
                          errors={draft.errors}
                          warnings={draft.warnings}
                          approved={draft.status === "ready"}
                        />
                      </TD>
                    </TR>
                  ) : null}
                  </Fragment>
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
