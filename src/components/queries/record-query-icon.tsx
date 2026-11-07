"use client";

import { MessageCircleCheck, MessageCircleQuestion } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { QueryStatusBadge } from "@/components/queries/query-status-badge";
import { RaiseQueryDialog } from "@/components/queries/raise-query-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import {
  recordQueryLabel,
  shownQueryStatus,
  type QueryRecordKind,
  type QueryStatus,
  type RecordQuery,
} from "@/lib/queries/status";
import { cn } from "@/lib/utils";

const ICON_STYLES: Record<QueryStatus, string> = {
  open: "fill-current/20 text-amber-600",
  answered: "fill-current/20 text-navy",
  closed: "text-muted",
};

const CONTROL_CLASSES =
  "inline-flex rounded p-0.5 align-middle hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/50";

/**
 * A record's query state on a list. Raises a query when there are none, opens the
 * thread when there's one, and lists them when there are several. Shows nothing
 * to someone who can't raise a query on a record without one.
 */
export function RecordQueryIcon({
  recordKind,
  recordId,
  queries = [],
  canRaise,
}: {
  recordKind: QueryRecordKind;
  recordId: string;
  queries?: readonly RecordQuery[];
  canRaise: boolean;
}) {
  const [dialog, setDialog] = useState<"raise" | "list" | null>(null);
  const status = shownQueryStatus(queries, canRaise);
  if (!status && !canRaise) return null;

  const label = recordQueryLabel(queries, canRaise);
  const Icon = status === "closed" ? MessageCircleCheck : MessageCircleQuestion;
  const icon = (
    <Icon className={cn("h-4 w-4", status ? ICON_STYLES[status] : "text-muted")} aria-hidden />
  );

  return (
    <>
      {queries.length === 1 ? (
        <Link
          href={`/queries/${queries[0].id}`}
          aria-label={label}
          title={label}
          className={CONTROL_CLASSES}
        >
          {icon}
        </Link>
      ) : (
        <button
          type="button"
          aria-label={label}
          title={label}
          onClick={() => setDialog(status ? "list" : "raise")}
          className={CONTROL_CLASSES}
        >
          {icon}
        </button>
      )}
      {dialog === "list" ? (
        <Dialog open onClose={() => setDialog(null)} title="Queries about this record">
          <ul className="space-y-2">
            {queries.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <Link href={`/queries/${q.id}`} className="font-medium text-foreground hover:underline">
                  {q.subject}
                </Link>
                <QueryStatusBadge status={q.status} />
              </li>
            ))}
          </ul>
          <DialogActions>
            <Button type="button" variant="ghost" onClick={() => setDialog(null)}>
              Close
            </Button>
            {canRaise ? (
              <Button type="button" onClick={() => setDialog("raise")}>
                Raise another
              </Button>
            ) : null}
          </DialogActions>
        </Dialog>
      ) : null}
      {dialog === "raise" ? (
        <RaiseQueryDialog
          recordKind={recordKind}
          recordId={recordId}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}
