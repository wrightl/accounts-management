import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, orders } from "@/db/schema";
import { FORM_FIELD_ERROR_SUMMARY } from "@/lib/validation/field-errors";

export type ExpenseProjectResult =
  | { ok: true; clientId: string | null; orderId: string | null }
  | { ok: false; error: string; fieldErrors: Record<string, string> };

/**
 * Check the client and order an expense is tagged to belong to this company.
 * An order wins over a client: the expense takes the order's client. A
 * rebillable expense needs a client to recharge.
 */
export async function resolveExpenseProject(
  companyId: string,
  input: { billable: boolean; clientId: string | null; orderId: string | null },
): Promise<ExpenseProjectResult> {
  const db = getDb();
  let clientId = input.clientId;
  if (input.orderId) {
    const [order] = await db
      .select({ clientId: orders.clientId })
      .from(orders)
      .where(and(eq(orders.id, input.orderId), eq(orders.companyId, companyId)))
      .limit(1);
    if (!order) {
      return {
        ok: false,
        error: FORM_FIELD_ERROR_SUMMARY,
        fieldErrors: { orderId: "Choose an order" },
      };
    }
    clientId = order.clientId;
  } else if (clientId) {
    const [client] = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, clientId), eq(clients.companyId, companyId)))
      .limit(1);
    if (!client) {
      return {
        ok: false,
        error: FORM_FIELD_ERROR_SUMMARY,
        fieldErrors: { clientId: "Choose a client" },
      };
    }
  }
  if (input.billable && !clientId) {
    return {
      ok: false,
      error: FORM_FIELD_ERROR_SUMMARY,
      fieldErrors: { clientId: "Choose the client to recharge" },
    };
  }
  return { ok: true, clientId, orderId: input.orderId };
}
