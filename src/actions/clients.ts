"use server";

import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { mutate } from "@/lib/mutate";
import {
  clientRawFromFormData,
  parseClientInput,
} from "@/lib/clients/schema";
import type { ActionResult } from "@/actions/result";

export async function createClient(formData: FormData): Promise<ActionResult> {
  const parsed = parseClientInput(clientRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
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
  const parsed = parseClientInput(clientRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
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
