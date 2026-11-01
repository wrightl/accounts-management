"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoices } from "@/db/schema";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import type { ActionResult } from "@/actions/result";

/** Turn reminders and overdue alerts on or off for one invoice. */
export async function setInvoiceChase(
  id: string,
  enabled: boolean,
): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const [updated] = await getDb()
        .update(invoices)
        .set({ chaseEnabled: enabled })
        .where(and(eq(invoices.id, id), eq(invoices.companyId, companyId)))
        .returning({ id: invoices.id });
      if (!updated) return { ok: false, error: "Invoice not found" };

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.chase_change",
        entityType: "invoice",
        entityId: id,
        meta: { enabled },
      });
      return { ok: true, id };
    },
    { paths: ["/invoices", `/invoices/${id}`, "/dashboard"] },
  );
}

/** Start chasing every open imported invoice that isn't being chased yet. */
export async function chaseAllImportedInvoices(): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const updated = await getDb()
        .update(invoices)
        .set({ chaseEnabled: true })
        .where(
          and(
            eq(invoices.companyId, companyId),
            eq(invoices.source, "import"),
            eq(invoices.status, "sent"),
            eq(invoices.chaseEnabled, false),
          ),
        )
        .returning({ id: invoices.id });

      await writeAudit({
        companyId,
        actorUserId: localUserId,
        action: "invoice.chase_change",
        entityType: "invoice",
        meta: { enabled: true, invoiceIds: updated.map((r) => r.id) },
      });
      return { ok: true };
    },
    { paths: ["/invoices", "/dashboard"] },
  );
}
