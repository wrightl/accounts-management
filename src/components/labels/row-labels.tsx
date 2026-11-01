"use client";

import { Tag } from "lucide-react";
import { useId, useState, useTransition } from "react";
import { createLabelAction, setRowLabelsAction } from "@/actions/labels";
import { LabelChip, LabelColorPicker } from "@/components/labels/label-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { DEFAULT_LABEL_COLOR, type LabelColor } from "@/lib/labels/colors";
import type { RowKind, RowLabel } from "@/lib/labels/queries";

function LabelPickerDialog({
  kind,
  rowId,
  current,
  allLabels,
  onClose,
}: {
  kind: RowKind;
  rowId: string;
  current: RowLabel[];
  allLabels: readonly RowLabel[];
  onClose: () => void;
}) {
  const nameId = useId();
  const [selected, setSelected] = useState(() => new Set(current.map((l) => l.id)));
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createLabelAction(name, color);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (result.id) {
        const id = result.id;
        setSelected((prev) => new Set(prev).add(id));
      }
      setName("");
    });
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await setRowLabelsAction(kind, rowId, [...selected]);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onClose();
    });
  };

  return (
    <Dialog open onClose={() => !pending && onClose()} title="Labels">
      {allLabels.length > 0 ? (
        <ul className="max-h-[40vh] space-y-2 overflow-y-auto pr-1">
          {allLabels.map((label) => (
            <li key={label.id}>
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.has(label.id)}
                  disabled={pending}
                  onChange={() => toggle(label.id)}
                />
                <LabelChip name={label.name} color={label.color} />
              </label>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No labels yet. Create the first one below.</p>
      )}

      <form
        className="mt-4 space-y-2 border-t border-border pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) create();
        }}
      >
        <Label htmlFor={nameId}>New label</Label>
        <div className="flex gap-2">
          <Input
            id={nameId}
            value={name}
            maxLength={40}
            placeholder="e.g. Project X"
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" variant="secondary" disabled={pending || !name.trim()}>
            Create
          </Button>
        </div>
        <LabelColorPicker value={color} disabled={pending} onChange={setColor} />
      </form>
      <FieldError>{error}</FieldError>

      <DialogActions>
        <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" disabled={pending} onClick={save}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/** A row's label chips, with a button to change them for users who can edit. */
export function RowLabels({
  kind,
  rowId,
  labels,
  allLabels,
  canWrite,
}: {
  kind: RowKind;
  rowId: string;
  labels: RowLabel[];
  allLabels: readonly RowLabel[];
  canWrite: boolean;
}) {
  const [editing, setEditing] = useState(false);

  if (labels.length === 0 && !canWrite) return null;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1">
      {labels.map((label) => (
        <LabelChip key={label.id} name={label.name} color={label.color} />
      ))}
      {canWrite ? (
        <button
          type="button"
          aria-label={labels.length > 0 ? "Change labels" : "Add labels"}
          title={labels.length > 0 ? "Change labels" : "Add labels"}
          onClick={() => setEditing(true)}
          className="inline-flex rounded p-0.5 text-muted opacity-40 hover:opacity-100 focus:outline-none focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent/50"
        >
          <Tag className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      {editing ? (
        <LabelPickerDialog
          kind={kind}
          rowId={rowId}
          current={labels}
          allLabels={allLabels}
          onClose={() => setEditing(false)}
        />
      ) : null}
    </div>
  );
}
