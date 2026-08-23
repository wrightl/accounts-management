"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rollbackQuote } from "@/actions/quotes";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError } from "@/components/ui/form";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

type HistoryRow = {
  version: number;
  versionLabel: string;
  source: string;
  grossFormatted: string;
  createdAt: Date;
  rolledBackFromVersion: number | null;
  actorName: string | null;
  isCurrent: boolean;
};

export function QuoteHistory({
  quoteId,
  currentVersion,
  canWrite,
  history,
}: {
  quoteId: string;
  currentVersion: number;
  canWrite: boolean;
  history: HistoryRow[];
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (history.length === 0) return null;

  return (
    <div className="mt-10">
      <h2 className="mb-3 font-display text-lg font-semibold">Version history</h2>
      <Table>
        <THead>
          <TR>
            <TH>Version</TH>
            <TH>Total</TH>
            <TH>Source</TH>
            <TH>When</TH>
            <TH>By</TH>
            <TH className="text-right">Actions</TH>
          </TR>
        </THead>
        <TBody>
          {history.map((row) => (
            <TR key={row.version}>
              <TD>
                {row.versionLabel}
                {row.isCurrent ? (
                  <span className="ml-2 text-xs text-muted">(current)</span>
                ) : null}
              </TD>
              <TD>{row.grossFormatted}</TD>
              <TD className="capitalize">
                {row.source}
                {row.rolledBackFromVersion
                  ? ` from ${row.rolledBackFromVersion}`
                  : null}
              </TD>
              <TD className="text-muted">
                {row.createdAt.toISOString().slice(0, 16).replace("T", " ")}
              </TD>
              <TD className="text-muted">{row.actorName ?? "—"}</TD>
              <TD className="text-right">
                <div className="flex justify-end gap-2">
                  {!row.isCurrent ? (
                    <Link
                      href={`/dashboard/quotes/${quoteId}/versions/${row.version}`}
                      className={buttonClasses("secondary")}
                    >
                      View
                    </Link>
                  ) : null}
                  {canWrite && !row.isCurrent ? (
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={pending}
                      onClick={async () => {
                        const ok = await confirm({
                          title: "Restore version",
                          message: `Restore version ${row.version}? This creates a new version ${currentVersion + 1} with that content.`,
                          confirmLabel: "Restore",
                        });
                        if (!ok) return;
                        setError(null);
                        startTransition(async () => {
                          const result = await rollbackQuote(quoteId, row.version);
                          if (!result.ok) setError(result.error);
                          else router.refresh();
                        });
                      }}
                    >
                      Restore
                    </Button>
                  ) : null}
                  {row.isCurrent ? <span className="text-muted">—</span> : null}
                </div>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
      <FieldError>{error}</FieldError>
    </div>
  );
}
