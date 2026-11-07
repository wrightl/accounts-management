"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { addBankLabelsAction } from "@/actions/labels";
import { ExplainCreditDialog } from "@/components/bank/bank-ui";
import { LabelPickerDialog } from "@/components/labels/row-labels";
import { Button } from "@/components/ui/button";
import type { RowLabel } from "@/lib/labels/queries";

export type SelectableBankRow = {
  id: string;
  /** Incoming and not yet reconciled, so it can be explained. */
  needsExplanation: boolean;
};

type Selection = {
  rows: readonly SelectableBankRow[];
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  setAll: (on: boolean) => void;
  clear: () => void;
};

const SelectionContext = createContext<Selection | null>(null);

/**
 * Holds which transactions on this page are ticked. Key it on the list's
 * params so a new page, filter or sort starts with nothing selected.
 */
export function BankSelectionProvider({
  rows,
  children,
}: {
  rows: readonly SelectableBankRow[];
  children: ReactNode;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());

  // Rows can drop off the page after a refresh; forget them.
  const present = new Set(rows.map((r) => r.id));
  const live = [...selected].every((id) => present.has(id))
    ? selected
    : new Set([...selected].filter((id) => present.has(id)));

  const value: Selection = {
    rows,
    selected: live,
    toggle: (id) =>
      setSelected((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      }),
    setAll: (on) => setSelected(on ? new Set(rows.map((r) => r.id)) : new Set()),
    clear: () => setSelected(new Set()),
  };
  return <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>;
}

/** Null outside a provider, so the table renders without checkboxes there. */
function useSelection() {
  return useContext(SelectionContext);
}

export function SelectAllCheckbox() {
  const selection = useSelection();
  const ref = useRef<HTMLInputElement>(null);
  const count = selection?.selected.size ?? 0;
  const total = selection?.rows.length ?? 0;

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = count > 0 && count < total;
  }, [count, total]);

  if (!selection) return null;
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label="Select all transactions on this page"
      checked={total > 0 && count === total}
      onChange={(e) => selection.setAll(e.target.checked)}
    />
  );
}

export function RowSelectCheckbox({ id, label }: { id: string; label: string }) {
  const selection = useSelection();
  if (!selection) return null;
  return (
    <input
      type="checkbox"
      aria-label={`Select ${label}`}
      checked={selection.selected.has(id)}
      onChange={() => selection.toggle(id)}
    />
  );
}

/** Actions for two or more ticked transactions, shown above the table. */
export function BankBulkActions({
  allLabels,
  incomeCategories,
}: {
  allLabels: readonly RowLabel[];
  incomeCategories: readonly string[];
}) {
  const router = useRouter();
  const selection = useSelection();
  const [dialog, setDialog] = useState<"labels" | "explain" | null>(null);

  if (!selection || selection.selected.size < 2) return null;
  const ids = [...selection.selected];
  const canExplain = selection.rows
    .filter((r) => selection.selected.has(r.id))
    .every((r) => r.needsExplanation);

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-sm text-muted">{ids.length} selected</span>
      <Button type="button" variant="secondary" onClick={() => setDialog("labels")}>
        Add labels
      </Button>
      {canExplain ? (
        <Button type="button" variant="secondary" onClick={() => setDialog("explain")}>
          Explain
        </Button>
      ) : null}
      <Button type="button" variant="ghost" onClick={selection.clear}>
        Clear
      </Button>
      {dialog === "labels" ? (
        <LabelPickerDialog
          current={[]}
          allLabels={allLabels}
          title={`Add labels to ${ids.length} transactions`}
          saveLabel="Add labels"
          onSave={async (labelIds) => {
            const result = await addBankLabelsAction(ids, labelIds);
            if (result.ok) {
              selection.clear();
              router.refresh();
            }
            return result;
          }}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "explain" ? (
        <ExplainCreditDialog
          open
          onClose={() => setDialog(null)}
          onSaved={selection.clear}
          transactionIds={ids}
          incomeCategories={incomeCategories}
        />
      ) : null}
    </div>
  );
}
