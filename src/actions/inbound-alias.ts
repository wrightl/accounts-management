"use server";

import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { setInboundAlias } from "@/lib/expenses/inbound-mailbox";
import type { ActionResult } from "@/actions/result";

/** Rename the caller's own short address for emailing receipts to this company. */
export async function updateMyInboundAlias(alias: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId, localUserId }) => {
      const result = await setInboundAlias(localUserId, companyId, alias);
      if (!result.ok) return { ok: false, error: result.error, fieldErrors: { alias: result.error } };
      if (result.previous !== result.alias) {
        await writeAudit({
          companyId,
          actorUserId: localUserId,
          action: "inbound_alias.update",
          entityType: "user",
          entityId: localUserId,
          meta: { from: result.previous, to: result.alias },
        });
      }
      return { ok: true, id: localUserId };
    },
    { paths: ["/expenses"] },
  );
}
