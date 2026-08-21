"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { requirePermission } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { ensureLocalUser } from "@/lib/users";

const clientSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  email: z
    .string()
    .trim()
    .email("Invalid email")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  addressLines: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  notes: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
});

export type ActionResult =
  | { ok: true; id?: string }
  | { ok: false; error: string };

export async function createClient(formData: FormData): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
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
      name: parsed.data.name,
      email: parsed.data.email,
      addressLines: parsed.data.addressLines,
      notes: parsed.data.notes,
    })
    .returning({ id: clients.id });

  await writeAudit({
    actorUserId: localUserId,
    action: "client.create",
    entityType: "client",
    entityId: row.id,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard");
  return { ok: true, id: row.id };
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
  const localUserId = await ensureLocalUser(session);

  const parsed = clientSchema.safeParse({
    name: formData.get("name"),
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
      email: parsed.data.email,
      addressLines: parsed.data.addressLines,
      notes: parsed.data.notes,
    })
    .where(eq(clients.id, id));

  await writeAudit({
    actorUserId: localUserId,
    action: "client.update",
    entityType: "client",
    entityId: id,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath(`/dashboard/clients/${id}`);
  return { ok: true, id };
}

export async function deleteClient(id: string): Promise<ActionResult> {
  const session = await requirePermission("accounts:write");
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

  await db.delete(clients).where(eq(clients.id, id));

  await writeAudit({
    actorUserId: localUserId,
    action: "client.delete",
    entityType: "client",
    entityId: id,
  });

  revalidatePath("/dashboard/clients");
  revalidatePath("/dashboard");
  return { ok: true };
}
