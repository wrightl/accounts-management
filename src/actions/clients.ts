"use server";

import { revalidatePath } from "next/cache";
import { and, eq} from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { requireActionPermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";
import type { ActionResult } from "@/actions/result";

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : v));

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  companyName: optionalText.pipe(z.string().max(200).nullable()),
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  addressLines: optionalText,
  notes: optionalText,
});

export async function createClient(formData: FormData): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: formData.get("email") ?? "",
    addressLines: formData.get("addressLines") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  const [row] = await db
    .insert(clients)
    .values({
      companyId,
        name: parsed.data.name,
      companyName: parsed.data.companyName,
      email: parsed.data.email,
      addressLines: parsed.data.addressLines,
      notes: parsed.data.notes,
    })
    .returning({ id: clients.id });

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "client.create",
    entityType: "client",
    entityId: row.id,
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true, id: row.id };
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: formData.get("email") ?? "",
    addressLines: formData.get("addressLines") ?? "",
    notes: formData.get("notes") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const db = getDb();
  await db
    .update(clients)
    .set({
      name: parsed.data.name,
      companyName: parsed.data.companyName,
      email: parsed.data.email,
      addressLines: parsed.data.addressLines,
      notes: parsed.data.notes,
    })
    .where(and(eq(clients.id, id), eq(clients.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "client.update",
    entityType: "client",
    entityId: id,
  });

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  return { ok: true, id };
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const authz = await requireActionPermission("accounts:write");
  if (!authz.ok) return authz;
  if (!authz.user.companyId) {
    return { ok: false, error: "Complete onboarding before using the dashboard." };
  }
  const companyId = authz.user.companyId;

  const session = authz.user;
  const localUserId = await ensureLocalUser(session);

  const db = getDb();
  const linked = await db
    .select({ id: invoices.id })
    .from(invoices)
    .where(eq(invoices.clientId, id))
    .limit(1);

  if (linked[0]) {
    return {
      ok: false,
      error: "Cannot delete a client that has invoices. Void or reassign them first.",
    };
  }

  await db.delete(clients).where(and(eq(clients.id, id), eq(clients.companyId, companyId)));

  await writeAudit({
    companyId,
    actorUserId: localUserId,
    action: "client.delete",
    entityType: "client",
    entityId: id,
  });

  revalidatePath("/clients");
  revalidatePath("/dashboard");
  return { ok: true };
}
