"use client";

import { useState, useTransition } from "react";
import { Tag } from "lucide-react";
import { createLabelAction, deleteLabelAction, updateLabelAction } from "@/actions/labels";
import { LabelChip, LabelColorPicker } from "@/components/labels/label-chip";
import { useAlert } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { DEFAULT_LABEL_COLOR, type LabelColor } from "@/lib/labels/colors";
import type { LabelWithUsage } from "@/lib/labels/queries";

function usageText(count: number): string {
  if (count === 0) return "Not used yet";
  return `Used on ${count} ${count === 1 ? "row" : "rows"}`;
}

function ManagedLabelRow({
  label,
  onError,
}: {
  label: LabelWithUsage;
  onError: (message: string | null) => void;
}) {
  const { confirm } = useAlert();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState<LabelColor>(label.color);
  const [pending, startTransition] = useTransition();

  const save = () => {
    onError(null);
    startTransition(async () => {
      const result = await updateLabelAction(label.id, name, color);
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setEditing(false);
    });
  };

  const remove = async () => {
    const confirmed =
      label.usageCount === 0 ||
      (await confirm({
        title: `Delete "${label.name}"?`,
        message: `This removes the label from ${label.usageCount} ${label.usageCount === 1 ? "row" : "rows"}.`,
        confirmLabel: "Delete",
        variant: "destructive",
      }));
    if (!confirmed) return;
    onError(null);
    startTransition(async () => {
      const result = await deleteLabelAction(label.id);
      if (!result.ok) onError(result.error);
    });
  };

  if (editing) {
    return (
      <li className="space-y-2 py-3 first:pt-0 last:pb-0">
        <Input
          aria-label="Label name"
          value={name}
          maxLength={40}
          disabled={pending}
          onChange={(e) => setName(e.target.value)}
        />
        <LabelColorPicker value={color} disabled={pending} onChange={setColor} />
        <div className="flex gap-1">
          <Button type="button" disabled={pending || !name.trim()} onClick={save}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setName(label.name);
              setColor(label.color);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </li>
    );
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <LabelChip name={label.name} color={label.color} />
        <p className="mt-1 text-sm text-muted">{usageText(label.usageCount)}</p>
      </div>
      <div className="flex gap-1">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setEditing(true)}>
          Edit
        </Button>
        <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
          {pending ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </li>
  );
}

function ManageLabelsDialog({
  labels,
  onClose,
}: {
  labels: LabelWithUsage[];
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [color, setColor] = useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Dialog open onClose={onClose} title="Labels">
      <p className="text-sm text-muted">
        Labels are shared between transactions and expenses.
      </p>
      <form
        className="mt-4 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await createLabelAction(name, color);
            if (!result.ok) {
              setError(result.error);
              return;
            }
            setName("");
          });
        }}
      >
        <Label htmlFor="new-label">New label</Label>
        <div className="flex gap-2">
          <Input
            id="new-label"
            value={name}
            maxLength={40}
            placeholder="e.g. Project X"
            disabled={pending}
            onChange={(e) => setName(e.target.value)}
          />
          <Button type="submit" disabled={pending || !name.trim()}>
            {pending ? "Adding…" : "Add"}
          </Button>
        </div>
        <LabelColorPicker value={color} disabled={pending} onChange={setColor} />
      </form>
      <FieldError>{error}</FieldError>

      {labels.length > 0 ? (
        <ul className="mt-4 max-h-[50vh] divide-y divide-border overflow-y-auto pr-1">
          {labels.map((label) => (
            <ManagedLabelRow
              key={`${label.id}:${label.name}:${label.color}`}
              label={label}
              onError={setError}
            />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-muted">No labels yet.</p>
      )}

      <DialogActions>
        <Button type="button" variant="secondary" onClick={onClose}>
          Done
        </Button>
      </DialogActions>
    </Dialog>
  );
}

export function ManageLabelsButton({ labels }: { labels: LabelWithUsage[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="secondary" onClick={() => setOpen(true)}>
        <Tag className="h-4 w-4" aria-hidden />
        Labels
      </Button>
      {open ? <ManageLabelsDialog labels={labels} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
