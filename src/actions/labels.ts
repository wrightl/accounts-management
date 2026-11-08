"use server";

import { mutate } from "@/lib/mutate";
import type { ActionResult } from "@/actions/result";
import { isLabelColor } from "@/lib/labels/colors";
import { isUuid } from "@/lib/labels/params";
import {
  addLabelsToBankRows,
  createLabel,
  deleteLabel,
  setRowLabels,
  setRowNote,
  updateLabel,
  type RowKind,
} from "@/lib/labels/queries";

const LABEL_PATHS = ["/transactions", "/expenses"];

function rowAuditNames(kind: RowKind) {
  return kind === "bank"
    ? { prefix: "bank", entityType: "bank_transaction", path: "/transactions" }
    : { prefix: "expense", entityType: "expense", path: "/expenses" };
}

export async function createLabelAction(name: string, color: string): Promise<ActionResult> {
  if (!isLabelColor(color)) return { ok: false, error: "Choose a colour" };
  return mutate(
    "accounts:write",
    async ({ companyId }) => createLabel(companyId, { name, color }),
    { audit: { action: "label.create", entityType: "label", meta: { name, color } }, paths: LABEL_PATHS },
  );
}

export async function updateLabelAction(
  labelId: string,
  name: string,
  color: string,
): Promise<ActionResult> {
  if (!isUuid(labelId)) return { ok: false, error: "Label not found" };
  if (!isLabelColor(color)) return { ok: false, error: "Choose a colour" };
  return mutate(
    "accounts:write",
    async ({ companyId }) => updateLabel(companyId, labelId, { name, color }),
    { audit: { action: "label.update", entityType: "label", entityId: labelId, meta: { name, color } }, paths: LABEL_PATHS },
  );
}

export async function deleteLabelAction(labelId: string): Promise<ActionResult> {
  if (!isUuid(labelId)) return { ok: false, error: "Label not found" };
  return mutate(
    "accounts:write",
    async ({ companyId }) => deleteLabel(companyId, labelId),
    { audit: { action: "label.delete", entityType: "label", entityId: labelId }, paths: LABEL_PATHS },
  );
}

export async function setRowLabelsAction(
  kind: RowKind,
  rowId: string,
  labelIds: string[],
): Promise<ActionResult> {
  if (!isUuid(rowId)) return { ok: false, error: "Row not found" };
  if (!labelIds.every(isUuid)) return { ok: false, error: "Label not found" };
  const names = rowAuditNames(kind);
  return mutate(
    "accounts:write",
    async ({ companyId }) => setRowLabels(companyId, kind, rowId, labelIds),
    {
      audit: {
        action: `${names.prefix}.set_labels`,
        entityType: names.entityType,
        entityId: rowId,
        meta: { labelIds },
      },
      paths: [names.path],
    },
  );
}

/** Add labels to several bank transactions at once, keeping their existing labels. */
export async function addBankLabelsAction(
  rowIds: string[],
  labelIds: string[],
): Promise<ActionResult> {
  if (!rowIds.every(isUuid)) return { ok: false, error: "Row not found" };
  if (!labelIds.every(isUuid)) return { ok: false, error: "Label not found" };
  return mutate(
    "accounts:write",
    async ({ companyId }) => addLabelsToBankRows(companyId, rowIds, labelIds),
    {
      audit: {
        action: "bank.add_labels",
        entityType: "bank_transaction",
        meta: { count: new Set(rowIds).size, labelIds },
      },
      paths: ["/transactions"],
    },
  );
}

/** The audit entry records that the note changed and who can see it, never what it says. */
export async function setRowNoteAction(
  kind: RowKind,
  rowId: string,
  note: string | null,
  sharedWithAccountant = false,
): Promise<ActionResult> {
  if (!isUuid(rowId)) return { ok: false, error: "Row not found" };
  const names = rowAuditNames(kind);
  const hasNote = Boolean(note?.trim());
  const shared = hasNote && sharedWithAccountant === true;
  return mutate(
    "accounts:write",
    async ({ companyId }) => setRowNote(companyId, kind, rowId, note, shared),
    {
      audit: {
        action: `${names.prefix}.${hasNote ? "update_note" : "delete_note"}`,
        entityType: names.entityType,
        entityId: rowId,
        ...(hasNote ? { meta: { sharedWithAccountant: shared } } : {}),
      },
      paths: [names.path],
    },
  );
}
