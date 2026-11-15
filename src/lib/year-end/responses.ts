import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { yearEndResponses } from "@/db/schema";
import { todayIsoDate } from "@/lib/dates";
import { allItems, type NoteResponse, type Notes } from "@/lib/year-end/notes";
import type { PackPeriod } from "@/lib/year-end/period";

export const MAX_EXPLANATION_LENGTH = 1000;

/** What the owner entered for one note item on the Year end page. */
export type NoteEntry = {
  key: string;
  confirmed: boolean;
  explanation: string;
  /** "" when not answered. */
  answer: "yes" | "no" | "";
};

function inPeriod(companyId: string, period: PackPeriod) {
  return and(
    eq(yearEndResponses.companyId, companyId),
    eq(yearEndResponses.periodFrom, period.from),
    eq(yearEndResponses.periodTo, period.to),
  );
}

/** The owner's stored confirmations, explanations and answers for a period, by note item. */
export async function loadNoteResponses(
  companyId: string,
  period: PackPeriod,
): Promise<Map<string, NoteResponse>> {
  const rows = await getDb().select().from(yearEndResponses).where(inPeriod(companyId, period));
  return new Map(
    rows.map((r) => [
      r.itemKey,
      {
        explanation: r.explanation,
        answer: r.answer,
        confirmedOn: r.confirmedAt ? todayIsoDate(r.confirmedAt) : null,
        confirmedValue: r.confirmedValue,
        clearedReason: r.clearedReason,
      },
    ]),
  );
}

/**
 * Store what the owner entered against the notes as they stand now. A tick is
 * recorded with the figure it vouches for, taken from `notes`, never from the
 * browser. Entries for items the notes no longer have are ignored.
 */
export async function saveNoteResponses(
  companyId: string,
  period: PackPeriod,
  notes: Notes,
  entries: NoteEntry[],
  userId: string,
): Promise<void> {
  const db = getDb();
  const items = new Map(allItems(notes).map((i) => [i.key, i]));
  const now = new Date();
  for (const entry of entries) {
    const item = items.get(entry.key);
    if (!item) continue;
    const confirmed = item.confirm != null && entry.confirmed;
    const shared = {
      explanation: item.explain
        ? entry.explanation.trim().slice(0, MAX_EXPLANATION_LENGTH) || null
        : null,
      answer: item.yesNo ? (entry.answer === "yes" ? true : entry.answer === "no" ? false : null) : null,
      updatedAt: now,
    };
    // A confirmation that still stands keeps its date; a new or renewed one is dated now.
    const confirmation = !confirmed
      ? {
          confirmedAt: null,
          confirmedByUserId: null,
          confirmedValue: null,
          // Unticking a confirmation that stood is the owner's choice, so there is nothing to explain.
          clearedReason: item.confirmedOn ? null : item.cleared,
        }
      : item.confirmedOn
        ? {}
        : {
            confirmedAt: now,
            confirmedByUserId: userId,
            confirmedValue: item.confirm!.value,
            clearedReason: null,
          };
    await db
      .insert(yearEndResponses)
      .values({
        companyId,
        periodFrom: period.from,
        periodTo: period.to,
        itemKey: item.key,
        ...shared,
        ...confirmation,
      })
      .onConflictDoUpdate({
        target: [
          yearEndResponses.companyId,
          yearEndResponses.periodFrom,
          yearEndResponses.periodTo,
          yearEndResponses.itemKey,
        ],
        set: { ...shared, ...confirmation },
      });
  }
}

/**
 * Remove stored confirmations whose figure has since changed, keeping the
 * reason so the owner is told why. Until this runs they already count as not
 * confirmed, so the page and the workbook never show one that does not stand.
 */
export async function clearStaleConfirmations(
  companyId: string,
  period: PackPeriod,
  notes: Notes,
): Promise<number> {
  const stale = allItems(notes).filter((i) => i.stale);
  const db = getDb();
  for (const item of stale) {
    await db
      .update(yearEndResponses)
      .set({
        confirmedAt: null,
        confirmedByUserId: null,
        confirmedValue: null,
        clearedReason: item.cleared,
        updatedAt: new Date(),
      })
      .where(and(inPeriod(companyId, period), eq(yearEndResponses.itemKey, item.key)));
  }
  return stale.length;
}
