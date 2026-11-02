export const QUERY_STATUSES = ["open", "answered", "closed"] as const;
export type QueryStatus = (typeof QUERY_STATUSES)[number];

export const QUERY_RECORD_KINDS = [
  "invoice",
  "credit_note",
  "expense",
  "reimbursement",
  "bank_transaction",
  "dividend_declaration",
  "shareholder",
  "recurring_invoice",
] as const;
export type QueryRecordKind = (typeof QUERY_RECORD_KINDS)[number];

/** A query as shown on a record list. */
export type RecordQuery = { id: string; subject: string; status: QueryStatus };

/** Most urgent first: an answer is what the accountant acts on, a waiting query is what the team acts on. */
const ACCOUNTANT_URGENCY: readonly QueryStatus[] = ["answered", "open", "closed"];
const TEAM_URGENCY: readonly QueryStatus[] = ["open", "answered", "closed"];

/** The state a record's icon shows, or null if it has no queries. */
export function shownQueryStatus(
  queries: readonly RecordQuery[],
  canRaise: boolean,
): QueryStatus | null {
  const urgency = canRaise ? ACCOUNTANT_URGENCY : TEAM_URGENCY;
  return urgency.find((status) => queries.some((q) => q.status === status)) ?? null;
}

/** Tooltip and screen-reader text for a record's icon. */
export function recordQueryLabel(queries: readonly RecordQuery[], canRaise: boolean): string {
  const status = shownQueryStatus(queries, canRaise);
  if (!status) return "Raise a query";
  const label = queryStatusLabel(status);
  if (queries.length === 1) return `Query: ${label}`;
  const count = queries.filter((q) => q.status === status).length;
  return `${queries.length} queries, ${count} ${label.toLowerCase()}`;
}

export function isQueryStatus(value: unknown): value is QueryStatus {
  return typeof value === "string" && (QUERY_STATUSES as readonly string[]).includes(value);
}

export function queryStatusLabel(status: QueryStatus): string {
  switch (status) {
    case "open":
      return "Waiting for the team";
    case "answered":
      return "Answered";
    case "closed":
      return "Closed";
  }
}
