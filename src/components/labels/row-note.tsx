"use client";

import { StickyNote } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { setRowNoteAction } from "@/actions/labels";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Label, Textarea } from "@/components/ui/form";
import { Tooltip } from "@/components/ui/tooltip";
import { MAX_NOTE_LENGTH } from "@/lib/labels/params";
import type { RowKind } from "@/lib/labels/queries";
import { cn } from "@/lib/utils";

function NoteDialog({
  kind,
  rowId,
  note,
  onClose,
}: {
  kind: RowKind;
  rowId: string;
  note: string | null;
  onClose: () => void;
}) {
  const textareaId = useId();
  const [text, setText] = useState(note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = (value: string | null) => {
    setError(null);
    startTransition(async () => {
      const result = await setRowNoteAction(kind, rowId, value);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Dialog open onClose={() => !pending && onClose()} title={note ? "Edit note" : "Add note"}>
      <Label htmlFor={textareaId}>Note</Label>
      <Textarea
        id={textareaId}
        autoFocus
        rows={6}
        maxLength={MAX_NOTE_LENGTH}
        value={text}
        disabled={pending}
        onChange={(e) => setText(e.target.value)}
      />
      <FieldError>{error}</FieldError>
      <DialogActions>
        {note ? (
          <Button
            type="button"
            variant="destructive"
            className="mr-auto"
            disabled={pending}
            onClick={() => save(null)}
          >
            Delete
          </Button>
        ) : null}
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={() => save(text)}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** Note icon for a row: hover to read the note, click to add, change or delete it. */
export function RowNote({
  kind,
  rowId,
  note,
  canWrite,
}: {
  kind: RowKind;
  rowId: string;
  note: string | null;
  canWrite: boolean;
}) {
  const tooltipId = useId();
  const [editing, setEditing] = useState(false);

  if (!note && !canWrite) return null;

  const button = (
    <button
      type="button"
      aria-label={canWrite ? (note ? "Edit note" : "Add note") : "Note"}
      aria-describedby={note ? tooltipId : undefined}
      onClick={canWrite ? () => setEditing(true) : undefined}
      className={cn(
        "inline-flex rounded p-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
        note ? "text-foreground" : "text-muted opacity-40 hover:opacity-100 focus-visible:opacity-100",
        !canWrite && "cursor-default",
      )}
    >
      <StickyNote className={cn("h-4 w-4", note && "fill-current/20")} aria-hidden />
    </button>
  );

  return (
    <>
      {note ? (
        <Tooltip id={tooltipId} content={note}>
          {button}
        </Tooltip>
      ) : (
        button
      )}
      {editing ? (
        <NoteDialog kind={kind} rowId={rowId} note={note} onClose={() => setEditing(false)} />
      ) : null}
    </>
  );
}
