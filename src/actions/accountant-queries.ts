"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountantQueries, accountantQueryMessages } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { isUuid } from "@/lib/labels/params";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";
import { raiseQuerySchema } from "@/lib/queries/schema";
import { notifySafely, queryNotice, replyToQueryFor } from "@/lib/queries/reply";
import { findQueryRecord } from "@/lib/queries/records";
import type { ActionResult } from "./result";

const NOT_FOUND: ActionResult = { ok: false, error: "Query not found" };

export async function raiseQuery(input: {
  subject: string;
  body: string;
  recordKind: string | null;
  recordId: string | null;
}): Promise<ActionResult> {
  return mutate(
    "queries:raise",
    async ({ companyId, localUserId, session }) => {
      const parsed = parseWithFieldErrors(raiseQuerySchema, input);
      if (!parsed.ok) return parsed;
      const { subject, body, recordKind, recordId } = parsed.data;

      let recordLabel: string | null = null;
      if (recordKind && recordId) {
        const record = await findQueryRecord(
          companyId,
          recordKind,
          recordId,
          recordScopeFor(session.role),
        );
        if (!record) return { ok: false, error: "Record not found" };
        recordLabel = record.label;
      }

      const queryId = await getDb().transaction(async (tx) => {
        const [query] = await tx
          .insert(accountantQueries)
          .values({
            companyId,
            subject,
            recordKind,
            recordId,
            recordLabel,
            raisedByUserId: localUserId,
          })
          .returning({ id: accountantQueries.id });
        await tx.insert(accountantQueryMessages).values({
          companyId,
          queryId: query.id,
          authorUserId: localUserId,
          body,
        });
        return query.id;
      });

      await notifySafely(async () => {
        const { notify } = await import("@/lib/notifications");
        await notify({
          ...queryNotice(companyId, queryId, "accountant_query.raised", "New accountant query", subject),
          emailBody: `${subject}\n\n${body}`,
          awaitEmail: true,
        });
      });
      return { ok: true, id: queryId };
    },
    { audit: { action: "query.raise", entityType: "accountant_query" }, paths: ["/queries"] },
  );
}

export async function replyToQuery(queryId: string, input: { body: string }): Promise<ActionResult> {
  if (!isUuid(queryId)) return NOT_FOUND;
  return mutate(
    "queries:read",
    ({ companyId, localUserId, session }) =>
      replyToQueryFor({ companyId, localUserId, role: session.role }, queryId, input),
    {
      audit: { action: "query.reply", entityType: "accountant_query", entityId: queryId },
      paths: ["/queries", `/queries/${queryId}`],
    },
  );
}

async function setClosed(
  queryId: string,
  closed: boolean,
  action: string,
  title: string,
): Promise<ActionResult> {
  if (!isUuid(queryId)) return NOT_FOUND;
  return mutate(
    "queries:raise",
    async ({ companyId }) => {
      const [row] = await getDb()
        .update(accountantQueries)
        .set({
          status: closed ? "closed" : "open",
          closedAt: closed ? sql`now()` : null,
          updatedAt: sql`now()`,
        })
        .where(
          and(
            eq(accountantQueries.id, queryId),
            eq(accountantQueries.companyId, companyId),
            closed ? ne(accountantQueries.status, "closed") : eq(accountantQueries.status, "closed"),
          ),
        )
        .returning({ subject: accountantQueries.subject });
      if (!row) return NOT_FOUND;

      await notifySafely(async () => {
        const { notify } = await import("@/lib/notifications");
        await notify(queryNotice(companyId, queryId, "accountant_query.raised", title, row.subject));
      });
      return { ok: true, id: queryId };
    },
    {
      audit: { action, entityType: "accountant_query", entityId: queryId },
      paths: ["/queries", `/queries/${queryId}`],
    },
  );
}

export async function closeQuery(queryId: string): Promise<ActionResult> {
  return setClosed(queryId, true, "query.close", "Your accountant closed a query");
}

export async function reopenQuery(queryId: string): Promise<ActionResult> {
  return setClosed(queryId, false, "query.reopen", "Your accountant reopened a query");
}
