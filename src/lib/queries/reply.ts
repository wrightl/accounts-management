import "server-only";
import { and, eq, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accountantQueries, accountantQueryMessages } from "@/db/schema";
import { can, type Role } from "@/lib/roles";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";
import { replyToQuerySchema } from "@/lib/queries/schema";
import type { NotifyPayload } from "@/lib/notifications/types";
import type { ActionResult } from "@/actions/result";

/** The change is already saved, so a failed notification mustn't report the action as failed. */
export async function notifySafely(run: () => Promise<unknown>): Promise<void> {
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
export function queryNotice(
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

/**
 * Add a reply to an open query and tell the other side. A reply from the
 * accountant reopens it for the team; one from the team marks it answered.
 * The web action and the mobile route both call this.
 */
export async function replyToQueryFor(
  ctx: { companyId: string; localUserId: string; role: Role },
  queryId: string,
  input: { body: string },
): Promise<ActionResult> {
  const { companyId, localUserId } = ctx;
  const parsed = parseWithFieldErrors(replyToQuerySchema, input);
  if (!parsed.ok) return parsed;

  const fromAccountant = can(ctx.role, "queries:raise");
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
}
