import "server-only";
import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  bankAccounts,
  bankTransactionLabels,
  bankTransactions,
  expenseLabels,
  expenses,
  labels,
} from "@/db/schema";
import { isUniqueViolation } from "@/lib/db-errors";
import type { LabelColor } from "@/lib/labels/colors";
import { MAX_NOTE_LENGTH } from "@/lib/labels/params";

const MAX_LABEL_NAME_LENGTH = 40;

export type RowKind = "bank" | "expense";

export type RowLabel = {
  id: string;
  name: string;
  color: LabelColor;
};

export type LabelWithUsage = RowLabel & { usageCount: number };

type LabelResult = { ok: true; id: string } | { ok: false; error: string };
type RowResult = { ok: true } | { ok: false; error: string };

function normalizeLabelName(value: string): string {
  return value.trim().slice(0, MAX_LABEL_NAME_LENGTH);
}

function duplicateNameError(name: string): string {
  return `A label called "${name}" already exists`;
}

export async function listLabels(companyId: string): Promise<LabelWithUsage[]> {
  const db = getDb();
  const [rows, bankUsage, expenseUsage] = await Promise.all([
    db
      .select({ id: labels.id, name: labels.name, color: labels.color })
      .from(labels)
      .where(eq(labels.companyId, companyId))
      .orderBy(sql`lower(${labels.name})`),
    db
      .select({ labelId: bankTransactionLabels.labelId, total: count() })
      .from(bankTransactionLabels)
      .innerJoin(labels, eq(bankTransactionLabels.labelId, labels.id))
      .where(eq(labels.companyId, companyId))
      .groupBy(bankTransactionLabels.labelId),
    db
      .select({ labelId: expenseLabels.labelId, total: count() })
      .from(expenseLabels)
      .innerJoin(labels, eq(expenseLabels.labelId, labels.id))
      .where(eq(labels.companyId, companyId))
      .groupBy(expenseLabels.labelId),
  ]);
  const usage = new Map<string, number>();
  for (const { labelId, total } of [...bankUsage, ...expenseUsage]) {
    usage.set(labelId, (usage.get(labelId) ?? 0) + total);
  }
  return rows.map((r) => ({
    ...r,
    color: r.color as LabelColor,
    usageCount: usage.get(r.id) ?? 0,
  }));
}

export async function createLabel(
  companyId: string,
  input: { name: string; color: LabelColor },
): Promise<LabelResult> {
  const name = normalizeLabelName(input.name);
  if (!name) return { ok: false, error: "Enter a label name" };
  const db = getDb();
  try {
    const [created] = await db
      .insert(labels)
      .values({ companyId, name, color: input.color })
      .returning({ id: labels.id });
    return { ok: true, id: created.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { ok: false, error: duplicateNameError(name) };
  }
}

export async function updateLabel(
  companyId: string,
  labelId: string,
  input: { name: string; color: LabelColor },
): Promise<LabelResult> {
  const name = normalizeLabelName(input.name);
  if (!name) return { ok: false, error: "Enter a label name" };
  const db = getDb();
  const [clash] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.companyId, companyId),
        ne(labels.id, labelId),
        sql`lower(${labels.name}) = ${name.toLowerCase()}`,
      ),
    )
    .limit(1);
  if (clash) return { ok: false, error: duplicateNameError(name) };
  try {
    const [updated] = await db
      .update(labels)
      .set({ name, color: input.color })
      .where(and(eq(labels.id, labelId), eq(labels.companyId, companyId)))
      .returning({ id: labels.id });
    if (!updated) return { ok: false, error: "Label not found" };
    return { ok: true, id: updated.id };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    return { ok: false, error: duplicateNameError(name) };
  }
}

/** Also takes the label off every row that uses it. */
export async function deleteLabel(companyId: string, labelId: string): Promise<LabelResult> {
  const db = getDb();
  const [deleted] = await db
    .delete(labels)
    .where(and(eq(labels.id, labelId), eq(labels.companyId, companyId)))
    .returning({ id: labels.id });
  if (!deleted) return { ok: false, error: "Label not found" };
  return { ok: true, id: deleted.id };
}

