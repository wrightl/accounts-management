"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { mutate } from "@/lib/mutate";
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

function parseClientForm(formData: FormData) {
  return clientSchema.safeParse({
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: formData.get("email") ?? "",
    addressLines: formData.get("addressLines") ?? "",
    notes: formData.get("notes") ?? "",
  });
}

export async function createClient(formData: FormData): Promise<ActionResult> {
  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
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
      return { ok: true, id: row.id };
    },
    {
      audit: { action: "client.create", entityType: "client" },
      paths: ["/clients", "/dashboard"],
    },
  );
}

export async function updateClient(
  id: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = parseClientForm(formData);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  return mutate(
    "accounts:write",
    async ({ companyId }) => {
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
      return { ok: true, id };
    },
    {
      audit: { action: "client.update", entityType: "client", entityId: id },
      paths: ["/clients", `/clients/${id}`],
    },
  );
}

export async function deleteClient(id: string): Promise<ActionResult> {
  return mutate(
    "accounts:write",
    async ({ companyId }) => {
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
      return { ok: true };
    },
    {
      audit: { action: "client.delete", entityType: "client", entityId: id },
      paths: ["/clients", "/dashboard"],
    },
  );
}
