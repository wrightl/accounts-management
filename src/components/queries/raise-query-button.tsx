"use client";

import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { raiseQuery } from "@/actions/accountant-queries";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { MAX_QUERY_BODY_LENGTH, MAX_QUERY_SUBJECT_LENGTH } from "@/lib/queries/schema";
import type { QueryRecordKind } from "@/lib/queries/status";

/** Ask the team about one record, or a general question when no record is given. */
export function RaiseQueryButton({
  recordKind = null,
  recordId = null,
}: {
  recordKind?: QueryRecordKind | null;
  recordId?: string | null;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        Raise a query
      </Button>
      {open ? (
        <RaiseQueryDialog
          recordKind={recordKind}
          recordId={recordId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

export function RaiseQueryDialog({
  recordKind,
  recordId,
  onClose,
}: {
  recordKind: QueryRecordKind | null;
  recordId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const subjectId = useId();
  const bodyId = useId();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await raiseQuery({ subject, body, recordKind, recordId });
      if (!result.ok) {
        setError(
          result.fieldErrors
            ? Object.values(result.fieldErrors)[0] ?? result.error
            : result.error,
        );
        return;
      }
      onClose();
      router.push(`/queries/${result.id}`);
    });
  };

  return (
    <Dialog
      open
      onClose={() => !pending && onClose()}
      title={recordKind ? "Raise a query about this record" : "Raise a query"}
    >
      <Label htmlFor={subjectId}>Subject</Label>
      <Input
        id={subjectId}
        autoFocus
        maxLength={MAX_QUERY_SUBJECT_LENGTH}
        value={subject}
        disabled={pending}
        onChange={(e) => setSubject(e.target.value)}
      />
      <div className="mt-3">
        <Label htmlFor={bodyId}>What needs clarifying?</Label>
        <Textarea
          id={bodyId}
          rows={6}
          maxLength={MAX_QUERY_BODY_LENGTH}
          value={body}
          disabled={pending}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      <FieldError>{error}</FieldError>
      <DialogActions>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? "Sending…" : "Send query"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
