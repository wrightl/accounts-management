"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountantQueries, accountantQueryMessages } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import { can } from "@/lib/roles";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { isUuid } from "@/lib/labels/params";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";
import { raiseQuerySchema, replyToQuerySchema } from "@/lib/queries/schema";
import { findQueryRecord } from "@/lib/queries/records";
import type { NotifyPayload } from "@/lib/notifications/types";
import type { ActionResult } from "./result";

const NOT_FOUND: ActionResult = { ok: false, error: "Query not found" };

/** The change is already saved, so a failed notification mustn't report the action as failed. */
async function notifySafely(run: () => Promise<unknown>): Promise<void> {
  try {
    await run();
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "accountant_query.notify_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/** Notifications carry the subject and a link. Only the email for a new query adds the message. */
function queryNotice(
  companyId: string,
  queryId: string,
  type: "accountant_query.raised" | "accountant_query.replied",
  title: string,
  subject: string,
): NotifyPayload {
  return {
    companyId,
    type,
    title,
    body: subject,
    href: `/queries/${queryId}`,
    entityType: "accountant_query",
    entityId: queryId,
  };
}

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
    async ({ companyId, localUserId, session }) => {
      const parsed = parseWithFieldErrors(replyToQuerySchema, input);
      if (!parsed.ok) return parsed;

      const fromAccountant = can(session.role, "queries:raise");
      // Checking "not closed" in the update means a close can't slip in before the reply.
      const query = await getDb().transaction(async (tx) => {
        const [row] = await tx
          .update(accountantQueries)
          .set({ status: fromAccountant ? "open" : "answered", updatedAt: sql`now()` })
          .where(
            and(
              eq(accountantQueries.id, queryId),
              eq(accountantQueries.companyId, companyId),
              ne(accountantQueries.status, "closed"),
            ),
          )
          .returning({
            subject: accountantQueries.subject,
            raisedByUserId: accountantQueries.raisedByUserId,
          });
        if (!row) return null;
        await tx.insert(accountantQueryMessages).values({
          companyId,
          queryId,
          authorUserId: localUserId,
          body: parsed.data.body,
        });
        return row;
      });
      if (!query) return { ok: false, error: "This query is closed. Reopen it to reply." };

      await notifySafely(async () => {
        const { notify, notifyUsers } = await import("@/lib/notifications");
        const notice = queryNotice(
          companyId,
          queryId,
          "accountant_query.replied",
          fromAccountant ? "Your accountant replied to a query" : "Reply to your query",
          query.subject,
        );
        if (fromAccountant) await notify(notice);
        else if (query.raisedByUserId) await notifyUsers([query.raisedByUserId], notice);
        // Whoever raised it has left, so tell whichever accountant is there now.
        else await notify({ ...notice, roles: ["accountant"] });
      });
      return { ok: true, id: queryId };
    },
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