async function rowBelongsToCompany(
  companyId: string,
  kind: RowKind,
  rowId: string,
): Promise<boolean> {
  const db = getDb();
  if (kind === "expense") {
    const [row] = await db
      .select({ id: expenses.id })
      .from(expenses)
      .where(and(eq(expenses.id, rowId), eq(expenses.companyId, companyId)))
      .limit(1);
    return Boolean(row);
  }
  const [row] = await db
    .select({ id: bankTransactions.id })
    .from(bankTransactions)
    .innerJoin(bankAccounts, eq(bankTransactions.bankAccountId, bankAccounts.id))
    .where(and(eq(bankTransactions.id, rowId), eq(bankAccounts.companyId, companyId)))
    .limit(1);
  return Boolean(row);
}

/** Replace a row's labels. Not a financial change, so period locks don't apply. */
export async function setRowLabels(
  companyId: string,
  kind: RowKind,
  rowId: string,
  labelIds: string[],
): Promise<RowResult> {
  if (!(await rowBelongsToCompany(companyId, kind, rowId))) {
    return { ok: false, error: "Row not found" };
  }
  const db = getDb();
  const uniqueIds = [...new Set(labelIds)];
  if (uniqueIds.length > 0) {
    const owned = await db
      .select({ id: labels.id })
      .from(labels)
      .where(and(eq(labels.companyId, companyId), inArray(labels.id, uniqueIds)));
    if (owned.length !== uniqueIds.length) return { ok: false, error: "Label not found" };
  }
  await db.transaction(async (tx) => {
    if (kind === "expense") {
      await tx.delete(expenseLabels).where(eq(expenseLabels.expenseId, rowId));
      if (uniqueIds.length > 0) {
        await tx
          .insert(expenseLabels)
          .values(uniqueIds.map((labelId) => ({ expenseId: rowId, labelId })));
      }
    } else {
      await tx.delete(bankTransactionLabels).where(eq(bankTransactionLabels.bankTransactionId, rowId));
      if (uniqueIds.length > 0) {
        await tx
          .insert(bankTransactionLabels)
          .values(uniqueIds.map((labelId) => ({ bankTransactionId: rowId, labelId })));
      }
    }
  });
  return { ok: true };
}

/** Save a row's note; an empty one removes it. Not a financial change, so period locks don't apply. */
export async function setRowNote(
  companyId: string,
  kind: RowKind,
  rowId: string,
  note: string | null,
): Promise<RowResult> {
  const value = note?.trim() || null;
  if (value && value.length > MAX_NOTE_LENGTH) {
    return { ok: false, error: `Notes can be up to ${MAX_NOTE_LENGTH} characters` };
  }
  if (!(await rowBelongsToCompany(companyId, kind, rowId))) {
    return { ok: false, error: "Row not found" };
  }
  const db = getDb();
  if (kind === "expense") {
    await db
      .update(expenses)
      .set({ notes: value })
      .where(and(eq(expenses.id, rowId), eq(expenses.companyId, companyId)));
  } else {
    await db.update(bankTransactions).set({ notes: value }).where(eq(bankTransactions.id, rowId));
  }
  return { ok: true };
}

function groupLabels<T extends { rowId: string; id: string; name: string; color: string }>(
  rows: T[],
): Map<string, RowLabel[]> {
  const byRow = new Map<string, RowLabel[]>();
  for (const { rowId, id, name, color } of rows) {
    const list = byRow.get(rowId) ?? [];
    list.push({ id, name, color: color as LabelColor });
    byRow.set(rowId, list);
  }
  return byRow;
}

/** Callers pass ids they have already scoped to the company. */
export async function labelsForBankTransactions(ids: string[]): Promise<Map<string, RowLabel[]>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      rowId: bankTransactionLabels.bankTransactionId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(bankTransactionLabels)
    .innerJoin(labels, eq(bankTransactionLabels.labelId, labels.id))
    .where(inArray(bankTransactionLabels.bankTransactionId, ids))
    .orderBy(asc(sql`lower(${labels.name})`));
  return groupLabels(rows);
}

/** Callers pass ids they have already scoped to the company. */
export async function labelsForExpenses(ids: string[]): Promise<Map<string, RowLabel[]>> {
  if (ids.length === 0) return new Map();
  const rows = await getDb()
    .select({
      rowId: expenseLabels.expenseId,
      id: labels.id,
      name: labels.name,
      color: labels.color,
    })
    .from(expenseLabels)
    .innerJoin(labels, eq(expenseLabels.labelId, labels.id))
    .where(inArray(expenseLabels.expenseId, ids))
    .orderBy(asc(sql`lower(${labels.name})`));
  return groupLabels(rows);
}
