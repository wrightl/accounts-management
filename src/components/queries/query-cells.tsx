import { RecordQueryIcon } from "@/components/queries/record-query-icon";
import { TD, TH } from "@/components/ui/table";
import type { QueryRecordKind, RecordQuery } from "@/lib/queries/status";

/** Leading column for the query icon. Render only when a row can show one. */
export function QueryHeaderCell() {
  return (
    <TH className="w-8 pr-0">
      <span className="sr-only">Queries</span>
    </TH>
  );
}

export function QueryCell({
  kind,
  id,
  queries,
  canRaise,
}: {
  kind: QueryRecordKind;
  id: string;
  queries?: readonly RecordQuery[];
  canRaise: boolean;
}) {
  return (
    <TD className="w-8 pr-0">
      <RecordQueryIcon recordKind={kind} recordId={id} queries={queries} canRaise={canRaise} />
    </TD>
  );
}
