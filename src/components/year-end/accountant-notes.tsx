"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveYearEndNotes, saveYearEndStartDate } from "@/actions/year-end";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import {
  NOTHING_TO_REPORT,
  hasContent,
  type NoteItem,
  type NoteLine,
  type NotesSection,
} from "@/lib/year-end/notes";
import { cellText, type PackCell } from "@/lib/year-end/sheets";

type Entry = { confirmed: boolean; explanation: string; answer: "yes" | "no" | "" };

const MAX_EXPLANATION_LENGTH = 1000;

function isNumeric(cell: PackCell | undefined): boolean {
  return cell != null && typeof cell !== "string" && (cell.kind === "money" || cell.kind === "number");
}

function Cell({ cell }: { cell: PackCell | undefined }) {
  const bold = cell != null && typeof cell !== "string" && cell.bold;
  return <span className={bold ? "font-medium" : undefined}>{cellText(cell ?? null)}</span>;
}

/** One row of a note, shown as the workbook writes it. */
function Line({ line }: { line: NoteLine }) {
  if (line.kind === "question") {
    return <p className="font-medium">Question: {line.text}</p>;
  }
  if (line.kind === "response") {
    return <p className="text-muted">{line.text}</p>;
  }
  if (line.kind === "figure") {
    return (
      <p className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <span>{line.label}</span>
        <span className="tabular-nums">
          <Cell cell={line.value} />
          {line.where ? <span className="ml-3 text-muted">{line.where}</span> : null}
        </span>
      </p>
    );
  }
  if (line.kind === "table") {
    // The same rule the workbook uses: a column no row fills is left out, unless it is kept.
    const columns = line.columns.filter(
      (c) =>
        c.keep ||
        line.rows.some((r) => {
          const text = cellText(r[c.key] ?? null);
          return text !== "" && text !== "0" && text !== "0.00";
        }),
    );
    return (
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1.5 align-bottom font-medium first:pl-0">
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {line.rows.map((row, i) => (
              <tr key={i} className="border-b border-border/60 align-top">
                {columns.map((c) => (
                  <td
                    key={c.key}
                    className={`px-2 py-1.5 first:pl-0 ${isNumeric(row[c.key]) ? "tabular-nums" : ""}`}
                  >
                    <Cell cell={row[c.key]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p>{line.text}</p>;
}

/**
 * Step 3 of Year end: the Notes for the accountant as the workbook will show
 * them, with a tick box, a text box or a yes/no beside each item that takes one.
 */
export function AccountantNotes({
  period,
  sections,
  canEdit,
  canSetStartDate,
  startDate,
}: {
  period: { from: string; to: string };
  sections: NotesSection[];
  /** Whether this person may save responses (they can download the pack). */
  canEdit: boolean;
  canSetStartDate: boolean;
  /** Set when the business has no date of incorporation (or date trading started) yet. */
  startDate: { label: string; missing: boolean };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [dateValue, setDateValue] = useState("");
  const [dateError, setDateError] = useState<string | null>(null);

  const items = sections.flatMap((s) => s.notes.flatMap((n) => n.items));
  const [entries, setEntries] = useState<Record<string, Entry>>(() =>
    Object.fromEntries(
      items.map((i) => [
        i.key,
        {
          confirmed: i.confirmedOn != null,
          explanation: i.explanation ?? "",
          answer: i.answer == null ? "" : i.answer ? "yes" : "no",
        },
      ]),
    ),
  );
  const entryOf = (item: NoteItem): Entry =>
    entries[item.key] ?? { confirmed: false, explanation: "", answer: "" };
  const change = (key: string, patch: Partial<Entry>) => {
    setSaved(false);
    setEntries((all) => ({
      ...all,
      [key]: { ...(all[key] ?? { confirmed: false, explanation: "", answer: "" }), ...patch },
    }));
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveYearEndNotes(
        period.from,
        period.to,
        items.map((i) => ({ key: i.key, ...entryOf(i) })),
      );
      if (result.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  };

  const saveDate = () => {
    setDateError(null);
    startTransition(async () => {
      const result = await saveYearEndStartDate(dateValue);
      if (result.ok) router.refresh();
      else setDateError(result.error);
    });
  };

  const id = (item: NoteItem, part: string) => `note-${part}-${items.indexOf(item)}`;

  return (
    <div className="space-y-4">
      {startDate.missing ? (
        <Card className="border-amber-300 p-5 text-sm">
          <p className="font-medium">{startDate.label} is needed</p>
          <p className="mt-1 text-muted">
            The notes separate costs dated before it, because your accountant treats those
            differently. Without it they are shown with earlier periods.
          </p>
          {canSetStartDate ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="year-end-start-date">{startDate.label}</Label>
                <Input
                  id="year-end-start-date"
                  type="date"
                  value={dateValue}
                  disabled={pending}
                  onChange={(e) => setDateValue(e.target.value)}
                />
              </div>
              <Button type="button" variant="ghost" disabled={pending || !dateValue} onClick={saveDate}>
                Save date
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-muted">Ask an admin to add it in Business settings.</p>
          )}
          <FieldError id="year-end-start-date-error">{dateError}</FieldError>
        </Card>
      ) : null}

      {sections.map((section) => (
        <Card key={section.letter} className="p-5 text-sm">
          <h3 className="font-medium">
            {section.letter}. {section.title}
          </h3>
          {!hasContent(section) ? <p className="mt-2 text-muted">{NOTHING_TO_REPORT}</p> : null}
          {section.notes.map((note, n) => (
            <div key={n} className="mt-3 space-y-2">
              {note.lines.map((line, l) => (
                <Line key={l} line={line} />
              ))}
              {note.items.length > 0 ? (
                <div className="space-y-3 rounded-xl bg-wash p-3">
                  {note.items.map((item) => {
                    const entry = entryOf(item);
                    return (
                      <div key={item.key}>
                        <p className="font-medium">{item.label}</p>
                        {item.cleared && !entry.confirmed ? (
                          <p className="mt-1 text-amber-900" role="status">
                            {item.cleared}
                          </p>
                        ) : null}
                        {item.confirm ? (
                          <label className="mt-1 flex items-start gap-2">
                            <input
                              type="checkbox"
                              className="mt-0.5"
                              checked={entry.confirmed}
                              disabled={!canEdit || pending}
                              onChange={(e) => change(item.key, { confirmed: e.target.checked })}
                            />
                            <span>{item.confirm.text}</span>
                          </label>
                        ) : null}
                        {item.yesNo ? (
                          <fieldset className="mt-1">
                            <legend>{item.yesNo}</legend>
                            <div className="mt-1 flex gap-4">
                              {(["yes", "no"] as const).map((answer) => (
                                <label key={answer} className="flex items-center gap-2">
                                  <input
                                    type="radio"
                                    name={id(item, "answer")}
                                    checked={entry.answer === answer}
                                    disabled={!canEdit || pending}
                                    onChange={() => change(item.key, { answer })}
                                  />
                                  {answer === "yes" ? "Yes" : "No"}
                                </label>
                              ))}
                            </div>
                          </fieldset>
                        ) : null}
                        {item.explain ? (
                          <div className="mt-2">
                            <label htmlFor={id(item, "explanation")} className="text-muted">
                              {item.yesNo
                                ? "Details (optional)"
                                : item.key === "general"
                                  ? "Note for your accountant (optional)"
                                  : "Explanation for your accountant (optional)"}
                            </label>
                            <Textarea
                              id={id(item, "explanation")}
                              className="mt-1 min-h-[44px]"
                              rows={item.key === "general" ? 4 : 1}
                              maxLength={MAX_EXPLANATION_LENGTH}
                              value={entry.explanation}
                              disabled={!canEdit || pending}
                              onChange={(e) => change(item.key, { explanation: e.target.value })}
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          ))}
        </Card>
      ))}

      {canEdit ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" disabled={pending} onClick={save}>
            {pending ? "Saving…" : "Save notes"}
          </Button>
          {saved && !pending ? (
            <p className="text-sm text-muted" role="status">
              Saved. The workbook will show these.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted">Your role can&apos;t change these notes.</p>
      )}
      <FieldError id="year-end-notes-error">{error}</FieldError>
    </div>
  );
}
