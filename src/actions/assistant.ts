"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import { setAssistantDisconnected } from "@/lib/assistant/connections";
import type { ActionResult } from "@/actions/result";

const PAGE = "/settings/ai-assistant";

/**
 * Turn AI assistant access on or off for the company. Not behind the billing
 * check in `mutate`: people must always be able to turn sharing off.
 */
export async function setAssistantAccess(enabled: boolean): Promise<ActionResult> {
  const authz = await requireActionPermission("settings:manage");
  if (!authz.ok) return authz;
  const companyId = authz.user.companyId;
  if (!companyId) return { ok: false, error: "Complete onboarding before using the dashboard." };

  await getDb()
    .update(companies)
    .set({ aiAssistantEnabled: enabled === true, updatedAt: new Date() })
    .where(eq(companies.id, companyId));
  await writeAudit({
    companyId,
    actorUserId: await ensureLocalUser(authz.user),
    action: "settings.ai_assistant",
    entityType: "company",
    entityId: companyId,
    meta: { enabled: enabled === true },
  });
  revalidatePath(PAGE);
  return { ok: true, id: companyId };
}

/** Stop one of your assistants reading Alfa, or let it back in. */
export async function setAssistantConnected(
  connectionId: string,
  connected: boolean,
): Promise<ActionResult> {
  const authz = await requireActionPermission("workspace:read");
  if (!authz.ok) return authz;
  const id = z.uuid().safeParse(connectionId);
  if (!id.success) return { ok: false, error: "That assistant wasn't found." };

  const localUserId = await ensureLocalUser(authz.user);
  const oauthClientId = await setAssistantDisconnected(localUserId, id.data, connected !== true);
  if (!oauthClientId) return { ok: false, error: "That assistant wasn't found." };

  await writeAudit({
    companyId: authz.user.companyId,
    actorUserId: localUserId,
    action: connected === true ? "assistant.reconnect" : "assistant.disconnect",
    entityType: "assistant_connection",
    entityId: id.data,
    meta: { oauthClientId },
  });
  revalidatePath(PAGE);
  return { ok: true, id: id.data };
}
